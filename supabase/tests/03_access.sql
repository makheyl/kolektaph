-- KolektaPH pilot database · test 3 · who can read what
-- Run after 00_harness.sql, as one query.

-- ---------- The cast (exists only inside this run) ----------
select pg_temp.new_user('resident_a');
select pg_temp.new_user('resident_b');
select pg_temp.new_user('phone_t3');
select pg_temp.new_user('phone_t2');
select pg_temp.new_user('admin', 'admin@test.invalid');
select pg_temp.new_user('dispatcher', 'dispatcher@test.invalid');
select pg_temp.new_user('viewer', 'viewer@test.invalid');
select pg_temp.new_user('focal', 'focal@test.invalid');
select pg_temp.new_user('stranger', 'stranger@test.invalid');
insert into public.staff (user_id, name, role, barangay_id) values
  (pg_temp.uid('admin'), 'Test Admin', 'admin', null),
  (pg_temp.uid('dispatcher'), 'Test Dispatcher', 'dispatcher', null),
  (pg_temp.uid('viewer'), 'Test Viewer', 'viewer', null),
  (pg_temp.uid('focal'), 'Test Focal', 'barangay', 'milagrosa');
insert into private.driver_sessions (user_id, truck_id, expires_at) values
  (pg_temp.uid('phone_t3'), 't3', now() + interval '1 hour'),
  (pg_temp.uid('phone_t2'), 't2', now() + interval '1 hour');
select pg_temp.remember('samples', (select count(*) from public.tickets where is_sample)::text);
select pg_temp.remember('sample_events',
  (select count(*) from public.ticket_events e join public.tickets t on t.id = e.ticket_id
   where t.is_sample)::text);
select pg_temp.remember('staff_before', (select count(*) - 4 from public.staff)::text);

-- ---------- Something to look at, entered the way the app would ----------
select pg_temp.as_user('resident_a');
select pg_temp.remember('ticket_a', public.report_submit(
  gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479, 8, 'Tabi ng kanal', true, false,
  null, false, '[{"slot": "wide", "sample": "dumping"}]'::jsonb));
select pg_temp.remember('sms_a', public.sms_subscribe('+639171234567', 'milagrosa')::text);

select pg_temp.as_user('resident_b');
select pg_temp.remember('ticket_b', public.report_submit(
  gen_random_uuid(), 'BULKY', 'pile', 121.034393, 14.303537));

select pg_temp.as_user('dispatcher');
select public.ticket_dispatch(pg_temp.recall('ticket_b'), 'special_pickup', 't3',
                              now() + interval '4 hours');
select public.suggestion_decide(date '2026-10-06', 'r-mabuhay', 'dispatched');
select pg_temp.remember('announcement',
  public.announcement_send(gen_random_uuid(), 'Test announcement', array['milagrosa'])::text);

select pg_temp.as_user('phone_t3');
select pg_temp.remember('upload', public.driver_upload(
  jsonb_build_array(
    jsonb_build_object('id', 't3|shift_start|test0001', 'kind', 'shift_start',
                       'at', extract(epoch from now()) * 1000, 'shift_id', 'shift|t3|test0001',
                       'route_id', 'r-mabuhay', 'crew', 3),
    jsonb_build_object('id', 't3|status|test0002', 'kind', 'status',
                       'at', extract(epoch from now()) * 1000, 'shift_id', 'shift|t3|test0001',
                       'status', 'on_route')),
  jsonb_build_object(
    'shift_id', 'shift|t3|test0001', 'source', 'demo', 'from_index', 0,
    'fixes', jsonb_build_array(
      jsonb_build_object('t', extract(epoch from now()) * 1000 - 10000,
                         'lng', 121.0340, 'lat', 14.3035, 'acc', 8),
      jsonb_build_object('t', extract(epoch from now()) * 1000 - 5000,
                         'lng', 121.0341, 'lat', 14.3036, 'acc', null)))
)::text);

-- ---------- Without sign-in ----------
select pg_temp.as_anon();
select pg_temp.eq((select count(*)::int from public.barangays), 14, 'no sign-in: reads barangays');
select pg_temp.eq((select count(*)::int from public.route_segments), 291,
                  'no sign-in: reads routes and segments');
select pg_temp.eq(
  (select count(*)::int from (select id, days, start_time, valid_from from public.route_schedules) s),
  6, 'no sign-in: reads schedules');
select pg_temp.ok(exists (select 1 from public.truck_events e where e.id = 't3|status|test0002'),
                  'no sign-in: reads truck events');
select pg_temp.ok(exists (select 1 from public.shifts s where s.id = 'shift|t3|test0001'),
                  'no sign-in: reads shifts');
select pg_temp.ok(
  exists (select 1 from (select body from public.announcements) a where a.body = 'Test announcement'),
  'no sign-in: reads announcements');
select pg_temp.ok((select c.server_now is not null from public.clock() c), 'no sign-in: reads the clock');
select pg_temp.eq((select count(*)::text from (select id from public.tickets) t),
                  pg_temp.recall('samples'), 'no sign-in: sees the sample tickets and nothing else');
select pg_temp.eq((select count(*)::text from (select id from public.ticket_events) e),
                  pg_temp.recall('sample_events'), 'no sign-in: sees only the samples'' actions');
select pg_temp.eq(
  (select count(*)::int from public.ticket_photos p
   where p.ticket_id in (pg_temp.recall('ticket_a'), pg_temp.recall('ticket_b'))),
  0, 'no sign-in: sees no photo of a real report');
select pg_temp.throws('select count(*) from public.gps_batches', '42501', 'no sign-in: no GPS');
select pg_temp.throws('select count(*) from public.staff', '42501', 'no sign-in: no staff list');
select pg_temp.throws('select count(*) from public.suggestion_decisions', '42501',
                      'no sign-in: no suggestion decisions');
select pg_temp.throws('select * from public.tickets', '42501',
                      'no sign-in: the hidden ticket columns are refused');
select pg_temp.throws('select reporter_id from public.tickets', '42501',
                      'no sign-in: cannot read who reported');
select pg_temp.throws('select created_by from public.route_schedules', '42501',
                      'no sign-in: cannot read who changed a schedule');
select pg_temp.throws('select sent_by from public.announcements', '42501',
                      'no sign-in: cannot read who sent an announcement');
select pg_temp.throws('select staff_id from public.ticket_events', '42501',
                      'no sign-in: cannot read which staff member acted');
select pg_temp.throws('select * from private.sms_subscriptions', '42501',
                      'no sign-in: cannot read mobile numbers');
select pg_temp.throws('select * from private.truck_credentials', '42501',
                      'no sign-in: cannot read PIN hashes');
select pg_temp.throws(
  $$insert into public.trucks (id, code, name, capacity_tonnes) values ('t9', 'T9', 'Truck 9', 6)$$,
  '42501', 'no sign-in: cannot insert');
select pg_temp.throws($$update public.tickets set status = 'closed'$$, '42501',
                      'no sign-in: cannot update');
select pg_temp.throws('delete from public.truck_events', '42501', 'no sign-in: cannot delete');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479)$$,
  '42501', 'no sign-in: cannot send a report');
select pg_temp.throws($$select public.driver_sign_in('T3', '0000')$$, '42501',
                      'no sign-in: cannot try a truck PIN');
select pg_temp.throws($$select private.seed_load('{}'::jsonb)$$, '42501',
                      'no sign-in: cannot run the seed loader');

-- ---------- A resident's device ----------
select pg_temp.as_user('resident_a');
select pg_temp.eq(
  (select string_agg(t.id, ',') from (select id from public.tickets where not is_sample) t),
  pg_temp.recall('ticket_a'), 'resident: sees their own report and nobody else''s');
select pg_temp.eq(
  (select count(*)::text from (select id from public.tickets where is_sample) t),
  pg_temp.recall('samples'), 'resident: also sees the samples');
select pg_temp.eq(
  (select count(*)::int from public.ticket_photos p where p.ticket_id = pg_temp.recall('ticket_a')),
  1, 'resident: sees their own report''s photo');
select pg_temp.eq((select count(*)::int from public.gps_batches), 0, 'resident: sees no GPS');
select pg_temp.eq((select count(*)::int from public.staff), 0, 'resident: sees no staff');
select pg_temp.eq(
  (select count(*)::int from (select service_day from public.suggestion_decisions) s),
  0, 'resident: sees no suggestion decisions');
select pg_temp.eq(public.sms_status() ->> 'mobile_masked', '0917 ••• 4567',
                  'resident: sees their own number, masked');
select pg_temp.throws('select * from public.tickets', '42501',
                      'resident: the hidden ticket columns are refused');
select pg_temp.throws($$select public.ticket_verify(pg_temp.recall('ticket_a'))$$, 'not_allowed',
                      'resident: cannot verify a report');
select pg_temp.throws($$select public.ticket_rate(pg_temp.recall('ticket_b'), 5)$$, 'unknown_ticket',
                      'resident: cannot act on someone else''s report');
select pg_temp.throws('select * from public.sms_subscriber_counts()', 'not_allowed',
                      'resident: cannot read sign-up counts');
select pg_temp.throws($$select public.demo_reset('RESET')$$, 'not_allowed',
                      'resident: cannot reset the demo');
select pg_temp.throws($$select public.demo_clock_set(now(), 10::smallint)$$, 'not_allowed',
                      'resident: cannot move the clock');
select pg_temp.throws($$select public.truck_pin_set('t3', '9999')$$, 'not_allowed',
                      'resident: cannot change a truck PIN');
select pg_temp.throws(
  $$select public.staff_save(pg_temp.uid('resident_a'), 'Me', 'admin', null, true)$$,
  'not_allowed', 'resident: cannot make themselves staff');
select pg_temp.throws($$select public.driver_upload('[]'::jsonb, null)$$, 'driver_sign_in_required',
                      'resident: cannot upload as a truck');
select pg_temp.throws(
  $$update public.tickets set status = 'closed' where id = pg_temp.recall('ticket_a')$$,
  '42501', 'resident: cannot change their own report directly');

select pg_temp.as_user('resident_b');
select pg_temp.eq(
  (select string_agg(t.id || ':' || t.status || ':' || t.dispatch_truck_id, ',')
   from (select id, status, dispatch_truck_id from public.tickets where not is_sample) t),
  pg_temp.recall('ticket_b') || ':scheduled:t3', 'resident: follows their own report''s progress');
select pg_temp.eq(
  (select string_agg(e.kind || ':' || e.actor, ',')
   from (select kind, actor, ticket_id from public.ticket_events) e
   where e.ticket_id = pg_temp.recall('ticket_b')),
  'dispatched:enro', 'resident: sees what was done, not who did it');

-- ---------- A truck's phone ----------
select pg_temp.as_user('phone_t3');
select pg_temp.eq(
  (select string_agg(t.id, ',') from (select id from public.tickets where not is_sample) t),
  pg_temp.recall('ticket_b'), 'truck phone: sees the report dispatched to its truck, no other');
select pg_temp.eq(
  (select count(*)::int from public.gps_batches b where b.shift_id = 'shift|t3|test0001'),
  1, 'truck phone: reads its own truck''s GPS');
select pg_temp.as_user('phone_t2');
select pg_temp.eq(
  (select count(*)::int from (select id from public.tickets where not is_sample) t),
  0, 'another truck''s phone: sees no report of truck 3');
select pg_temp.eq((select count(*)::int from public.gps_batches), 0,
                  'another truck''s phone: sees no GPS of truck 3');

-- ---------- Staff ----------
select pg_temp.as_user('viewer');
select pg_temp.eq(
  (select count(*)::int from (select id from public.tickets) t
   where t.id in (pg_temp.recall('ticket_a'), pg_temp.recall('ticket_b'))),
  2, 'viewer: sees every report');
select pg_temp.eq(
  (select count(*)::int from public.gps_batches b where b.shift_id = 'shift|t3|test0001'),
  1, 'viewer: reads GPS');
select pg_temp.eq(
  (select s.decision from (select service_day, route_id, decision from public.suggestion_decisions) s
   where s.service_day = date '2026-10-06' and s.route_id = 'r-mabuhay'),
  'dispatched', 'viewer: reads suggestion decisions');
select pg_temp.eq((select count(*)::int from public.staff), 1, 'viewer: sees only their own staff row');
select pg_temp.throws($$select public.ticket_verify(pg_temp.recall('ticket_a'))$$, 'not_allowed',
                      'viewer: cannot act on a report');
select pg_temp.throws(
  $$select public.announcement_send(gen_random_uuid(), 'x', array['milagrosa'])$$,
  'not_allowed', 'viewer: cannot send an announcement');
select pg_temp.throws('select staff_id from public.ticket_events', '42501',
                      'viewer: cannot read which colleague acted');

select pg_temp.as_user('focal');
select pg_temp.eq(
  (select string_agg(t.id, ',') from (select id from public.tickets) t
   where t.id in (pg_temp.recall('ticket_a'), pg_temp.recall('ticket_b'))),
  pg_temp.recall('ticket_a'), 'barangay staff: sees their barangay''s reports only');
select pg_temp.eq((select count(*)::int from public.gps_batches), 0, 'barangay staff: sees no GPS');
select pg_temp.eq(
  (select count(*)::int from (select service_day from public.suggestion_decisions) s),
  0, 'barangay staff: sees no suggestion decisions');
select pg_temp.eq(
  (select string_agg(c.barangay_id || ':' || c.subscribers, ',')
   from public.sms_subscriber_counts() c),
  'milagrosa:1', 'barangay staff: sees the sign-up count of their barangay only');
select pg_temp.throws($$select public.ticket_verify(pg_temp.recall('ticket_a'))$$, 'not_allowed',
                      'barangay staff: cannot act on a report');

select pg_temp.as_user('dispatcher');
select pg_temp.eq(
  (select count(*)::int from (select id from public.tickets) t
   where t.id in (pg_temp.recall('ticket_a'), pg_temp.recall('ticket_b'))),
  2, 'dispatcher: sees every report');
select pg_temp.eq((select count(*)::int from public.staff), 1,
                  'dispatcher: sees only their own staff row');
select pg_temp.throws($$select public.sms_lead_set(10)$$, 'not_allowed',
                      'dispatcher: cannot change the SMS lead time');
select pg_temp.throws($$select public.truck_pin_set('t3', '9999')$$, 'not_allowed',
                      'dispatcher: cannot change a truck PIN');
select pg_temp.throws($$select public.demo_reset('RESET')$$, 'not_allowed',
                      'dispatcher: cannot reset the demo');

select pg_temp.as_user('admin');
select pg_temp.eq((select (count(*) - 4)::text from public.staff), pg_temp.recall('staff_before'),
                  'admin: sees the whole staff list');
select pg_temp.eq(
  (select count(*)::int from public.sms_subscriber_counts() c),
  14, 'admin: sees a sign-up count for every barangay');
select pg_temp.throws('select * from private.sms_subscriptions', '42501',
                      'admin: still cannot read mobile numbers');
select pg_temp.throws('select reporter_id from public.tickets', '42501',
                      'admin: still cannot read who reported');

-- ---------- A login that is not staff has no staff rights ----------
select pg_temp.as_user('stranger');
select pg_temp.eq(
  (select count(*)::int from (select id from public.tickets where not is_sample) t),
  0, 'a login without a staff row sees no real report');
select pg_temp.throws($$select public.ticket_verify(pg_temp.recall('ticket_a'))$$, 'not_allowed',
                      'a login without a staff row cannot act as staff');
select pg_temp.eq((select count(*)::int from public.staff), 0,
                  'a login without a staff row sees no staff');

select pg_temp.finish();
