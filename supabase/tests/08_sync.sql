-- KolektaPH pilot database · test 8 · what a connected app reads: pulse and shift_gps
-- Run after 00_harness.sql, as one query.

-- ---------- The cast and two helpers ----------
select pg_temp.new_user('resident_a');
select pg_temp.new_user('resident_b');
select pg_temp.new_user('phone_t2');
select pg_temp.new_user('admin', 'admin@test.invalid');
select pg_temp.new_user('dispatcher', 'dispatcher@test.invalid');
select pg_temp.new_user('focal', 'focal@test.invalid');
select pg_temp.new_user('new_login', 'new@test.invalid');
insert into public.staff (user_id, name, role, barangay_id) values
  (pg_temp.uid('admin'), 'Test Admin', 'admin', null),
  (pg_temp.uid('dispatcher'), 'Test Dispatcher', 'dispatcher', null),
  (pg_temp.uid('focal'), 'Test Focal', 'barangay', 'milagrosa');
insert into private.driver_sessions (user_id, truck_id, expires_at)
values (pg_temp.uid('phone_t2'), 't2', now() + interval '1 hour');

-- One event as a phone would queue it, stamped "now".
create function pg_temp.ev(p_id text, p_kind text, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'kind', p_kind, 'at', round(extract(epoch from now()) * 1000),
                            'shift_id', 'shift|t2|sync0001') || p_extra;
$$;
-- The fingerprint of one set, as the caller sees it now.
create function pg_temp.rev(p_set text)
returns text language sql as $$
  select public.pulse(0) -> 'rev' ->> p_set;
$$;
grant execute on function pg_temp.ev(text, text, jsonb) to public;
grant execute on function pg_temp.rev(text) to public;
-- Values only the owner can work out, kept for later.
select pg_temp.remember('sample_rev',
  (select count(*)::text from public.tickets t where t.is_sample) || ':' ||
  (select count(*)::text || ':' || coalesce(max(e.id), 0)::text
   from public.ticket_events e join public.tickets t on t.id = e.ticket_id where t.is_sample));
select pg_temp.remember('today', ((now() at time zone 'Asia/Manila')::date)::text);
select pg_temp.remember('mabuhay_day',
  (select d::date::text
   from generate_series(pg_temp.recall('today')::date - 6, pg_temp.recall('today')::date,
                        interval '1 day') as d
   where private.route_runs_on('r-mabuhay', d::date)
   order by d desc limit 1));

-- =======================================================================================
-- A. Without sign-in
-- =======================================================================================
select pg_temp.as_anon();
select pg_temp.eq(
  (select string_agg(k, ' ' order by k) from jsonb_object_keys(public.pulse(0)) as k),
  'clock events first_seq last_seq me now reference rev',
  'pulse answers with the clock, the caller, the events and the fingerprints');
select pg_temp.eq(
  (select string_agg(k, ' ' order by k) from jsonb_object_keys(public.pulse(0) -> 'rev') as k),
  'announcements contacts lead schedules shifts tickets',
  'without sign-in: fingerprints of the six public sets only');
select pg_temp.eq(public.pulse(0) -> 'me', '{"role": null, "truck": null, "barangay": null}'::jsonb,
                  'without sign-in: no role, no truck');
select pg_temp.eq(
  (public.pulse(0) ->> 'reference') || '|' || (public.pulse(0) -> 'clock' ->> 'speed') || '|'
    || (public.pulse(0) -> 'clock' -> 'anchor_sim')::text || '|'
    || (abs((public.pulse(0) ->> 'now')::numeric - extract(epoch from now()) * 1000) < 60000),
  (select m.reference_version from public.city_meta m) || '|1|null|true',
  'the map data version, a live clock and the server''s own time (epoch ms)');
select pg_temp.eq(
  pg_temp.rev('tickets'), pg_temp.recall('sample_rev'),
  'without sign-in the ticket fingerprint covers the sample reports and their actions, nothing else');
select pg_temp.throws($$select * from public.shift_gps(now() - interval '1 day')$$, '42501',
                      'GPS counts cannot be read without sign-in');

-- =======================================================================================
-- B. Truck events: only what is new, in order
-- =======================================================================================
select pg_temp.as_owner();
select pg_temp.remember('seq0', coalesce((select max(e.seq) from public.truck_events e), 0)::text);
select pg_temp.remember('shifts0', pg_temp.rev('shifts'));
select pg_temp.as_user('phone_t2');
select pg_temp.remember('up', public.driver_upload(jsonb_build_array(
  pg_temp.ev('t2|shift_start|sync0001', 'shift_start', '{"route_id": "r-poblacion-milagrosa", "crew": 3}'),
  pg_temp.ev('t2|status|sync0002', 'status', '{"status": "on_route"}'),
  pg_temp.ev('t2|load|sync0003', 'load', '{"load": 0.5}'),
  pg_temp.ev('t2|status|sync0004', 'status', '{"status": "full"}')
))::text);

select pg_temp.as_anon();
select pg_temp.eq(
  (select string_agg(e ->> 'id', ',' order by i)
   from jsonb_array_elements(public.pulse(pg_temp.recall('seq0')::bigint) -> 'events')
        with ordinality as x (e, i)),
  't2|status|sync0002,t2|load|sync0003,t2|status|sync0004',
  'events after the cursor come back oldest first; the shift start is not an event');
select pg_temp.eq(
  public.pulse(pg_temp.recall('seq0')::bigint) -> 'events' -> 1,
  (select jsonb_build_object('seq', e.seq, 'id', e.id, 'truck_id', 't2', 'shift_id', 'shift|t2|sync0001',
                             'at', round(extract(epoch from e.at) * 1000), 'kind', 'load', 'load', 0.5)
   from public.truck_events e where e.id = 't2|load|sync0003'),
  'an event carries only the columns of its kind, with its time in epoch ms');
select pg_temp.eq(
  (select string_agg(e ->> 'id', ',')
   from jsonb_array_elements(
     public.pulse((select e.seq from public.truck_events e where e.id = 't2|load|sync0003')) -> 'events') as e),
  't2|status|sync0004', 'a cursor in the middle returns only what came after it');
select pg_temp.eq(
  jsonb_array_length(public.pulse((public.pulse(0) ->> 'last_seq')::bigint) -> 'events'),
  0, 'nothing new after the last event');
select pg_temp.eq(
  ((public.pulse(0) ->> 'first_seq')::bigint <= (public.pulse(0) ->> 'last_seq')::bigint)::text || '|'
    || (public.pulse(0) ->> 'last_seq'),
  'true|' || (select max(e.seq) from public.truck_events e),
  'pulse tells the oldest and the newest event the server holds');
select pg_temp.ok(pg_temp.rev('shifts') <> pg_temp.recall('shifts0'),
                  'a new shift changes the shifts fingerprint');

-- An event more than nine days old (by the app's clock) is not sent to devices.
select pg_temp.as_owner();
insert into public.truck_events (id, truck_id, shift_id, at, kind, status)
values ('t2|status|syncold1', 't2', 'shift|t2|sync0001', now() - interval '10 days', 'status', 'break');
select pg_temp.as_anon();
select pg_temp.eq(
  (select count(*)::int
   from jsonb_array_elements(public.pulse(pg_temp.recall('seq0')::bigint) -> 'events') as e
   where e ->> 'id' = 't2|status|syncold1'),
  0, 'events older than nine days are left out');

-- Ending the shift is a change of the shift, not an event.
select pg_temp.remember('shifts1', pg_temp.rev('shifts'));
select pg_temp.remember('seq1', public.pulse(0) ->> 'last_seq');
select pg_temp.as_user('phone_t2');
select public.driver_upload(jsonb_build_array(pg_temp.ev('t2|shift_end|sync0005', 'shift_end')));
select pg_temp.as_anon();
select pg_temp.eq(
  (pg_temp.rev('shifts') <> pg_temp.recall('shifts1'))::text || '|' || (public.pulse(0) ->> 'last_seq'),
  'true|' || pg_temp.recall('seq1'),
  'a shift end changes the shifts fingerprint and adds no event');

-- =======================================================================================
-- C. Who the caller is
-- =======================================================================================
select pg_temp.as_user('admin');
select pg_temp.eq(public.pulse(0) -> 'me', '{"role": "admin", "truck": null, "barangay": null}'::jsonb,
                  'an admin is told its role');
select pg_temp.eq(
  (select string_agg(k, ' ' order by k) from jsonb_object_keys(public.pulse(0) -> 'rev') as k),
  'announcements contacts decisions gps lead schedules shifts staff tickets',
  'a signed-in caller also gets the fingerprints of decisions, staff and GPS');
select pg_temp.as_user('focal');
select pg_temp.eq(public.pulse(0) -> 'me',
                  '{"role": "barangay", "truck": null, "barangay": "milagrosa"}'::jsonb,
                  'a barangay focal person is told its barangay');
select pg_temp.as_user('phone_t2');
select pg_temp.eq(public.pulse(0) -> 'me', '{"role": null, "truck": "t2", "barangay": null}'::jsonb,
                  'a truck phone is told its truck');
select pg_temp.as_user('resident_a');
select pg_temp.eq(public.pulse(0) -> 'me', '{"role": null, "truck": null, "barangay": null}'::jsonb,
                  'a resident has neither');
select pg_temp.as_owner();
update private.driver_sessions set expires_at = now() - interval '1 minute'
where user_id = pg_temp.uid('phone_t2');
select pg_temp.as_user('phone_t2');
select pg_temp.eq(public.pulse(0) -> 'me' -> 'truck', 'null'::jsonb,
                  'an expired truck sign-in shows at the next pulse');
select pg_temp.as_owner();
update private.driver_sessions set expires_at = now() + interval '1 hour'
where user_id = pg_temp.uid('phone_t2');

-- =======================================================================================
-- D. A fingerprint changes exactly when its set changes for that caller
-- =======================================================================================
-- Tickets: a new report shows for its reporter and for staff, not for another resident.
select pg_temp.as_user('resident_a');
select pg_temp.remember('a_tickets', pg_temp.rev('tickets'));
select pg_temp.as_user('resident_b');
select pg_temp.remember('b_tickets', pg_temp.rev('tickets'));
select pg_temp.as_user('admin');
select pg_temp.remember('admin_tickets', pg_temp.rev('tickets'));
select pg_temp.as_user('phone_t2');
select pg_temp.remember('phone_tickets', pg_temp.rev('tickets'));

select pg_temp.as_user('resident_a');
select pg_temp.remember('t1', public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479));
select pg_temp.ok(pg_temp.rev('tickets') <> pg_temp.recall('a_tickets'),
                  'a new report changes the reporter''s ticket fingerprint');
select pg_temp.as_user('resident_b');
select pg_temp.eq(pg_temp.rev('tickets'), pg_temp.recall('b_tickets'),
                  'another resident''s fingerprint does not move');
select pg_temp.as_user('admin');
select pg_temp.ok(pg_temp.rev('tickets') <> pg_temp.recall('admin_tickets'),
                  'staff see the new report at once');

-- Every action on a ticket moves it; a dispatch makes it appear on the truck's phone.
select pg_temp.remember('admin_tickets', pg_temp.rev('tickets'));
select pg_temp.as_user('dispatcher');
select public.ticket_dispatch(pg_temp.recall('t1'), 'special_pickup', 't2', null);
select pg_temp.as_user('admin');
select pg_temp.ok(pg_temp.rev('tickets') <> pg_temp.recall('admin_tickets'),
                  'an action on a ticket changes the fingerprint');
select pg_temp.as_user('phone_t2');
select pg_temp.ok(pg_temp.rev('tickets') <> pg_temp.recall('phone_tickets'),
                  'a pickup dispatched to a truck changes that phone''s fingerprint');
select pg_temp.as_user('resident_b');
select pg_temp.eq(pg_temp.rev('tickets'), pg_temp.recall('b_tickets'),
                  'and still nothing for a resident who cannot see the ticket');

-- Schedules, lead time, contacts, announcements: public sets.
select pg_temp.as_anon();
select pg_temp.remember('schedules0', pg_temp.rev('schedules'));
select pg_temp.remember('lead0', pg_temp.rev('lead'));
select pg_temp.remember('contacts0', pg_temp.rev('contacts'));
select pg_temp.remember('ann0', pg_temp.rev('announcements'));
select pg_temp.as_user('dispatcher');
select public.schedule_change('r-bancal', pg_temp.recall('today')::date + 3, 't1', '{1,3}', '08:00',
                              '11:00', 'mixed');
select pg_temp.as_anon();
select pg_temp.eq(
  (pg_temp.rev('schedules') <> pg_temp.recall('schedules0'))::text || '|'
    || (pg_temp.rev('lead') = pg_temp.recall('lead0'))::text || '|'
    || (pg_temp.rev('contacts') = pg_temp.recall('contacts0'))::text || '|'
    || (pg_temp.rev('announcements') = pg_temp.recall('ann0'))::text,
  'true|true|true|true', 'a schedule change moves the schedules fingerprint and no other');
select pg_temp.as_user('admin');
select public.sms_lead_set(20);
select public.contact_set(null, '(046) 000 0000', 'Lunes-Biyernes');
select pg_temp.as_user('dispatcher');
select public.announcement_send(gen_random_uuid(), 'Paalala po.', array['milagrosa']);
select pg_temp.as_anon();
select pg_temp.eq(
  (pg_temp.rev('lead') <> pg_temp.recall('lead0'))::text || '|'
    || (pg_temp.rev('contacts') <> pg_temp.recall('contacts0'))::text || '|'
    || (pg_temp.rev('announcements') <> pg_temp.recall('ann0'))::text,
  'true|true|true', 'a lead-time change, a contact and an announcement each move their own');
select pg_temp.remember('contacts1', pg_temp.rev('contacts'));
select pg_temp.as_user('admin');
select public.contact_set(null, '(046) 000 0000', 'Lunes-Sabado');
select pg_temp.as_anon();
select pg_temp.ok(pg_temp.rev('contacts') <> pg_temp.recall('contacts1'),
                  'editing a contact in place is seen too');

-- Decisions and staff: only for those who may read them.
select pg_temp.as_user('admin');
select pg_temp.remember('dec0', pg_temp.rev('decisions'));
select pg_temp.remember('staff0', pg_temp.rev('staff'));
select pg_temp.as_user('resident_a');
select pg_temp.remember('res_dec0', pg_temp.rev('decisions'));
select pg_temp.remember('res_staff0', pg_temp.rev('staff'));
select pg_temp.as_user('dispatcher');
select pg_temp.remember('disp_staff0', pg_temp.rev('staff'));
select public.suggestion_decide(pg_temp.recall('mabuhay_day')::date, 'r-mabuhay', 'dismissed');
select pg_temp.as_user('admin');
select public.staff_save(pg_temp.uid('new_login'), 'New Viewer', 'viewer', null, true);
select pg_temp.eq(
  (pg_temp.rev('decisions') <> pg_temp.recall('dec0'))::text || '|'
    || (pg_temp.rev('staff') <> pg_temp.recall('staff0'))::text,
  'true|true', 'a decision and a staff change move the admin''s fingerprints');
select pg_temp.as_user('dispatcher');
select pg_temp.eq(pg_temp.rev('staff'), pg_temp.recall('disp_staff0'),
                  'a dispatcher reads only its own staff row, so its fingerprint stays');
select pg_temp.as_user('resident_a');
select pg_temp.eq(
  (pg_temp.rev('decisions') = pg_temp.recall('res_dec0'))::text || '|'
    || (pg_temp.rev('staff') = pg_temp.recall('res_staff0'))::text || '|'
    || (pg_temp.rev('decisions') = md5(''))::text,
  'true|true|true', 'a resident sees neither set, before or after');

-- =======================================================================================
-- E. GPS: the fingerprint and the per-shift counts
-- =======================================================================================
select pg_temp.as_user('admin');
select pg_temp.remember('gps0', pg_temp.rev('gps'));
select pg_temp.as_owner();
update public.shifts set ended_at = null where id = 'shift|t2|sync0001';
select pg_temp.as_user('phone_t2');
select pg_temp.remember('gps_up', (public.driver_upload('[]'::jsonb, jsonb_build_object(
  'shift_id', 'shift|t2|sync0001', 'source', 'phone', 'from_index', 0,
  'fixes', (select jsonb_agg(jsonb_build_object(
              't', round(extract(epoch from now()) * 1000) - 60000 + i * 5000,
              'lng', 121.05 + i * 0.0001, 'lat', 14.31, 'acc', 8) order by i)
            from generate_series(0, 6) as i))) -> 'gps')::text);
select pg_temp.eq(pg_temp.recall('gps_up')::jsonb ->> 'next_index', '7', 'seven fixes are stored');
select pg_temp.eq(
  (select g.source || '|' || g.points || '|'
          || (abs(g.last_fix_at - (extract(epoch from now()) * 1000 - 30000)) < 2)
   from public.shift_gps(now() - interval '1 day') g where g.shift_id = 'shift|t2|sync0001'),
  'phone|7|true', 'the phone reads its own shift: source, fixes and the time of the last one');
select pg_temp.as_user('admin');
select pg_temp.eq(
  (pg_temp.rev('gps') <> pg_temp.recall('gps0'))::text || '|'
    || (select g.points from public.shift_gps(now() - interval '1 day') g
        where g.shift_id = 'shift|t2|sync0001'),
  'true|7', 'staff see the GPS fingerprint move and the same count');
select pg_temp.eq(
  (select count(*)::int from public.shift_gps(now() + interval '1 day')),
  0, 'shift_gps only covers shifts started since the given time');
select pg_temp.as_user('resident_a');
select pg_temp.eq(
  (select count(*)::int from public.shift_gps(now() - interval '1 day'))::text || '|' || pg_temp.rev('gps'),
  '0|0:0', 'a resident gets no GPS counts');
select pg_temp.as_user('focal');
select pg_temp.eq(
  (select count(*)::int from public.shift_gps(now() - interval '1 day')),
  0, 'neither does a barangay focal person');

-- =======================================================================================
-- F. The clock, and a demo reset
-- =======================================================================================
select pg_temp.as_user('admin');
select public.demo_clock_set(timestamptz '2026-10-06 07:25:00+08', 10::smallint);
select pg_temp.as_anon();
select pg_temp.eq(
  (public.pulse(0) -> 'clock' ->> 'anchor_sim') || '|' || (public.pulse(0) -> 'clock' ->> 'speed') || '|'
    || (abs((public.pulse(0) -> 'clock' ->> 'anchor_real')::numeric - extract(epoch from now()) * 1000) < 2),
  (extract(epoch from timestamptz '2026-10-06 07:25:00+08') * 1000)::bigint || '|10|true',
  'every device reads the same demo time and speed (epoch ms)');
select pg_temp.as_user('admin');
select public.demo_clock_clear();
select pg_temp.remember('admin_tickets', pg_temp.rev('tickets'));
select public.demo_reset('RESET');
select pg_temp.eq(
  (public.pulse(0) -> 'first_seq')::text || '|' || (public.pulse(0) -> 'last_seq')::text || '|'
    || jsonb_array_length(public.pulse(0) -> 'events') || '|'
    || (pg_temp.rev('tickets') <> pg_temp.recall('admin_tickets'))::text || '|'
    || (pg_temp.rev('shifts') = md5(''))::text,
  'null|null|0|true|true',
  'after a reset no event is left, and the ticket and shift fingerprints say so');

-- =======================================================================================
-- G. Both functions only read
-- =======================================================================================
select pg_temp.as_owner();
select pg_temp.eq(
  (select string_agg(p.proname || ':' || p.provolatile::text || ':' || p.prosecdef::text, ' '
                     order by p.proname)
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('pulse', 'shift_gps')),
  'pulse:s:false shift_gps:s:false', 'pulse and shift_gps are read-only and run as the caller');

select pg_temp.finish();
