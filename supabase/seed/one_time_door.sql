-- KolektaPH pilot database · one-time seed door
--
-- Not a migration. Use it only to seed a fresh database when you have no direct database
-- access, and close it right after. With database access you do not need it:
--   select private.seed_load('<contents of seed.json>'::jsonb);
--
-- 1. Make a random token and keep it in a local file outside the repo:
--      openssl rand -hex 32 > token.txt
--      printf '%s' "$(cat token.txt)" | shasum -a 256      -- paste the hash into OPEN below
-- 2. Run the OPEN part in the Supabase SQL editor.
-- 3. Build and post the seed:
--      npx tsx scripts/db/build-seed.ts seed.json
--      SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<publishable key> \
--        SEED_TOKEN_FILE=token.txt node scripts/db/load-seed.mjs seed.json
-- 4. Run the CLOSE part. Delete token.txt and seed.json.
--
-- The door checks the token, refuses a database that already has data, loads everything in one
-- transaction and locks itself after one use. Run OPEN and CLOSE separately, not as one query.

-- ============================== OPEN ==============================
create table private.seed_gate (
  id            boolean primary key default true check (id),
  token_sha256  text not null check (token_sha256 ~ '^[0-9a-f]{64}$')
);
alter table private.seed_gate enable row level security;
insert into private.seed_gate (token_sha256)
values ('<sha-256 of the token, 64 hex characters>');

create function private.seed_load_gated(p_token text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_token is null or not exists (
    select 1
    from private.seed_gate g
    where g.token_sha256 = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    perform private.fail('not_allowed', 403);
  end if;
  v_result := private.seed_load(p_data);
  -- One use only.
  delete from private.seed_gate where true;
  return v_result;
end;
$$;

create function public.seed_load(p_token text, p_data jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.seed_load_gated(p_token, p_data);
$$;

grant execute on function private.seed_load_gated(text, jsonb) to anon;
grant execute on function public.seed_load(text, jsonb) to anon;
notify pgrst, 'reload schema';

-- ============================== CLOSE ==============================
drop function public.seed_load(text, jsonb);
drop function private.seed_load_gated(text, jsonb);
drop table private.seed_gate;
notify pgrst, 'reload schema';
