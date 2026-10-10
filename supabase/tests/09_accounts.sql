-- KolektaPH pilot database · test 9 · resident accounts (plan 2A)
-- Run after 00_harness.sql, as one query. Everything here is rolled back at the end.

-- ---------- The cast ----------
select pg_temp.new_user('guest_a');                              -- a guest that reports
select pg_temp.new_user('guest_b');                              -- a guest with no reports
select pg_temp.new_user('juan', 'juan@test.invalid');            -- a registered account
update auth.users set phone = '639171234567' where id = pg_temp.uid('juan');
select pg_temp.new_user('leaver', 'leaver@test.invalid');        -- an account that deletes itself
update auth.users set phone = '639181234567' where id = pg_temp.uid('leaver');
select pg_temp.new_user('expired_guest');

-- ---------- Structure ----------
select pg_temp.eq(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname in ('resident_profiles', 'transfer_codes')
      and c.relrowsecurity),
  2, 'the two new private tables have row rules on');
select pg_temp.eq(
  has_table_privilege('authenticated', 'private.resident_profiles', 'select')
    or has_table_privilege('authenticated', 'private.transfer_codes', 'select')
    or has_table_privilege('anon', 'private.resident_profiles', 'select')
    or has_table_privilege('anon', 'private.transfer_codes', 'select'),
  false, 'no API role can read the new private tables');

-- ---------- A guest has no profile ----------
select pg_temp.as_user('guest_b');
select pg_temp.eq(public.resident_profile_get(), null::jsonb, 'a guest has no profile');
select pg_temp.throws(
  $$select public.resident_profile_save('Juan Dela Cruz', 'milagrosa', 'Zone 3', null)$$,
  'account_required', 'a guest cannot save a profile');

-- ---------- The profile of an account ----------
select pg_temp.as_user('juan');
select pg_temp.eq(
  public.resident_profile_save('  Juan Dela Cruz  ', 'milagrosa', ' Zone 3 ', ' juan@example.com ') ->> 'fullName',
  'Juan Dela Cruz', 'the name is saved trimmed');
select pg_temp.eq(public.resident_profile_get() ->> 'mobile', '+639171234567',
  'the mobile number is the account''s phone, with its plus sign');
select pg_temp.eq(public.resident_profile_get() ->> 'email', 'juan@example.com', 'the email is saved');
select pg_temp.eq(public.resident_profile_get() ->> 'barangayId', 'milagrosa', 'the barangay is saved');
select pg_temp.eq(public.resident_profile_get() ->> 'area', 'Zone 3', 'the area is saved');
select pg_temp.throws($$select public.resident_profile_save('J', 'milagrosa', '', null)$$,
  'bad_name', 'a one-letter name is refused');
select pg_temp.throws($$select public.resident_profile_save('Juan', 'milagrosa', '', 'juan at mail')$$,
  'bad_email', 'a bad email is refused');
select pg_temp.throws($$select public.resident_profile_save('Juan', 'atlantis', '', null)$$,
  'unknown_barangay', 'an unknown barangay is refused');
select pg_temp.eq(public.resident_profile_get() ->> 'mobile', '+639171234567',
  'a refused save changes nothing, and the number stays the account''s');

-- ---------- Reports held by a guest ----------
select pg_temp.as_user('guest_a');
select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479);
select pg_temp.eq(
  (select count(*)::int from public.tickets t where t.reporter_id = pg_temp.uid('guest_a')),
  1, 'the guest has one report of its own');

-- A code is made by a guest only; the account cannot make one.
select pg_temp.remember('code1', public.guest_transfer_code() ->> 'code');
select pg_temp.as_user('juan');
select pg_temp.throws($$select public.guest_transfer_code()$$, 'guest_only',
  'an account cannot make a transfer code');

-- The code is kept as a hash, never in clear.
select pg_temp.as_owner();
select pg_temp.eq(
  (select count(*)::int from private.transfer_codes where code_hash = pg_temp.recall('code1')),
  0, 'the code itself is not stored: only its hash');

-- A code is not valid for a guest, and a wrong one is refused.
select pg_temp.as_user('guest_b');
select pg_temp.throws(format('select public.guest_transfer(%L)', pg_temp.recall('code1')),
  'account_required', 'a guest cannot take over another guest''s reports');
select pg_temp.as_user('juan');
select pg_temp.throws($$select public.guest_transfer('ZZZZ-ZZZZ')$$, 'code_not_valid',
  'a wrong code is refused');

-- The right code moves the guest's report to the account, once.
select pg_temp.eq(
  (public.guest_transfer(pg_temp.recall('code1')) ->> 'reports')::int, 1,
  'the account takes over the one report the guest held');
select pg_temp.as_owner();
select pg_temp.eq(
  (select count(*)::int from public.tickets t where t.reporter_id = pg_temp.uid('juan')),
  1, 'the report now belongs to the account');
select pg_temp.eq(
  (select count(*)::int from public.tickets t where t.reporter_id = pg_temp.uid('guest_a')),
  0, 'the guest holds no report after the move');
select pg_temp.as_user('juan');
select pg_temp.throws(format('select public.guest_transfer(%L)', pg_temp.recall('code1')),
  'code_not_valid', 'a code works once');

-- A newer code closes the older one.
select pg_temp.as_user('guest_a');
select pg_temp.remember('code2', public.guest_transfer_code() ->> 'code');
select pg_temp.remember('code3', public.guest_transfer_code() ->> 'code');
select pg_temp.as_user('juan');
select pg_temp.throws(format('select public.guest_transfer(%L)', pg_temp.recall('code2')),
  'code_not_valid', 'the older code is closed by the newer one');
select pg_temp.eq(
  (public.guest_transfer(pg_temp.recall('code3')) ->> 'reports')::int, 0,
  'the newest code works, and there is nothing left to move');

-- Five codes an hour for a guest, counted from the rows themselves.
select pg_temp.as_user('guest_a');
select public.guest_transfer_code();
select public.guest_transfer_code();
select pg_temp.throws($$select public.guest_transfer_code()$$, 'rate_limited',
  'a sixth code in an hour is refused');

-- An expired code is refused, even though it was never used.
select pg_temp.as_owner();
insert into private.transfer_codes (code_hash, guest_id, created_at, expires_at)
values (encode(extensions.digest('ABCD2345', 'sha256'), 'hex'), pg_temp.uid('expired_guest'),
        now() - interval '2 hours', now() - interval '1 hour');
select pg_temp.as_user('juan');
select pg_temp.throws($$select public.guest_transfer('ABCD-2345')$$, 'code_not_valid',
  'an expired code is refused');

-- Anonymous visitors cannot call any of it.
select pg_temp.as_anon();
select pg_temp.throws($$select public.resident_profile_get()$$, '42501',
  'a visitor with no sign-in cannot read a profile');
select pg_temp.throws($$select public.guest_transfer_code()$$, '42501',
  'a visitor with no sign-in cannot make a code');

-- ---------- Deleting an account and a guest ----------
select pg_temp.as_user('leaver');
select public.resident_profile_save('Ana Santos', 'milagrosa', '', null);
select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479);
select pg_temp.remember('leaver_ticket',
  (select t.id from public.tickets t where t.reporter_id = pg_temp.uid('leaver') limit 1));
select public.forget_me();
select pg_temp.as_owner();
select pg_temp.eq((select count(*)::int from auth.users where id = pg_temp.uid('leaver')), 0,
  'deleting an account removes its identity');
select pg_temp.eq((select count(*)::int from private.resident_profiles
                    where user_id = pg_temp.uid('leaver')), 0, 'its profile goes with it');
select pg_temp.eq(
  (select count(*)::int from public.tickets where id = pg_temp.recall('leaver_ticket')
     and reporter_id is null),
  1, 'its report stays with the City, no longer linked to anyone');
select pg_temp.as_user('guest_b');
select public.forget_me();
select pg_temp.as_owner();
select pg_temp.eq((select count(*)::int from auth.users where id = pg_temp.uid('guest_b')), 0,
  'a guest can still remove its identity, as before');

select pg_temp.finish();
