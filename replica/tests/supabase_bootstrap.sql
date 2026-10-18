-- Minimal re-creation of what Supabase sets up before your migrations run.
-- Roles are cluster-wide, so create them only once.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create role authenticator login noinherit;
    grant anon, authenticated, service_role to authenticator;
  end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
-- Same definition Supabase uses: the JWT "sub" claim.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Supabase's default privileges: every new table and function in public is granted to these roles,
-- so row level security is the only thing standing between users.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
