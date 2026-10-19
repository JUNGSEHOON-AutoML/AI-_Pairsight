-- 003: non-profit pilot (payments removed from the design) and the public dashboard. 2026-10-19.
-- Apply once, after 002 and after backing up. Fresh installations use schema.sql and must NOT also apply this.
-- No rollback: the payment tables never held data (payments were never built).
begin;

drop table if exists stripe_events;
alter table profiles drop column if exists plan, drop column if exists stripe_customer_id;

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

alter table public_cases enable row level security;
-- The public dashboard: anyone may read approved cases, nothing else. Drafts, pending, rejected and withdrawn
-- cases stay invisible to every browser role, including their author.
create policy approved_cases_are_public on public_cases for select to anon, authenticated using (approval_status = 'approved');

commit;
