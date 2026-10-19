"""RLS test for Pairsight on a Supabase-like Postgres (roles, auth.uid(), default grants).

Usage: python3 -I rls_test.py <scratch_dir> <schema.sql>
Each test runs in its own transaction as a given role with a given JWT "sub", then rolls back.
Use only a disposable cluster: this script recreates databases named rls and rls_old.
PSQL, PGHOST, PGPORT, PGUSER and PGPASSFILE can override the legacy scratch defaults.
"""
import os
import subprocess
import sys

S, SCHEMA = sys.argv[1], sys.argv[2]
PSQL = os.environ.get("PSQL", f"{S}/pgenv/bin/psql")
ENV = dict(os.environ, PGPASSFILE=os.environ.get("PGPASSFILE", f"{S}/.pgpass"))
BASE = [PSQL, "-h", os.environ.get("PGHOST", "127.0.0.1"),
        "-p", os.environ.get("PGPORT", "54329"), "-U", os.environ.get("PGUSER", "postgres"),
        "-X", "-q", "-v", "ON_ERROR_STOP=1"]

A = "aaaaaaaa-0000-0000-0000-00000000000a"
B = "bbbbbbbb-0000-0000-0000-00000000000b"


def psql(db, sql, check=True):
    p = subprocess.run(BASE + ["-d", db, "-tA"], input=sql, text=True, capture_output=True, env=ENV)
    if check and p.returncode:
        raise SystemExit(f"psql failed on {db}:\n{p.stderr}")
    return p


def setup(db, schema):
    psql("postgres", f"drop database if exists {db}; create database {db};")
    psql(db, open(os.path.join(os.path.dirname(__file__), "supabase_bootstrap.sql")).read())
    psql(db, schema)
    # Seed as the owner (bypasses RLS). A and B each have a private image; both checked the same shared image.
    psql(db, f"""
insert into auth.users values ('{A}'), ('{B}');
insert into profiles (id, daily_limit) values ('{A}', 5), ('{B}', 5);
insert into analyses (id, input_type, input_key, pipeline_version, status) values
  ('10000000-0000-0000-0000-00000000000a', 'image', 'hash-a', 1, 'done'),
  ('10000000-0000-0000-0000-00000000000b', 'image', 'hash-b', 1, 'done'),
  ('10000000-0000-0000-0000-0000000000ab', 'image', 'hash-shared', 1, 'done');
insert into checks (id, user_id, analysis_id, input_type, file_path, share_slug) values
  ('20000000-0000-0000-0000-00000000000a', '{A}', '10000000-0000-0000-0000-00000000000a', 'image', 'a/1.jpg', 'slug-a'),
  ('20000000-0000-0000-0000-00000000000b', '{B}', '10000000-0000-0000-0000-00000000000b', 'image', 'b/1.jpg', 'slug-b'),
  ('20000000-0000-0000-0000-0000000000a2', '{A}', '10000000-0000-0000-0000-0000000000ab', 'image', 'a/2.jpg', null),
  ('20000000-0000-0000-0000-0000000000b2', '{B}', '10000000-0000-0000-0000-0000000000ab', 'image', 'b/2.jpg', null);
insert into evidence (analysis_id, kind, outcome, strength, summary, provider) values
  ('10000000-0000-0000-0000-00000000000a', 'source_match', 'supports_manipulated', 'strong', 'a', 'vision'),
  ('10000000-0000-0000-0000-00000000000b', 'c2pa', 'supports_manipulated', 'strong', 'b', 'c2pa'),
  ('10000000-0000-0000-0000-0000000000ab', 'pixel_model', 'neutral', 'weak', 'shared', 'model');
insert into source_matches (analysis_id, url, provider) values
  ('10000000-0000-0000-0000-00000000000b', 'https://b.example/secret', 'vision');
insert into claims (analysis_id, position, text) values ('10000000-0000-0000-0000-00000000000b', 0, 'b claim');
insert into usage_days (user_id, day, used) values ('{A}', '2026-10-18', 1), ('{B}', '2026-10-18', 2);
""")


def as_role(db, role, sub, sql):
    claims = f"'{{\"sub\":\"{sub}\",\"role\":\"{role}\"}}'" if sub else "''"
    body = f"begin;\nset local role {role};\nselect 'cfg' from (select set_config('request.jwt.claims', {claims}, true)) s;\n{sql}\nrollback;\n"
    p = subprocess.run(BASE + ["-d", db, "-tA"], input=body, text=True, capture_output=True, env=ENV)
    lines = [l for l in p.stdout.splitlines() if l.strip()]
    # first line is the set_config result
    return p.returncode, lines[1:], p.stderr.strip()


results = []


def expect(name, db, role, sub, sql, want=None, want_error=None):
    code, out, err = as_role(db, role, sub, sql)
    if want_error:
        ok = code != 0 and want_error in err
        got = err.splitlines()[0] if err else f"no error, output={out}"
    else:
        ok = code == 0 and out == want
        got = out if code == 0 else err.splitlines()[0]
    results.append((ok, name, got))


db = "rls"
schema = open(SCHEMA).read()
setup(db, schema)
U = "authenticated"

# 1. Reading: each user sees only their own rows
expect("A sees only own checks", db, U, A, "select count(*) from checks;", ["2"])
expect("A cannot read B's check by id", db, U, A,
       "select count(*) from checks where id = '20000000-0000-0000-0000-00000000000b';", ["0"])
expect("A cannot find B's check by guessing share_slug", db, U, A,
       "select count(*) from checks where share_slug = 'slug-b';", ["0"])
expect("A sees own + shared analyses only", db, U, A, "select count(*) from analyses;", ["2"])
expect("A cannot read B's private analysis", db, U, A,
       "select count(*) from analyses where id = '10000000-0000-0000-0000-00000000000b';", ["0"])
expect("A sees evidence of own + shared analyses only", db, U, A,
       "select string_agg(summary, ',' order by summary) from evidence;", ["a,shared"])
expect("A cannot read B's source matches", db, U, A, "select count(*) from source_matches;", ["0"])
expect("A cannot read B's claims", db, U, A, "select count(*) from claims;", ["0"])
expect("A sees only own usage", db, U, A, "select string_agg(used::text, ',') from usage_days;", ["1"])
expect("A sees only own profile", db, U, A, "select count(*) from profiles;", ["1"])
expect("B sees the shared analysis too", db, U, B,
       "select count(*) from analyses where id = '10000000-0000-0000-0000-0000000000ab';", ["1"])
expect("B does not see A's check on the shared analysis", db, U, B,
       "select count(*) from checks where analysis_id = '10000000-0000-0000-0000-0000000000ab';", ["1"])

# 2. Anonymous request with no JWT at all
for t in ["checks", "analyses", "evidence", "profiles", "usage_days"]:
    expect(f"anon (no JWT) reads 0 rows from {t}", db, "anon", None, f"select count(*) from {t};", ["0"])

# 3. Writing: no write policies, so every write from the browser is a no-op or an error
expect("A cannot raise own daily limit", db, U, A,
       "with u as (update profiles set daily_limit = 9999 returning 1) select count(*) from u;", ["0"])
expect("A cannot reset own usage", db, U, A,
       "with u as (update usage_days set used = 0 returning 1) select count(*) from u;", ["0"])
expect("A cannot delete B's check", db, U, A,
       "with d as (delete from checks returning user_id) select count(*) from d where user_id <> auth.uid();", ["0"])
expect("A cannot change the evidence used for a verdict", db, U, A,
       "with u as (update evidence set outcome = 'supports_real' returning 1) select count(*) from u;", ["0"])
expect("A cannot insert a check", db, U, A,
       f"insert into checks (user_id, analysis_id, input_type, file_path) values ('{A}', '10000000-0000-0000-0000-00000000000b', 'image', 'x');",
       want_error="row-level security")
expect("A cannot insert fake evidence", db, U, A,
       "insert into evidence (analysis_id, kind, outcome, strength, summary, provider) values ('10000000-0000-0000-0000-00000000000a', 'c2pa', 'supports_real', 'strong', 'x', 'x');",
       want_error="row-level security")

# 4. Quota functions are server-only
expect("A cannot burn B's quota (take_quota)", db, U, A, f"select take_quota('{B}');",
       want_error="permission denied for function take_quota")
expect("A cannot refund own quota (refund_quota)", db, U, A, f"select refund_quota('{A}', '2026-10-18');",
       want_error="permission denied for function refund_quota")
expect("anon cannot call take_quota", db, "anon", None, f"select take_quota('{A}');",
       want_error="permission denied for function take_quota")

# 5. The server (service_role) sees everything and can use the quota functions
expect("service_role sees all checks", db, "service_role", None, "select count(*) from checks;", ["4"])
expect("service_role can take quota", db, "service_role", None, f"select take_quota('{A}');", ["t"])

# 6. Regression: the version that only revoked from PUBLIC
old = "rls_old"
setup(old, schema.replace("from public, anon, authenticated;", "from public;"))
expect("[old schema] A can call take_quota on B, but RLS inside the function makes it return false", old, U, A,
       f"select take_quota('{B}');", ["f"])
expect("[old schema] A can call refund_quota, but RLS makes it change nothing", old, U, A,
       f"select 'x' from (select refund_quota('{A}', '2026-10-18')) r; select used from usage_days;", ["x", "1"])

# 7. Defense in depth: the same functions made SECURITY DEFINER (a common pattern for quota helpers).
psql(old, "alter function take_quota(uuid) security definer;")
psql(db, "alter function take_quota(uuid) security definer;")
expect("[old schema + security definer] A CAN burn B's quota: the hole the revoke prevents", old, U, A,
       f"select take_quota('{B}');", ["t"])
expect("[current schema + security definer] A still gets permission denied", db, U, A,
       f"select take_quota('{B}');", want_error="permission denied for function take_quota")

# 8. Per-check context and explicit recheck runs (2026-10-19).
expect("shared analyses have no stored verdict columns", db, "service_role", None,
       "select count(*) from information_schema.columns where table_name = 'analyses' and column_name in ('verdict', 'verdict_reason');", ["0"])
expect("recheck can create a second run of the same image", db, "service_role", None,
       "insert into analyses (input_type,input_key,pipeline_version,run_number) values ('image','hash-a',1,2) returning run_number;", ["2"])
expect("duplicate run is rejected", db, "service_role", None,
       "insert into analyses (input_type,input_key,pipeline_version,run_number) values ('image','hash-a',1,1);",
       want_error="duplicate key")
expect("non-positive run number is rejected", db, "service_role", None,
       "insert into analyses (input_type,input_key,pipeline_version,run_number) values ('image','new',1,0);",
       want_error="check constraint")
expect("different pipeline version starts at run 1", db, "service_role", None,
       "insert into analyses (input_type,input_key,pipeline_version) values ('image','hash-a',2) returning run_number;", ["1"])
expect("claimed dates stay separate on checks sharing an analysis", db, "service_role", None,
       "update checks set claimed_date = case when user_id = '" + A + "' then date '2024-05-10' else date '2026-10-01' end "
       "where analysis_id = '10000000-0000-0000-0000-0000000000ab'; "
       "select count(distinct claimed_date) from checks where analysis_id = '10000000-0000-0000-0000-0000000000ab';", ["2"])
expect("browser cannot rewrite claimed dates", db, U, A,
       "with u as (update checks set claimed_date = '2026-10-01' returning 1) select count(*) from u;", ["0"])
expect("quota day defaults to UTC", db, "service_role", None,
       "select bool_and(quota_day = (now() at time zone 'utc')::date) from checks;", ["t"])
expect("source date provenance is preserved", db, "service_role", None,
       "update source_matches set first_seen_source = 'tineye_crawl' returning first_seen_source;", ["tineye_crawl"])
expect("unknown date source code is rejected", db, "service_role", None,
       "update source_matches set first_seen_source = 'guessed';", want_error="check constraint")

passed = sum(ok for ok, _, _ in results)
for ok, name, got in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> got {got}"))
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
