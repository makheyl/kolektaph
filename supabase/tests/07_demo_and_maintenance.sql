-- KolektaPH pilot database · test 7 · the shared clock, demo controls, reset and daily clean-up
-- Run after 00_harness.sql, as one query.

-- ---------- The cast ----------
select pg_temp.new_user('resident');
select pg_temp.new_user('phone_t2');
select pg_temp.new_user('admin', 'admin@test.invalid');
select pg_temp.new_user('dispatcher', 'dispatcher@test.invalid');
insert into public.staff (user_id, name, role) values
  (pg_temp.uid('admin'), 'Test Admin', 'admin'),
  (pg_temp.uid('dispatcher'), 'Test Dispatcher', 'dispatcher');
insert into private.driver_sessions (user_id, truck_id, expires_at)
values (pg_temp.uid('phone_t2'), 't2', now() + interval '1 hour');
select pg_temp.remember('staff_before', (select count(*) from public.staff)::text);
select pg_temp.remember('subs_before', (select count(*) + 1 from private.sms_subscriptions)::text);

-- =======================================================================================
-- A. The clock
-- =======================================================================================
select pg_temp.as_anon();
select pg_temp.eq(
  (select (c.anchor_sim is null)::text || '|' || c.speed || '|'
          || (abs(extract(epoch from c.server_now - now())) < 60)
   from public.clock() c),
  'true|1|true', 'live: no demo time, speed 1, and the server''s own time');

select pg_temp.as_user('dispatcher');
select pg_temp.throws($$select public.demo_clock_set(timestamptz '2026-10-06 07:25:00+08')$$,
                      'not_allowed', 'a dispatcher cannot move the clock');
select pg_temp.as_user('admin');
select pg_temp.throws($$select public.demo_clock_set(now(), 5::smallint)$$, 'bad_speed',
                      'refused: a speed other than 1, 10 or 60');
select pg_temp.throws($$select public.demo_clock_set(now() + interval '800 days')$$, 'bad_time',
                      'refused: a time more than 400 days away');
select public.demo_clock_set(timestamptz '2026-10-06 07:25:00+08');
select pg_temp.as_anon();
select pg_temp.eq(
  (select to_char(c.anchor_sim at time zone 'Asia/Manila', 'Dy YYYY-MM-DD HH24:MI') || '|' || c.speed
   from public.clock() c),
  'Tue 2026-10-06 07:25|1', 'everyone reads the same demo time');
select pg_temp.as_owner();
select pg_temp.eq(
  to_char(private.app_now() at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') || '|' || private.today(),
  '2026-10-06 07:25|2026-10-06', 'the server stamps with the demo time');
-- Speed: 10 real seconds at x60 are 10 demo minutes.
update public.demo_clock set anchor_real = now() - interval '10 seconds', speed = 60 where id;
select pg_temp.eq(
  to_char(private.app_now() at time zone 'Asia/Manila', 'HH24:MI:SS'),
  '07:35:00', 'demo time runs at the chosen speed');
select pg_temp.as_user('admin');
select public.demo_clock_set(null, 10::smallint);
select pg_temp.as_owner();
select pg_temp.eq(
  (select to_char(c.anchor_sim at time zone 'Asia/Manila', 'HH24:MI:SS') || '|' || c.speed
          || '|' || (c.anchor_real = now())
   from public.demo_clock c),
  '07:35:00|10|true', 'changing the speed does not make the time jump');

-- What people enter is stamped with the app's time, not the device's.
select pg_temp.as_user('resident');
select pg_temp.remember('t1', public.report_submit(
  gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479));
select pg_temp.eq(
  (select to_char(t.created_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI')
   from public.tickets t where t.id = pg_temp.recall('t1')),
  '2026-10-06 07:35', 'a report is stamped with the app''s time');
select pg_temp.as_user('admin');
select public.demo_clock_clear();
select pg_temp.as_anon();
select pg_temp.eq((select (c.anchor_sim is null)::text || '|' || c.speed from public.clock() c),
                  'true|1', 'back to real time');

-- Ticket numbers restart each year.
select pg_temp.as_user('admin');
select public.demo_clock_set(timestamptz '2027-01-05 09:00:00+08');
select pg_temp.as_user('resident');
select pg_temp.eq(
  public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479),
  'KPH-2027-000001', 'the first ticket of a new year is number 000001 of that year');
select pg_temp.as_user('admin');
select public.demo_clock_set(timestamptz '2026-10-06 07:55:00+08');

-- =======================================================================================
-- B. A demo incident
-- =======================================================================================
select pg_temp.as_user('dispatcher');
select pg_temp.throws($$select public.demo_incident('t2')$$, 'not_allowed',
                      'a dispatcher cannot trigger a demo incident');
select pg_temp.as_user('admin');
select pg_temp.throws($$select public.demo_incident('t9')$$, 'unknown_truck', 'refused: an unknown truck');
select pg_temp.throws($$select public.demo_incident('t2', 'alien_abduction')$$, 'bad_incident',
                      'refused: an unknown incident');
select pg_temp.throws($$select public.demo_incident('t2', 'breakdown', 2)$$, 'bad_minutes',
                      'refused: under 5 minutes');
select pg_temp.remember('inc', public.demo_incident('t2'));
select pg_temp.eq(public.demo_incident('t2'), pg_temp.recall('inc'),
                  'the same incident at the same moment is one incident');
select pg_temp.eq(
  (select count(*)::int || '|' || max(e.kind) || '|' || max(e.incident) || '|' || max(e.incident_minutes)
          || '|' || bool_and(e.shift_id is null)
          || '|' || to_char(max(e.at) at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI')
   from public.truck_events e where e.id = pg_temp.recall('inc')),
  '1|incident|breakdown|120|true|2026-10-06 07:55',
  'a demo incident is a truck event with no shift, at the app''s time');

-- =======================================================================================
-- C. Reset to the seeded state
-- =======================================================================================
-- Something of every kind to wipe.
select pg_temp.as_owner();
select pg_temp.remember('photo', pg_temp.uid('resident') || '/' || gen_random_uuid() || '.jpg');
insert into storage.objects (bucket_id, name, owner_id)
values ('report-photos', pg_temp.recall('photo'), pg_temp.uid('resident')::text);
select pg_temp.as_user('resident');
select public.sms_subscribe('+639175550000', 'milagrosa');
select public.report_submit(
  gen_random_uuid(), 'OVERFLOW', 'bags', 121.04384, 14.30479, null, null, false, false, null, false,
  jsonb_build_array(jsonb_build_object('slot', 'wide', 'path', pg_temp.recall('photo'))));
select pg_temp.as_user('phone_t2');
select public.driver_upload(
  jsonb_build_array(
    jsonb_build_object('id', 't2|shift_start|demo0001', 'kind', 'shift_start',
                       'at', extract(epoch from timestamptz '2026-10-06 07:17:00+08') * 1000,
                       'shift_id', 'shift|t2|demo0001', 'route_id', 'r-poblacion-milagrosa', 'crew', 3),
    jsonb_build_object('id', 't2|status|demo0002', 'kind', 'status',
                       'at', extract(epoch from timestamptz '2026-10-06 07:30:00+08') * 1000,
                       'shift_id', 'shift|t2|demo0001', 'status', 'on_route')),
  jsonb_build_object(
    'shift_id', 'shift|t2|demo0001', 'source', 'demo', 'from_index', 0,
    'fixes', jsonb_build_array(jsonb_build_object(
      't', round(extract(epoch from now()) * 1000) - 5000, 'lng', 121.05, 'lat', 14.31, 'acc', 8))));
select pg_temp.as_user('admin');
select public.announcement_send(gen_random_uuid(), 'Demo announcement', array['milagrosa']);
select public.sms_lead_set(10);
select public.contact_set(null, '(046) 000-0000', null);
select public.suggestion_decide(date '2026-10-06', 'r-mabuhay', 'dispatched');
select public.schedule_change('r-bancal', date '2026-10-20', 't1', array[1, 4]::smallint[],
                              '06:00', '09:00', 'mixed');

select pg_temp.throws($$select public.demo_reset('yes')$$, 'confirm_required',
                      'a reset needs the word RESET');
select pg_temp.as_user('dispatcher');
select pg_temp.throws($$select public.demo_reset('RESET')$$, 'not_allowed',
                      'a dispatcher cannot reset');
select pg_temp.as_user('admin');
select pg_temp.remember('reset', public.demo_reset('RESET')::text);
select pg_temp.eq(pg_temp.recall('reset')::jsonb -> 'photos_to_remove' ->> 0, pg_temp.recall('photo'),
                  'the reset lists the photo files that are now unused');

select pg_temp.as_owner();
select pg_temp.eq(
  (select count(*) from public.truck_events) || '|' || (select count(*) from public.shifts) || '|'
  || (select count(*) from public.gps_batches) || '|' || (select count(*) from public.announcements) || '|'
  || (select count(*) from public.announcement_barangays) || '|'
  || (select count(*) from public.sms_lead_changes) || '|' || (select count(*) from public.contacts) || '|'
  || (select count(*) from public.suggestion_decisions) || '|'
  || (select count(*) from public.route_schedules) || '|'
  || (select count(*) from public.route_schedules where valid_from is not null) || '|'
  || (select count(*) from public.tickets) || '|' || (select count(*) from public.tickets where not is_sample),
  '0|0|0|0|0|0|0|0|6|0|12|0',
  'after a reset: no truck activity, messages, settings or staff-made schedules; only the 12 samples');
select pg_temp.eq(
  (select string_agg(
     right(t.id, 6)::integer || ':' || t.status || ':' || t.barangay_id || ':'
     || coalesce(t.dispatch_mode, '') || ':' || coalesce(t.dispatch_truck_id, '') || ':'
     || coalesce(t.rating::text, '') || ':'
     || (select count(*) from public.ticket_events e where e.ticket_id = t.id) || ':'
     || (select count(*) from public.ticket_photos p where p.ticket_id = t.id),
     ',' order by t.id)
   from public.tickets t),
  '101:verified:milagrosa::::1:2,102:submitted:brgy-3::::0:1,'
  || '103:scheduled:maduya:special_pickup:t4::1:1,104:submitted:lantic::::0:1,'
  || '105:scheduled:bancal:next_schedule:t1::1:1,106:collected:mabuhay:add_to_route:t3::4:3,'
  || '107:closed:cabilang-baybay:special_pickup:t2:5:4:3,108:submitted:brgy-3::::0:1,'
  || '109:verified:brgy-8::::1:1,110:collected:milagrosa:special_pickup:t2::2:3,'
  || '111:collected:milagrosa:special_pickup:t2::2:3,112:rejected:brgy-4::::1:1',
  'the sample tickets are rebuilt exactly as seeded');
select pg_temp.eq(
  (select to_char(t.created_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI')
   from public.tickets t where right(t.id, 6) = '000101'),
  '2026-10-05 01:55', 'their times are relative to the app''s clock (sample 101 is 30 hours old)');
select pg_temp.eq(
  (select string_agg(c.year || ':' || c.last_seq, ',') from private.ticket_counters c),
  '2026:112', 'ticket numbers start again after the samples');
select pg_temp.eq(
  (select count(*)::text from public.staff) || '|' || (select count(*) from private.truck_credentials)
  || '|' || (select count(*)::text from private.sms_subscriptions)
  || '|' || (select to_char(c.anchor_sim at time zone 'Asia/Manila', 'HH24:MI') from public.demo_clock c),
  pg_temp.recall('staff_before') || '|4|' || pg_temp.recall('subs_before') || '|07:55',
  'a reset keeps staff accounts, truck PINs, text sign-ups and the clock');
select pg_temp.as_user('resident');
select pg_temp.eq(
  public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479),
  'KPH-2026-000113', 'the next report after a reset is number 000113');
select pg_temp.as_user('admin');
select public.demo_clock_clear();

-- The loader refuses to run on a database that already has data.
select pg_temp.as_owner();
select pg_temp.throws($$select private.seed_load('{}'::jsonb)$$, 'already_seeded',
                      'the seed loader refuses a database that is already seeded');

-- =======================================================================================
-- D. The daily clean-up
-- =======================================================================================
select pg_temp.new_user('old_empty_guest');
select pg_temp.new_user('old_guest_with_report');
select pg_temp.new_user('old_guest_with_signup');
select pg_temp.new_user('new_empty_guest');
select pg_temp.new_user('old_login', 'old-login@test.invalid');
select pg_temp.new_user('expired_phone');
update auth.users set created_at = now() - interval '8 days'
where id in (pg_temp.uid('old_empty_guest'), pg_temp.uid('old_guest_with_report'),
             pg_temp.uid('old_guest_with_signup'), pg_temp.uid('old_login'),
             pg_temp.uid('expired_phone'));
update auth.users set created_at = now() where id = pg_temp.uid('new_empty_guest');
update public.tickets set reporter_id = pg_temp.uid('old_guest_with_report')
where id = 'KPH-2026-000113';
insert into private.sms_subscriptions (user_id, mobile, barangay_id)
values (pg_temp.uid('old_guest_with_signup'), '+639176660000', 'bancal');
insert into private.driver_sessions (user_id, truck_id, expires_at)
values (pg_temp.uid('expired_phone'), 't4', now() - interval '1 minute');
insert into public.shifts (id, truck_id, crew, started_at) values ('shift|t4|clean001', 't4', 2, now());
insert into public.gps_batches (shift_id, from_index, t0, dt_ms, lng_e6, lat_e6, acc_m) values
  ('shift|t4|clean001', 0, now() - interval '36 days', '{0}', '{121050000}', '{14310000}', '{8}'),
  ('shift|t4|clean001', 1, now() - interval '34 days', '{0}', '{121050000}', '{14310000}', '{8}');

select private.cleanup();
select pg_temp.eq(
  (select string_agg(w.name, ',' order by w.name)
   from _who w
   where w.name in ('old_empty_guest', 'old_guest_with_report', 'old_guest_with_signup',
                    'new_empty_guest', 'old_login', 'expired_phone')
     and not exists (select 1 from auth.users u where u.id = w.id)),
  'expired_phone,old_empty_guest',
  'clean-up removes guest identities over 7 days old that own nothing, and no one else');
select pg_temp.eq(
  (select count(*)::int from private.driver_sessions d
   where d.user_id in (pg_temp.uid('expired_phone'), pg_temp.uid('phone_t2'))),
  1, 'clean-up removes expired driver sessions and keeps live ones');
select pg_temp.eq(
  (select string_agg(b.from_index::text, ',') from public.gps_batches b
   where b.shift_id = 'shift|t4|clean001'),
  '1', 'clean-up removes GPS older than 35 days and keeps the rest');
select pg_temp.as_user('admin');
select pg_temp.throws('select private.cleanup()', '42501', 'the clean-up cannot be called through the API');

select pg_temp.finish();
