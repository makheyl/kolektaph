-- KolektaPH pilot database · resident accounts (plan 2A)
--
-- A guest identity becomes a registered account in place: it gets a mobile number and a password
-- (Supabase phone sign-in), so the reports it owns stay with it. Its profile (full name, barangay,
-- area and an optional email) is kept in the private schema. A guest can move its reports into an
-- account it signs in to, with a one-time code that the guest makes before it signs in.
--
-- Not made here, and needed in the dashboard before the app switches the accounts on:
--   * Phone sign-in on, with confirmations off (no SMS gateway yet, so no number is verified);
--   * manual identity linking on (a guest is linked to a phone and password, not replaced).
--
-- Points are not stored here: the Eco Points tables come with plan 2C, so a transfer moves the
-- reports only until then.

-- ---------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------

create table private.resident_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null
                 check (full_name = btrim(full_name) and char_length(full_name) between 2 and 80),
  barangay_id  text references public.barangays (id),
  area         text not null default ''
                 check (area = btrim(area) and char_length(area) <= 80),
  email        text
                 check (email is null or (char_length(email) <= 120
                        and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table private.resident_profiles is
  'The profile of a registered resident account. The mobile number is the account''s phone in auth.users, not a copy. No API role can read this table.';

-- One row per code made. A code is kept as a hash, valid for 15 minutes, and closed when it is
-- used or when the guest makes a newer one. Codes made in the last hour are counted to limit them.
create table private.transfer_codes (
  code_hash   text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  guest_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  closed_at   timestamptz,
  check (expires_at > created_at)
);
create index transfer_codes_guest_idx on private.transfer_codes (guest_id, created_at);
comment on table private.transfer_codes is
  'One-time codes by which a guest offers its reports to the account it signs in to. Hashed; no API role can read this table.';

alter table private.resident_profiles enable row level security;
alter table private.transfer_codes enable row level security;

-- ---------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------

-- True for a registered account (a phone and password on the identity), false for a guest.
create function private.is_account(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = p_uid and not u.is_anonymous);
$$;

-- Eight characters without look-alikes (no 0, O, 1 or I), read as two groups of four.
create function private.new_transfer_code()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_chars text := '';
begin
  for i in 0..7 loop
    v_chars := v_chars || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
  end loop;
  return substr(v_chars, 1, 4) || '-' || substr(v_chars, 5, 4);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The implementations (run as the owner, after checking the caller)
-- ---------------------------------------------------------------------------------------

-- The caller's profile, or null for a guest (a guest has no profile).
create function private.resident_profile_get()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_row record;
begin
  select u.phone, p.full_name, p.barangay_id, p.area, p.email
    into v_row
    from auth.users u
    left join private.resident_profiles p on p.user_id = u.id
   where u.id = v_uid and not u.is_anonymous;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'fullName', coalesce(v_row.full_name, ''),
    'mobile', case when v_row.phone is null then null else '+' || ltrim(v_row.phone, '+') end,
    'email', v_row.email,
    'barangayId', v_row.barangay_id,
    'area', coalesce(v_row.area, '')
  );
end;
$$;

-- Saves the caller's profile. The mobile number is not changed here: it is the account's phone.
create function private.resident_profile_save(
  p_full_name text, p_barangay_id text, p_area text, p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_name text := btrim(coalesce(p_full_name, ''));
  v_area text := btrim(coalesce(p_area, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if not private.is_account(v_uid) then
    perform private.fail('account_required', 403, 'Make an account first.');
  end if;
  if char_length(v_name) not between 2 and 80 then
    perform private.fail('bad_name', 400);
  end if;
  if char_length(v_area) > 80 then
    perform private.fail('bad_area', 400);
  end if;
  if v_email is not null and (char_length(v_email) > 120
       or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    perform private.fail('bad_email', 400);
  end if;
  if p_barangay_id is not null
     and not exists (select 1 from public.barangays b where b.id = p_barangay_id) then
    perform private.fail('unknown_barangay', 400);
  end if;

  insert into private.resident_profiles as p (user_id, full_name, barangay_id, area, email)
  values (v_uid, v_name, p_barangay_id, v_area, v_email)
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        barangay_id = excluded.barangay_id,
        area = excluded.area,
        email = excluded.email,
        updated_at = now();
  return private.resident_profile_get();
end;
$$;

-- A guest makes a code to offer its reports to an account it is about to sign in to. Returns the
-- code (shown once, never stored in clear) and how many reports the guest holds.
create function private.guest_transfer_code()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  -- The real time, not the demo clock: a code's 15 minutes must not move with a demo.
  v_now timestamptz := now();
  v_code text;
  v_reports integer;
begin
  if private.is_account(v_uid) or not exists (select 1 from auth.users u where u.id = v_uid) then
    perform private.fail('guest_only', 403, 'Only a guest identity can offer its reports.');
  end if;
  -- At most five codes an hour for a guest, counted from the rows themselves.
  if (select count(*) from private.transfer_codes t
       where t.guest_id = v_uid and t.created_at > v_now - interval '1 hour') >= 5 then
    perform private.fail('rate_limited', 429);
  end if;
  -- A newer code closes the older one; closed rows are kept so the count above stays true.
  update private.transfer_codes t set closed_at = v_now
   where t.guest_id = v_uid and t.closed_at is null;
  v_code := private.new_transfer_code();
  insert into private.transfer_codes (code_hash, guest_id, created_at, expires_at)
  values (encode(extensions.digest(replace(v_code, '-', ''), 'sha256'), 'hex'),
          v_uid, v_now, v_now + interval '15 minutes');
  select count(*)::integer into v_reports from public.tickets t where t.reporter_id = v_uid;
  return jsonb_build_object('code', v_code, 'reports', v_reports,
                            'expiresAt', v_now + interval '15 minutes');
end;
$$;

-- A registered account takes over the reports of the guest that made the code. The code works
-- once and only until it expires. Returns how many reports moved.
create function private.guest_transfer(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  -- The real time, not the demo clock: a code's 15 minutes must not move with a demo.
  v_now timestamptz := now();
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_row private.transfer_codes%rowtype;
  v_moved integer;
begin
  if not private.is_account(v_uid) then
    perform private.fail('account_required', 403, 'Sign in to an account first.');
  end if;
  select * into v_row
    from private.transfer_codes t
   where t.code_hash = encode(extensions.digest(v_norm, 'sha256'), 'hex')
   for update;
  if not found or v_row.closed_at is not null or v_row.expires_at <= v_now then
    perform private.fail('code_not_valid', 400);
  end if;
  -- The guest must still be a guest, and not this very account.
  if v_row.guest_id = v_uid or private.is_account(v_row.guest_id) then
    perform private.fail('code_not_valid', 400);
  end if;

  with moved as (
    update public.tickets t set reporter_id = v_uid
     where t.reporter_id = v_row.guest_id
    returning 1
  )
  select count(*)::integer into v_moved from moved;

  update private.transfer_codes t set closed_at = v_now where t.code_hash = v_row.code_hash;
  return jsonb_build_object('reports', v_moved);
end;
$$;

-- Removes the caller's identity: a guest (as before) or a registered resident account. Its profile
-- and codes go with it; its reports stay as city records, no longer linked to anyone. A staff
-- login is never removed this way: only an administrator ends a staff login.
create or replace function private.forget_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  delete from auth.users u
   where u.id = v_uid
     and not exists (select 1 from public.staff s where s.user_id = u.id);
  if not found then
    perform private.fail('not_allowed', 403, 'A staff login cannot be removed this way.');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The API surface
-- ---------------------------------------------------------------------------------------

create function public.resident_profile_get()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.resident_profile_get();
$$;

create function public.resident_profile_save(
  p_full_name text, p_barangay_id text, p_area text, p_email text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.resident_profile_save(p_full_name, p_barangay_id, p_area, p_email);
$$;

create function public.guest_transfer_code()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.guest_transfer_code();
$$;

create function public.guest_transfer(p_code text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.guest_transfer(p_code);
$$;

-- The two helpers are reached only from inside the implementations, which run as the owner.
revoke execute on function private.is_account(uuid) from public;
revoke execute on function private.new_transfer_code() from public;
grant execute on function private.resident_profile_get() to authenticated;
grant execute on function public.resident_profile_get() to authenticated;
grant execute on function private.resident_profile_save(text, text, text, text) to authenticated;
grant execute on function public.resident_profile_save(text, text, text, text) to authenticated;
grant execute on function private.guest_transfer_code() to authenticated;
grant execute on function public.guest_transfer_code() to authenticated;
grant execute on function private.guest_transfer(text) to authenticated;
grant execute on function public.guest_transfer(text) to authenticated;
