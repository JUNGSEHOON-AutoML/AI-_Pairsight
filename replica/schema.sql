-- Pairsight schema, first migration. Postgres on Supabase.
-- Access rules: row level security. Browsers read through RLS with the user's JWT.
-- Every write to analysis tables happens on the server with the service role.
-- Anonymous visitors get a Supabase anonymous user, so every check has a real user_id.

-- gen_random_uuid() is built into Postgres 13+, no extension needed.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- One row per auth user, anonymous ones included.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  daily_limit int not null default 5 check (daily_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The work itself, shared by everyone who submits the same input (fix-F6).
-- input_key = normalised image sha256 + ':' + threshold profile sha256 (runtime v5+).
-- A new pipeline_version re-analyses instead of serving an old verdict.
-- A recheck allocates a new run_number. The verdict is computed in verdictForCheck from
-- shared evidence plus checks.claimed_date; it is never stored on the shared analysis.
create table analyses (
  id uuid primary key default gen_random_uuid(),
  input_type text not null check (input_type in ('image', 'url')),
  input_key text not null,
  pipeline_version int not null,
  run_number int not null default 1 check (run_number > 0),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed')),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (input_type, input_key, pipeline_version, run_number)
);
create index on analyses (status, created_at);

-- A user's request. Owns the uploaded file and the share link.
create table checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  analysis_id uuid not null references analyses(id) on delete restrict,
  input_type text not null check (input_type in ('image', 'url')),
  input_url text,
  file_path text,
  file_bytes int check (file_bytes between 1 and 10485760),
  claimed_date date,
  share_slug text unique,
  charged boolean not null default false,
  quota_day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint input_present check (
    (input_type = 'image' and file_path is not null) or
    (input_type = 'url' and input_url is not null))
);
create index on checks (user_id, created_at desc);
create index on checks (analysis_id);

-- One row per signal. The verdict is a rule over these, never a single score.
create table evidence (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  kind text not null check (kind in (
    'source_match', 'c2pa', 'exif', 'watermark', 'pixel_model',
    'ocr', 'screen_recapture', 'fact_check')),
  outcome text not null check (outcome in (
    'supports_real', 'supports_manipulated', 'neutral', 'unavailable')),
  -- One strength scale for every evidence card (glossary.md). pixel_model is always weak.
  strength text not null check (strength in ('strong', 'medium', 'weak')),
  score numeric(5,2) check (score between 0 and 100),
  summary text not null,
  details jsonb not null default '{}',
  source_url text,
  provider text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A retried pipeline step upserts its row instead of adding a second one.
  unique (analysis_id, kind, provider),
  constraint pixel_model_is_weak check (kind <> 'pixel_model' or strength = 'weak')
);
create index on evidence (analysis_id);

-- Copies of the image found elsewhere (fix-F2).
create table source_matches (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  url text not null,
  image_url text,
  page_title text,
  first_seen_at timestamptz,
  first_seen_source text check (first_seen_source in ('tineye_crawl', 'page_meta')),
  similarity numeric(4,3) check (similarity between 0 and 1),
  is_earliest boolean not null default false,
  diff_regions jsonb not null default '[]',
  provider text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id, url)
);
create index on source_matches (analysis_id);
-- At most one "this is the original" per analysis.
create unique index one_earliest_per_analysis on source_matches (analysis_id) where is_earliest;

-- Claims pulled from an article and what fact-checkers said (fix-F4).
create table claims (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  position int not null check (position >= 0),
  text text not null,
  fact_check_url text,
  publisher text,
  rating text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id, position)
);
create index on claims (analysis_id);

-- Free quota per user per UTC day. Failed analyses are refunded (fix-F7).
create table usage_days (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  used int not null default 0 check (used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create trigger t_profiles before update on profiles for each row execute function set_updated_at();
create trigger t_analyses before update on analyses for each row execute function set_updated_at();
create trigger t_checks before update on checks for each row execute function set_updated_at();
create trigger t_evidence before update on evidence for each row execute function set_updated_at();
create trigger t_source_matches before update on source_matches for each row execute function set_updated_at();
create trigger t_claims before update on claims for each row execute function set_updated_at();
create trigger t_usage_days before update on usage_days for each row execute function set_updated_at();

-- Take one free check atomically. Returns false when the day's limit is reached.
-- Two tabs submitting at once cannot both squeeze past the limit.
create or replace function take_quota(p_user uuid) returns boolean
language plpgsql as $$
declare
  lim int;
  ok boolean;
begin
  select daily_limit into lim from profiles where id = p_user;
  if lim is null or lim <= 0 then
    return false;
  end if;
  insert into usage_days (user_id, day, used)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set used = usage_days.used + 1
    where usage_days.used < lim
  returning true into ok;
  return coalesce(ok, false);
end $$;

-- Give the check back when the analysis failed.
create or replace function refund_quota(p_user uuid, p_day date) returns void
language sql as $$
  update usage_days set used = greatest(used - 1, 0) where user_id = p_user and day = p_day;
$$;

-- Quota functions are server-only. Postgres lets PUBLIC execute new functions by default.
-- Today RLS inside these SECURITY INVOKER functions already turns a browser call into a no-op,
-- but if either is ever made SECURITY DEFINER, a signed-in user could burn someone else's quota
-- (tests/rls_test.py proves both). Revoking keeps that from depending on how the function is defined.
-- Supabase also grants EXECUTE on public functions to anon and authenticated through default
-- privileges, so revoking from PUBLIC alone is not enough there.
revoke execute on function take_quota(uuid) from public, anon, authenticated;
revoke execute on function refund_quota(uuid, date) from public, anon, authenticated;
grant execute on function take_quota(uuid) to service_role;
grant execute on function refund_quota(uuid, date) to service_role;

-- Public dashboard (2026-10-19; replica/category-policy.md, replica/public-dashboard.md).
-- A case is an operator-reviewed, published version of a check. Nobody but the server (service role) writes;
-- the browser reads approved rows only. Category rules that must never be broken are constraints, not UI.
create table public_cases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  analysis_id uuid references analyses(id) on delete set null,
  topic text not null check (topic in ('politics', 'entertainment', 'society', 'economy', 'other')),
  verdict text not null check (verdict in ('ai_generated', 'edited', 'miscontextualized', 'inconclusive', 'authentic')),
  -- spread paths are report-based tags only: no platform data is collected
  channels text[] not null default '{}' check (channels <@ array['instagram', 'youtube', 'community', 'messenger', 'news']::text[]),
  truth_title text not null check (char_length(truth_title) between 5 and 120), -- the true statement, not the false claim
  summary text not null check (char_length(summary) <= 400),
  image_path text, -- thumbnail, shown blurred unless authentic; null = text-only card
  court_record jsonb not null default '{}'::jsonb, -- validated court statements only (lib/court)
  cards jsonb not null default '[]'::jsonb, -- the evidence cards the record cites
  content_flags text[] not null default '{}'
    check (content_flags <@ array['sexual_content', 'minor', 'private_person', 'graphic_violence', 'election_period']::text[]),
  legal_warnings text[] not null default '{}', -- from the legal team's rules: warnings only, people decide
  approval_status text not null default 'draft'
    check (approval_status in ('draft', 'pending_review', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  second_reviewed_by uuid references auth.users(id),
  second_reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- every published case went through a person
  constraint approved_needs_reviewer check (
    approval_status <> 'approved' or (reviewed_by is not null and reviewed_at is not null and published_at is not null)),
  -- 정치·선거: two different reviewers (balance principle)
  constraint politics_two_reviewers check (
    approval_status <> 'approved' or topic <> 'politics'
    or (second_reviewed_by is not null and second_reviewed_by <> reviewed_by and second_reviewed_at is not null)),
  -- sexual content and anything involving minors is never published, in any form, blurred or not
  constraint never_publish_sexual_or_minor check (
    approval_status <> 'approved' or not (content_flags && array['sexual_content', 'minor']::text[])),
  -- private individuals are out of scope: only public figures' publicly shared material
  constraint never_publish_private_person check (
    approval_status <> 'approved' or not ('private_person' = any (content_flags))),
  -- inside an election's deepfake period (공직선거법 §82-8) political cases are text-only
  constraint election_period_text_only check (not ('election_period' = any (content_flags)) or image_path is null)
);
create index public_cases_listing on public_cases (topic, verdict, published_at desc) where approval_status = 'approved';
create trigger t_public_cases before update on public_cases for each row execute function set_updated_at();

-- Row level security. No insert/update/delete policies: the server writes with the service role.
alter table profiles enable row level security;
alter table analyses enable row level security;
alter table checks enable row level security;
alter table evidence enable row level security;
alter table source_matches enable row level security;
alter table claims enable row level security;
alter table usage_days enable row level security;
alter table public_cases enable row level security;

create policy own_profile on profiles for select using (id = auth.uid());
create policy own_checks on checks for select using (user_id = auth.uid());
create policy own_usage on usage_days for select using (user_id = auth.uid());

-- An analysis and its evidence are visible to anyone who has a check on it.
-- Shared links (/r/:slug) are served by the server, not through these policies.
create policy analyses_via_check on analyses for select using (
  exists (select 1 from checks c where c.analysis_id = analyses.id and c.user_id = auth.uid()));
create policy evidence_via_check on evidence for select using (
  exists (select 1 from checks c where c.analysis_id = evidence.analysis_id and c.user_id = auth.uid()));
create policy matches_via_check on source_matches for select using (
  exists (select 1 from checks c where c.analysis_id = source_matches.analysis_id and c.user_id = auth.uid()));
create policy claims_via_check on claims for select using (
  exists (select 1 from checks c where c.analysis_id = claims.analysis_id and c.user_id = auth.uid()));

-- The public dashboard: anyone may read approved cases, nothing else. Drafts, pending, rejected and withdrawn
-- cases stay invisible to every browser role, including their author.
create policy approved_cases_are_public on public_cases for select to anon, authenticated using (approval_status = 'approved');
