-- KolektaPH pilot database · 1 of 8 · base
--
-- Stance: nothing is reachable through the API unless a later migration grants it.
--   public      tables (read under row rules) and thin entry-point functions
--   private     secrets, counters and all privileged code; the API cannot address it
--   extensions  PostGIS and pgcrypto

-- PostGIS first, so its own functions keep their normal grants.
create extension if not exists postgis with schema extensions;

create schema if not exists private;
comment on schema private is
  'Not exposed through the API: secrets, counters and privileged code.';

revoke all on schema private from public;
-- Needed so row rules and entry points can call helpers in it. It grants no table access.
grant usage on schema private to anon, authenticated;

-- New tables, sequences and functions are never handed to the API roles automatically.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
-- Postgres lets everyone execute a new function by default. Not here. (This default can only
-- be removed for all schemas at once; a per-schema revoke has no effect on it.)
alter default privileges for role postgres
  revoke execute on functions from public;

-- One way to refuse a request. PostgREST turns PTxxx into HTTP status xxx; the message is a
-- stable machine-readable code and the detail is for people.
create function private.fail(p_code text, p_status integer default 400, p_detail text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'PT' || p_status::text,
    message = p_code,
    detail = coalesce(p_detail, '');
end;
$$;
