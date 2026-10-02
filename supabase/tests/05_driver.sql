-- KolektaPH pilot database · test 5 · driver sign-in and the driver upload
-- Run after 00_harness.sql, as one query. Uses the sample PIN (1234) the seed gives every truck.

-- ---------- The cast and two helpers ----------
select pg_temp.new_user('phone_a');
select pg_temp.new_user('phone_b');
select pg_temp.new_user('resident');
select pg_temp.new_user('admin', 'admin@test.invalid');
insert into public.staff (user_id, name, role) values (pg_temp.uid('admin'), 'Test Admin', 'admin');

-- One event as a phone would queue it, stamped "now", on the test shift unless told otherwise.
create function pg_temp.ev(
  p_id text, p_kind text, p_extra jsonb default '{}'::jsonb, p_shift text default 'shift|t3|drv00001'
)
returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'kind', p_kind, 'at', extract(epoch from now()) * 1000,
                            'shift_id', p_shift) || p_extra;
$$;
-- "stored,duplicate,rejected:reason" for a driver_upload reply.
create function pg_temp.results(p_reply jsonb)
returns text language sql as $$
  select string_agg((e ->> 'result') || coalesce(':' || (e ->> 'reason'), ''), ',' order by i)
  from jsonb_array_elements(p_reply -> 'events') with ordinality as x (e, i);
$$;
-- GPS fixes p_from..p_to of one recording: 5 seconds apart, starting 10 minutes ago.
create function pg_temp.fixes(p_from integer, p_to integer)
returns jsonb language sql as $$
  select jsonb_agg(
    jsonb_build_object(
      't', round(extract(epoch from now()) * 1000) - 600000 + i * 5000,
      'lng', 121.03 + i * 0.0001, 'lat', 14.30 + i * 0.00005,
      'acc', case when i % 3 = 0 then null else 8 + i % 5 end)
    order by i)
  from generate_series(p_from, p_to) as i;
$$;
grant execute on function pg_temp.ev(text, text, jsonb, text) to public;
grant execute on function pg_temp.results(jsonb) to public;
grant execute on function pg_temp.fixes(integer, integer) to public;
select pg_temp.remember('street' || x.rn, x.k)
from (select d.k, row_number() over (order by d.k collate "C") as rn
      from (select distinct s.barangay_id || '|' || coalesce(s.name, s.id) as k
            from public.route_segments s
            where s.route_id = 'r-mabuhay' and s.collect and s.barangay_id = 'mabuhay') as d) as x
where x.rn <= 2;

-- =======================================================================================
-- A. Sign-in with the truck code and PIN
-- =======================================================================================
select pg_temp.as_user('phone_a');
select pg_temp.eq(public.driver_sign_in('T9', '1234') ->> 'error', 'unknown_truck',
                  'an unknown truck code is refused');
select pg_temp.remember('in1', public.driver_sign_in(' t3 ', '1234')::text);
select pg_temp.eq(
  (pg_temp.recall('in1')::jsonb ->> 'ok') || '|' || (pg_temp.recall('in1')::jsonb ->> 'truck_id'),
  'true|t3', 'the right PIN signs the phone in to the truck (code typed loosely)');
select pg_temp.eq(private.my_truck(), 't3', 'the phone is now bound to Truck 3');
select pg_temp.as_owner();
select pg_temp.ok(
  (select d.expires_at between now() + interval '17 hours 59 minutes' and now() + interval '18 hours 1 minute'
   from private.driver_sessions d where d.user_id = pg_temp.uid('phone_a')),
  'the session lasts 18 hours');

-- Wrong PINs: counted on the truck, not logged; the fifth locks the truck for 15 minutes.
select pg_temp.as_user('phone_b');
select pg_temp.eq(
  (select string_agg((r ->> 'error') || ':' || (r ->> 'attempts_left') || ':' || ((r ->> 'locked_until') is not null),
                     ',' order by i)
   from (select i, public.driver_sign_in('T1', '000' || i) as r from generate_series(1, 5) as i) as x),
  'wrong_pin:4:false,wrong_pin:3:false,wrong_pin:2:false,wrong_pin:1:false,wrong_pin:5:true',
  'four wrong PINs count down; the fifth locks');
select pg_temp.eq(public.driver_sign_in('T1', '1234') ->> 'error', 'locked',
                  'while locked, even the right PIN is refused');
select pg_temp.eq(private.my_truck(), null, 'and the phone is not signed in');
select pg_temp.as_owner();
select pg_temp.ok(
  (select c.failed_attempts = 5
          and c.locked_until between now() + interval '14 minutes' and now() + interval '16 minutes'
   from private.truck_credentials c where c.truck_id = 't1'),
  'the first lock is 15 minutes');
-- The tenth wrong PIN locks for 30 minutes.
update private.truck_credentials set failed_attempts = 9, locked_until = null where truck_id = 't1';
select pg_temp.as_user('phone_b');
select pg_temp.eq(public.driver_sign_in('T1', '0000') ->> 'error', 'wrong_pin', 'a tenth wrong PIN');
select pg_temp.as_owner();
select pg_temp.ok(
  (select c.locked_until between now() + interval '29 minutes' and now() + interval '31 minutes'
   from private.truck_credentials c where c.truck_id = 't1'),
  'the second lock is 30 minutes (it doubles each time, up to 24 hours)');
select pg_temp.eq(
  (select count(*)::int from information_schema.tables t
   where t.table_schema in ('public', 'private') and t.table_name ~ '(attempt|login|audit|log)'),
  0, 'there is no table of sign-in attempts');

-- An admin sets a new PIN: the lock is cleared and the truck's phones are signed out.
select pg_temp.as_user('admin');
select pg_temp.throws($$select public.truck_pin_set('t1', '12')$$, 'bad_pin', 'a PIN must be 4 to 8 digits');
select pg_temp.throws($$select public.truck_pin_set('t9', '4321')$$, 'unknown_truck',
                      'a PIN for an unknown truck is refused');
select public.truck_pin_set('t1', '4321');
select pg_temp.as_user('phone_b');
select pg_temp.eq(public.driver_sign_in('T1', '1234') ->> 'error', 'wrong_pin', 'the old PIN no longer works');
select pg_temp.eq(public.driver_sign_in('T1', '4321') ->> 'ok', 'true', 'the new PIN works at once');
select pg_temp.as_owner();
select pg_temp.ok(
  (select c.failed_attempts = 0 and c.locked_until is null and c.pin_hash like '$2a$10$%'
   from private.truck_credentials c where c.truck_id = 't1'),
  'a successful sign-in resets the counter; the PIN is stored only as a bcrypt hash');
select pg_temp.as_user('admin');
select public.truck_pin_set('t1', '1234');
select pg_temp.as_user('phone_b');
select pg_temp.eq(private.my_truck(), null, 'a PIN change signs the truck''s phones out');

-- Without a truck session there is no upload.
select pg_temp.throws($$select public.driver_upload('[]'::jsonb, null)$$, 'driver_sign_in_required',
                      'a phone that is not signed in cannot upload');
select pg_temp.as_user('resident');
select pg_temp.throws($$select public.driver_upload('[]'::jsonb, null)$$, 'driver_sign_in_required',
                      'neither can a resident');

-- =======================================================================================
-- B. The crew's taps
-- =======================================================================================
select pg_temp.as_user('phone_a');
select pg_temp.remember('up1', public.driver_upload(jsonb_build_array(
  pg_temp.ev('t3|shift_start|drv00001', 'shift_start', '{"route_id": "r-mabuhay", "crew": 3}'),
  pg_temp.ev('t3|status|drv00002', 'status', '{"status": "on_route"}'),
  pg_temp.ev('t3|load|drv00003', 'load', '{"load": 0.5}'),
  pg_temp.ev('t3|street|drv00004', 'street',
             jsonb_build_object('street_key', pg_temp.recall('street1'), 'outcome', 'collected')),
  pg_temp.ev('t3|street|drv00005', 'street',
             jsonb_build_object('street_key', pg_temp.recall('street2'), 'outcome', 'skipped',
                                'reason', 'not_segregated')),
  pg_temp.ev('t3|incident|drv00006', 'incident', '{"incident": "flood", "minutes": 60}'),
  pg_temp.ev('t3|incident_end|drv00007', 'incident_end'),
  pg_temp.ev('t3|status|drv00008', 'status', '{"status": "full"}'),
  pg_temp.ev('t3|disposal|drv00009', 'disposal', '{"action": "arrive"}'),
  pg_temp.ev('t3|disposal|drv00010', 'disposal', '{"action": "leave"}')
))::text);
select pg_temp.eq(pg_temp.results(pg_temp.recall('up1')::jsonb),
                  'stored,stored,stored,stored,stored,stored,stored,stored,stored,stored',
                  'a shift start and nine taps are all stored');
select pg_temp.eq(
  (select s.truck_id || '|' || s.route_id || '|' || s.crew || '|' || (s.ended_at is null)
   from public.shifts s where s.id = 'shift|t3|drv00001'),
  't3|r-mabuhay|3|true', 'the shift start became a shift row, not an event');
select pg_temp.eq(
  (select string_agg(e.kind, ',' order by e.seq)
   from public.truck_events e where e.shift_id = 'shift|t3|drv00001'),
  'status,load,street,street,incident,incident_end,status,disposal,disposal',
  'the taps are stored in the order they were made');
select pg_temp.eq(
  (select string_agg(coalesce(e.status, e.load::text, e.disposal_action,
                              e.incident || '/' || e.incident_minutes,
                              e.street_outcome || '/' || coalesce(e.skip_reason, '-'), '-'),
                     ',' order by e.seq)
   from public.truck_events e where e.shift_id = 'shift|t3|drv00001'),
  'on_route,0.50,collected/-,skipped/not_segregated,flood/60,-,full,arrive,leave',
  'each tap keeps exactly the details of its kind');

-- The same upload again (a retry after a lost reply): nothing is stored twice.
select pg_temp.eq(
  pg_temp.results(public.driver_upload(jsonb_build_array(
    pg_temp.ev('t3|shift_start|drv00001', 'shift_start', '{"route_id": "r-mabuhay", "crew": 3}'),
    pg_temp.ev('t3|status|drv00002', 'status', '{"status": "on_route"}'),
    pg_temp.ev('t3|load|drv00003', 'load', '{"load": 0.5}')))),
  'duplicate,duplicate,duplicate', 'a repeated upload is recognised event by event');
select pg_temp.eq(
  (select count(*)::int from public.truck_events e where e.shift_id = 'shift|t3|drv00001'),
  9, 'and adds no row');

-- What is refused, without holding back the good taps around it.
select pg_temp.as_owner();
insert into public.shifts (id, truck_id, route_id, crew, started_at)
values ('shift|t2|other001', 't2', 'r-poblacion-milagrosa', 2, now());
select pg_temp.as_user('phone_a');
select pg_temp.remember('up2', public.driver_upload(jsonb_build_array(
  pg_temp.ev('t3|load|drv00020', 'load', '{"load": 0.75}'),
  pg_temp.ev('t3|fly|drv00021', 'fly'),
  pg_temp.ev('t3|status|drv00022', 'status', '{"status": "flying"}'),
  pg_temp.ev('t3|load|drv00023', 'load', '{"load": 0.9}'),
  pg_temp.ev('t3|street|drv00024', 'street', '{"street_key": "milagrosa|9th Street", "outcome": "collected"}'),
  pg_temp.ev('t3|street|drv00025', 'street',
             jsonb_build_object('street_key', pg_temp.recall('street1'), 'outcome', 'skipped')),
  pg_temp.ev('t3|street|drv00026', 'street',
             jsonb_build_object('street_key', pg_temp.recall('street1'), 'outcome', 'collected',
                                'reason', 'other')),
  pg_temp.ev('t3|incident|drv00027', 'incident', '{"incident": "flood", "minutes": 2}'),
  pg_temp.ev('t3|status|drv00028', 'status', '{"status": "break"}', 'shift|t3|nosuch01'),
  pg_temp.ev('t3|status|drv00029', 'status', '{"status": "break"}', 'shift|t2|other001'),
  pg_temp.ev('t3|shift_start|drv00030', 'shift_start', '{"route_id": "r-mabuhay", "crew": 2}',
             'shift|t2|other001'),
  pg_temp.ev('t3|shift_start|drv00031', 'shift_start', '{"route_id": "r-nowhere", "crew": 2}',
             'shift|t3|drv00002'),
  pg_temp.ev('t3|shift_start|drv00032', 'shift_start', '{"route_id": "r-mabuhay", "crew": 0}',
             'shift|t3|drv00003'),
  pg_temp.ev('short', 'status', '{"status": "break"}'),
  pg_temp.ev('t3|status|drv00034', 'status', '{"status": "break"}')
    || jsonb_build_object('at', extract(epoch from now() + interval '2 days') * 1000),
  pg_temp.ev('t3|status|drv00035', 'status', '{"status": "break"}')
))::text);
select pg_temp.eq(
  pg_temp.results(pg_temp.recall('up2')::jsonb),
  'stored,rejected:bad_kind,rejected:bad_value,rejected:bad_value,rejected:bad_street,'
  || 'rejected:bad_value,rejected:bad_value,rejected:bad_value,rejected:unknown_shift,'
  || 'rejected:unknown_shift,rejected:shift_taken,rejected:unknown_route,rejected:bad_value,'
  || 'rejected:bad_id,rejected:bad_time,stored',
  'each bad tap is refused with its reason; the good ones before and after are stored');
select pg_temp.eq(
  (select count(*)::int from public.truck_events e where e.shift_id = 'shift|t3|drv00001'),
  11, 'only the two good taps were added');
select pg_temp.eq(
  (select count(*)::int from public.truck_events e where e.shift_id = 'shift|t2|other001'),
  0, 'nothing was written to the other truck''s shift');
select pg_temp.throws(
  $$select public.driver_upload(
      (select jsonb_agg(pg_temp.ev('t3|status|bulk' || lpad(i::text, 4, '0'), 'status', '{"status": "break"}'))
       from generate_series(1, 201) as i), null)$$,
  'bad_events', 'more than 200 events in one upload is refused');

-- A shift with no route has no streets to mark.
select pg_temp.eq(
  pg_temp.results(public.driver_upload(jsonb_build_array(
    pg_temp.ev('t3|shift_start|drv00040', 'shift_start', '{"route_id": null, "crew": 1}', 'shift|t3|drv00040'),
    pg_temp.ev('t3|street|drv00041', 'street',
               jsonb_build_object('street_key', pg_temp.recall('street1'), 'outcome', 'collected'),
               'shift|t3|drv00040')))),
  'stored,rejected:bad_street', 'a shift without a route takes no street marks');

-- Ending the shift.
select pg_temp.eq(
  pg_temp.results(public.driver_upload(jsonb_build_array(
    pg_temp.ev('t3|shift_end|drv00050', 'shift_end'),
    pg_temp.ev('t3|shift_end|drv00050', 'shift_end')))),
  'stored,duplicate', 'the shift end is stored once');
select pg_temp.ok((select s.ended_at is not null from public.shifts s where s.id = 'shift|t3|drv00001'),
                  'the shift row has its end time');

-- =======================================================================================
-- C. GPS
-- =======================================================================================
select pg_temp.remember('gps1', public.driver_upload('[]'::jsonb, jsonb_build_object(
  'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 0,
  'fixes', pg_temp.fixes(0, 36)))::text);
select pg_temp.eq(pg_temp.recall('gps1')::jsonb -> 'gps' ->> 'result', 'stored', 'the first 37 fixes are stored');
select pg_temp.eq((pg_temp.recall('gps1')::jsonb -> 'gps' ->> 'next_index')::int, 37,
                  'and the server says it expects fix 37 next');
-- The reply was lost; the phone sends again from 0, now with 15 more fixes.
select pg_temp.remember('gps2', public.driver_upload('[]'::jsonb, jsonb_build_object(
  'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 0,
  'fixes', pg_temp.fixes(0, 51)))::text);
select pg_temp.eq(
  (pg_temp.recall('gps2')::jsonb -> 'gps' ->> 'result') || '|' || (pg_temp.recall('gps2')::jsonb -> 'gps' ->> 'next_index'),
  'stored|52', 'a retry that carries more fixes stores only the new tail');
select pg_temp.eq(
  (select string_agg(b.from_index || '+' || b.fix_count, ',' order by b.from_index)
   from public.gps_batches b where b.shift_id = 'shift|t3|drv00001'),
  '0+37,37+15', 'no fix is stored twice and none is missing');
select pg_temp.eq(
  (public.driver_upload('[]'::jsonb, jsonb_build_object(
     'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 0,
     'fixes', pg_temp.fixes(0, 51))) -> 'gps' ->> 'result'),
  'duplicate', 'the same batch again is a duplicate');
select pg_temp.remember('gps3', public.driver_upload('[]'::jsonb, jsonb_build_object(
  'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 60,
  'fixes', pg_temp.fixes(60, 70)))::text);
select pg_temp.eq(
  (pg_temp.recall('gps3')::jsonb -> 'gps' ->> 'result') || '|' || (pg_temp.recall('gps3')::jsonb -> 'gps' ->> 'next_index'),
  'gap|52', 'a batch that skips ahead is not stored; the server asks for fix 52');
-- Reading a fix back: exactly what the phone sent.
select pg_temp.eq(
  (select round(extract(epoch from b.t0) * 1000) + b.dt_ms[4] || '|' || b.lng_e6[4] || '|' || b.lat_e6[4]
          || '|' || coalesce(b.acc_m[4]::text, 'null') || '|' || coalesce(b.acc_m[3]::text, 'null')
   from public.gps_batches b where b.shift_id = 'shift|t3|drv00001' and b.from_index = 37),
  (round(extract(epoch from now()) * 1000) - 600000 + 40 * 5000) || '|121034000|14302000|8|null',
  'fix 40 reads back with its time, position and accuracy (and fix 39 with no accuracy)');
select pg_temp.eq(
  (select s.gps_source from public.shifts s where s.id = 'shift|t3|drv00001'),
  'phone', 'the shift records where its GPS comes from');

select pg_temp.eq(
  (select string_agg(x.r, ',' order by x.n)
   from (values
     (1, public.driver_upload('[]'::jsonb, jsonb_build_object(
           'shift_id', 'shift|t3|drv00001', 'source', 'demo', 'from_index', 52,
           'fixes', pg_temp.fixes(52, 53))) -> 'gps' ->> 'reason'),
     (2, public.driver_upload('[]'::jsonb, jsonb_build_object(
           'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 52,
           'fixes', pg_temp.fixes(52, 260))) -> 'gps' ->> 'reason'),
     (3, public.driver_upload('[]'::jsonb, jsonb_build_object(
           'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 52,
           'fixes', jsonb_build_array(jsonb_build_object(
             't', round(extract(epoch from now()) * 1000), 'lng', 2.35, 'lat', 48.85, 'acc', 5)))) -> 'gps' ->> 'reason'),
     (4, public.driver_upload('[]'::jsonb, jsonb_build_object(
           'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 52,
           'fixes', jsonb_build_array(jsonb_build_object(
             't', round(extract(epoch from now()) * 1000), 'lng', 121.03, 'lat', 14.3, 'acc', 150)))) -> 'gps' ->> 'reason'),
     (5, public.driver_upload('[]'::jsonb, jsonb_build_object(
           'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 52,
           'fixes', jsonb_build_array(
             jsonb_build_object('t', round(extract(epoch from now()) * 1000), 'lng', 121.03, 'lat', 14.3, 'acc', 5),
             jsonb_build_object('t', round(extract(epoch from now()) * 1000) - 9000, 'lng', 121.03, 'lat', 14.3, 'acc', 5)))) -> 'gps' ->> 'reason'),
     (6, public.driver_upload('[]'::jsonb, jsonb_build_object(
           'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 52,
           'fixes', jsonb_build_array(jsonb_build_object(
             't', round(extract(epoch from now()) * 1000) - 3600000, 'lng', 121.03, 'lat', 14.3, 'acc', 5)))) -> 'gps' ->> 'reason'),
     (7, public.driver_upload('[]'::jsonb, jsonb_build_object(
           'shift_id', 'shift|t3|drv00001', 'source', 'phone', 'from_index', 52,
           'fixes', jsonb_build_array(jsonb_build_object(
             't', round(extract(epoch from now()) * 1000) + 86400000, 'lng', 121.03, 'lat', 14.3, 'acc', 5)))) -> 'gps' ->> 'reason'),
     (8, public.driver_upload('[]'::jsonb, jsonb_build_object(
           'shift_id', 'shift|t3|nosuch01', 'source', 'phone', 'from_index', 0,
           'fixes', pg_temp.fixes(0, 1))) -> 'gps' ->> 'reason'),
     (9, public.driver_upload('[]'::jsonb, jsonb_build_object(
           'shift_id', 'shift|t2|other001', 'source', 'phone', 'from_index', 0,
           'fixes', pg_temp.fixes(0, 1))) -> 'gps' ->> 'reason')
   ) as x (n, r)),
  'source_changed,bad_batch,bad_fixes,bad_fixes,bad_fixes,bad_time,bad_time,unknown_shift,unknown_shift',
  'refused GPS: a changed source, over 200 fixes, a position outside the country, accuracy over 100 m, '
  || 'time running backwards, a fix older than what is stored, a fix from the future, an unknown shift, '
  || 'another truck''s shift');
select pg_temp.eq(
  (select sum(b.fix_count)::int from public.gps_batches b where b.shift_id = 'shift|t3|drv00001'),
  52, 'refused batches stored nothing');

-- =======================================================================================
-- D. The tables themselves refuse impossible rows
-- =======================================================================================
select pg_temp.as_owner();
select pg_temp.throws(
  $$insert into public.truck_events (id, truck_id, shift_id, at, kind, status, load)
    values ('t3|status|chk00001', 't3', 'shift|t3|drv00001', now(), 'status', 'full', 0.5)$$,
  '23514', 'table rule: a status tap cannot also carry a load');
select pg_temp.throws(
  $$insert into public.truck_events (id, truck_id, at, kind, status)
    values ('t3|status|chk00002', 't3', now(), 'status', 'full')$$,
  '23514', 'table rule: only a demo incident may have no shift');
select pg_temp.throws(
  $$insert into public.truck_events (id, truck_id, shift_id, at, kind, status)
    values ('t3|status|chk00003', 't3', 'shift|t2|other001', now(), 'status', 'full')$$,
  '23503', 'table rule: a tap''s shift must belong to its truck');
select pg_temp.throws(
  $$insert into public.gps_batches (shift_id, from_index, t0, dt_ms, lng_e6, lat_e6, acc_m)
    values ('shift|t2|other001', 0, now(), '{0,5000}', '{121030000}', '{14300000,14300050}', '{5,5}')$$,
  '23514', 'table rule: the GPS arrays have the same length');
select pg_temp.throws(
  $$insert into public.gps_batches (shift_id, from_index, t0, dt_ms, lng_e6, lat_e6, acc_m)
    values ('shift|t2|other001', 0, now(), '{0,5000}', '{121030000,2350000}', '{14300000,14300050}', '{5,5}')$$,
  '23514', 'table rule: positions stay inside the sanity box');
select pg_temp.throws(
  $$insert into public.gps_batches (shift_id, from_index, t0, dt_ms, lng_e6, lat_e6, acc_m)
    values ('shift|t2|other001', 0, now(), '{5000,0}', '{121030000,121030010}', '{14300000,14300050}', '{5,5}')$$,
  '23514', 'table rule: fix times never run backwards');
select pg_temp.throws(
  $$insert into public.shifts (id, truck_id, crew, started_at, ended_at)
    values ('shift|t3|chk00009', 't3', 2, now(), now() - interval '1 hour')$$,
  '23514', 'table rule: a shift cannot end before it starts');

select pg_temp.finish();
