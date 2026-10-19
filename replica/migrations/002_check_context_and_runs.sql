-- Upgrade the 2026-10-18 schema. Apply once, after backing up any existing database.
-- Fresh installations use schema.sql directly and must NOT also apply this migration.
-- Verdicts are derived from evidence + checks.claimed_date by the server, not stored here.
begin;

alter table analyses drop constraint verdict_only_when_done;
alter table analyses drop column verdict;
alter table analyses drop column verdict_reason;
alter table analyses add column run_number int not null default 1 check (run_number > 0);
alter table analyses drop constraint analyses_input_type_input_key_pipeline_version_key;
alter table analyses add unique (input_type, input_key, pipeline_version, run_number);

alter table checks add column claimed_date date;
alter table checks add column quota_day date;
-- Existing charges belonged to the UTC day of the original request, not the migration day.
update checks set quota_day = (created_at at time zone 'utc')::date;
alter table checks alter column quota_day set not null;
alter table checks alter column quota_day set default (now() at time zone 'utc')::date;

-- Older rows did not record the date source. Leave it unknown instead of inventing provenance.
alter table source_matches add column first_seen_source text
  check (first_seen_source in ('tineye_crawl', 'page_meta'));

commit;
