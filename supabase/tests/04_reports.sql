-- KolektaPH pilot database · test 4 · reports: sending, the lifecycle, photos, missed-street claims
-- Run after 00_harness.sql, as one query.

-- ---------- The cast ----------
select pg_temp.new_user('resident_a');
select pg_temp.new_user('resident_b');
select pg_temp.new_user('resident_c');
select pg_temp.new_user('resident_d');
select pg_temp.new_user('phone_t3');
select pg_temp.new_user('phone_t2');
select pg_temp.new_user('admin', 'admin@test.invalid');
select pg_temp.new_user('dispatcher', 'dispatcher@test.invalid');
insert into public.staff (user_id, name, role) values
  (pg_temp.uid('admin'), 'Test Admin', 'admin'),
  (pg_temp.uid('dispatcher'), 'Test Dispatcher', 'dispatcher');
insert into private.driver_sessions (user_id, truck_id, expires_at) values
  (pg_temp.uid('phone_t3'), 't3', now() + interval '1 hour'),
  (pg_temp.uid('phone_t2'), 't2', now() + interval '1 hour');
-- Two files as the Storage API would record them after an upload by resident A.
select pg_temp.remember('photo_a1', pg_temp.uid('resident_a') || '/' || gen_random_uuid() || '.jpg');
select pg_temp.remember('photo_a2', pg_temp.uid('resident_a') || '/' || gen_random_uuid() || '.jpg');
insert into storage.objects (bucket_id, name, owner_id) values
  ('report-photos', pg_temp.recall('photo_a1'), pg_temp.uid('resident_a')::text),
  ('report-photos', pg_temp.recall('photo_a2'), pg_temp.uid('resident_a')::text);

-- =======================================================================================
-- A. Sending a report
-- =======================================================================================
select pg_temp.as_user('resident_a');
select pg_temp.remember('ref1', gen_random_uuid()::text);
select pg_temp.remember('t1', public.report_submit(
  pg_temp.recall('ref1')::uuid, 'DUMPING', 'pile', 121.0438400001, 14.3047900001, 8.4,
  '  Tabi ng kanal  ', true, false, '   ', true,
  jsonb_build_array(jsonb_build_object('slot', 'wide', 'path', pg_temp.recall('photo_a1')),
                    jsonb_build_object('slot', 'close', 'sample', 'waterway'))));
select pg_temp.ok(pg_temp.recall('t1') ~ '^KPH-[0-9]{4}-[0-9]{6}$', 'a report gets a ticket number');
select pg_temp.eq(
  (select t.status || '|' || t.barangay_id || '|' || t.landmark || '|' || coalesce(t.note, '-') || '|'
          || t.accuracy_m || '|' || t.notify || '|' || t.source || '|' || t.near_waterway
   from public.tickets t where t.id = pg_temp.recall('t1')),
  'submitted|milagrosa|Tabi ng kanal|-|8|false|resident|true',
  'stored as sent: barangay worked out by the server, text trimmed, blank note empty, no texts without a sign-up');
select pg_temp.eq(
  (select extensions.st_astext(t.location) from public.tickets t where t.id = pg_temp.recall('t1')),
  'POINT(121.04384 14.30479)', 'the location is kept to 6 decimals');
select pg_temp.eq(
  (select string_agg(p.slot || ':' || coalesce(p.sample_id, 'file'), ',' order by p.slot desc)
   from public.ticket_photos p where p.ticket_id = pg_temp.recall('t1')),
  'wide:file,close:waterway', 'both photos are attached');

-- The same report again (a retry): the same ticket, nothing new.
select pg_temp.eq(
  public.report_submit(pg_temp.recall('ref1')::uuid, 'DUMPING', 'pile', 121.04384, 14.30479),
  pg_temp.recall('t1'), 'sending the same report again returns the same ticket');
select pg_temp.eq((select count(*)::int from public.tickets t where not t.is_sample), 1,
                  'and creates no second ticket');

-- What is refused.
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.2, 14.6)$$,
  'outside_city', 'refused: a location outside the city');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 200, 14.3)$$,
  'bad_location', 'refused: impossible coordinates');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'LITTER', 'pile', 121.04384, 14.30479)$$,
  'bad_category', 'refused: an unknown category');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'huge', 121.04384, 14.30479)$$,
  'bad_size', 'refused: an unknown size');
select pg_temp.throws(
  $$select public.report_submit(null, 'DUMPING', 'pile', 121.04384, 14.30479)$$,
  'bad_client_ref', 'refused: no device reference');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479, null,
                                repeat('x', 121))$$,
  'too_long', 'refused: a landmark over 120 characters');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479, null,
                                null, false, false, repeat('x', 281))$$,
  'too_long', 'refused: a note over 280 characters');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479, null,
      null, false, false, null, false,
      '[{"slot":"wide","sample":"dumping"},{"slot":"close","sample":"dumping"},{"slot":"close","sample":"clean"}]')$$,
  'bad_photos', 'refused: more than two photos');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479, null,
      null, false, false, null, false, '[{"slot":"close","sample":"dumping"}]')$$,
  'bad_photos', 'refused: a close-up without the wide shot');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479, null,
      null, false, false, null, false, '[{"slot":"wide","sample":"selfie"}]')$$,
  'bad_photo', 'refused: an unknown sample picture');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479, null,
      null, false, false, null, false,
      jsonb_build_array(jsonb_build_object('slot', 'wide', 'path', pg_temp.recall('photo_a1'))))$$,
  'photo_already_used', 'refused: a photo already attached to another report');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479, null,
      null, false, false, null, false,
      jsonb_build_array(jsonb_build_object('slot', 'wide',
        'path', pg_temp.uid('resident_a') || '/' || gen_random_uuid() || '.jpg')))$$,
  'photo_not_uploaded', 'refused: a photo that was never uploaded');

-- Refused attempts used no ticket number: the next ticket follows the first.
select pg_temp.remember('t2', public.report_submit(
  gen_random_uuid(), 'OVERFLOW', 'bags', 121.053808, 14.311391));
select pg_temp.eq(right(pg_temp.recall('t2'), 6)::int, right(pg_temp.recall('t1'), 6)::int + 1,
                  'ticket numbers have no gaps after refused attempts');

select pg_temp.as_user('resident_b');
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479, null,
      null, false, false, null, false,
      jsonb_build_array(jsonb_build_object('slot', 'wide', 'path', pg_temp.recall('photo_a2'))))$$,
  'photo_not_yours', 'refused: a photo uploaded by someone else');
-- With a text-alert sign-up, "text me" is honoured.
select public.sms_subscribe('+639181112222', 'mabuhay');
select pg_temp.remember('t3', public.report_submit(
  gen_random_uuid(), 'BULKY', 'pile', 121.034393, 14.303537, null, null, false, false, null, true));
select pg_temp.eq((select t.notify from public.tickets t where t.id = pg_temp.recall('t3')), true,
                  'with a text sign-up, the report is marked for status texts');

-- Five an hour per device, counted from the reports themselves.
select pg_temp.as_user('resident_c');
select public.report_submit(gen_random_uuid(), 'EVENT', 'bags', 121.04384, 14.30479)
from generate_series(1, 5);
select pg_temp.throws(
  $$select public.report_submit(gen_random_uuid(), 'EVENT', 'bags', 121.04384, 14.30479)$$,
  'rate_limited', 'the sixth report within an hour is refused');

-- =======================================================================================
-- B. Photo storage rules
-- =======================================================================================
select pg_temp.as_user('resident_a');
insert into storage.objects (bucket_id, name, owner_id)
values ('report-photos', pg_temp.uid('resident_a') || '/' || gen_random_uuid() || '.jpg',
        pg_temp.uid('resident_a')::text);
select pg_temp.ok(true, 'a device can upload into its own folder');
select pg_temp.throws(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('report-photos', pg_temp.uid('resident_b') || '/' || gen_random_uuid() || '.jpg',
            pg_temp.uid('resident_a')::text)$$,
  '42501', 'not into someone else''s folder');
select pg_temp.throws(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('report-photos', pg_temp.uid('resident_a') || '/notes.txt', pg_temp.uid('resident_a')::text)$$,
  '42501', 'and only as <uuid>.jpg');
select pg_temp.eq(
  (select count(*)::int from storage.objects o where o.name = pg_temp.recall('photo_a1')),
  1, 'the reporter can read their report''s photo');
select pg_temp.as_user('resident_b');
select pg_temp.eq(
  (select count(*)::int from storage.objects o
   where o.name in (pg_temp.recall('photo_a1'), pg_temp.recall('photo_a2'))),
  0, 'another resident cannot read it');
select pg_temp.as_user('dispatcher');
select pg_temp.eq(
  (select count(*)::int from storage.objects o
   where o.name in (pg_temp.recall('photo_a1'), pg_temp.recall('photo_a2'))),
  1, 'staff read the attached photo, not the unattached one');
select pg_temp.as_anon();
select pg_temp.eq((select count(*)::int from storage.objects), 0, 'without sign-in no file is readable');
-- 40 uploads a day per device.
select pg_temp.as_owner();
insert into storage.objects (bucket_id, name, owner_id)
select 'report-photos', pg_temp.uid('resident_d') || '/' || gen_random_uuid() || '.jpg',
       pg_temp.uid('resident_d')::text
from generate_series(1, 40);
select pg_temp.as_user('resident_d');
select pg_temp.throws(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('report-photos', pg_temp.uid('resident_d') || '/' || gen_random_uuid() || '.jpg',
            pg_temp.uid('resident_d')::text)$$,
  '42501', 'the 41st upload in a day is refused');

-- =======================================================================================
-- C. The lifecycle
-- =======================================================================================
select pg_temp.as_user('dispatcher');
select public.ticket_verify(pg_temp.recall('t1'));
select pg_temp.eq((select t.status from public.tickets t where t.id = pg_temp.recall('t1')),
                  'verified', 'verify: submitted -> verified');
select pg_temp.throws($$select public.ticket_verify(pg_temp.recall('t1'))$$, 'invalid_transition',
                      'verify twice is refused');
select pg_temp.throws($$select public.ticket_dispatch(pg_temp.recall('t1'), 'by_drone', 't3')$$,
                      'bad_mode', 'dispatch: an unknown mode is refused');
select pg_temp.throws($$select public.ticket_dispatch(pg_temp.recall('t1'), 'special_pickup', 't9')$$,
                      'unknown_truck', 'dispatch: an unknown truck is refused');
select public.ticket_dispatch(pg_temp.recall('t1'), 'special_pickup', 't3', now() + interval '4 hours');
select pg_temp.eq(
  (select t.status || '|' || t.dispatch_mode || '|' || t.dispatch_truck_id || '|' || (t.dispatch_due is not null)
   from public.tickets t where t.id = pg_temp.recall('t1')),
  'scheduled|special_pickup|t3|true', 'dispatch: verified -> scheduled, with the truck and due time');
select pg_temp.throws($$select public.ticket_reject(pg_temp.recall('t1'), 'too late')$$,
                      'invalid_transition', 'a scheduled ticket cannot be rejected');
select pg_temp.throws($$select public.ticket_collect(pg_temp.recall('t1'), null)$$,
                      'after_photo_required', 'collect: the after photo is required');
select pg_temp.throws(
  $$select private.ticket_apply(pg_temp.recall('t1'), 'collect', 'enro', now(), null, null, '{}', null)$$,
  '42501', 'the lifecycle core cannot be called directly');

-- The crew starts and finishes the pickup from the driver app.
select pg_temp.as_user('phone_t3');
select pg_temp.remember('up1', public.driver_upload(jsonb_build_array(
  jsonb_build_object('id', 't3|shift_start|rep00001', 'kind', 'shift_start',
                     'at', extract(epoch from now()) * 1000, 'shift_id', 'shift|t3|rep00001',
                     'route_id', 'r-mabuhay', 'crew', 2),
  jsonb_build_object('id', 't3|task|rep00002', 'kind', 'task',
                     'at', extract(epoch from now()) * 1000, 'shift_id', 'shift|t3|rep00001',
                     'ticket_id', pg_temp.recall('t1'), 'action', 'start'),
  jsonb_build_object('id', 't3|task|rep00003', 'kind', 'task',
                     'at', extract(epoch from now()) * 1000, 'shift_id', 'shift|t3|rep00001',
                     'ticket_id', pg_temp.recall('t2'), 'action', 'start'),
  jsonb_build_object('id', 't3|task|rep00004', 'kind', 'task',
                     'at', extract(epoch from now()) * 1000, 'shift_id', 'shift|t3|rep00001',
                     'ticket_id', pg_temp.recall('t1'), 'action', 'done')
))::text);
select pg_temp.eq(
  (select string_agg((e ->> 'result') || coalesce(':' || (e ->> 'reason'), ''), ',' order by i)
   from jsonb_array_elements(pg_temp.recall('up1')::jsonb -> 'events') with ordinality as x (e, i)),
  'stored,stored,rejected:not_your_task,rejected:after_photo_required',
  'crew taps: the start is stored; a ticket of another truck and a finish without a photo are refused');
select pg_temp.eq((select t.status from public.tickets t where t.id = pg_temp.recall('t1')),
                  'in_progress', 'start: scheduled -> in progress');
select pg_temp.remember('up2', public.driver_upload(jsonb_build_array(
  jsonb_build_object('id', 't3|task|rep00002', 'kind', 'task',
                     'at', extract(epoch from now()) * 1000, 'shift_id', 'shift|t3|rep00001',
                     'ticket_id', pg_temp.recall('t1'), 'action', 'start'),
  jsonb_build_object('id', 't3|task|rep00005', 'kind', 'task',
                     'at', extract(epoch from now()) * 1000, 'shift_id', 'shift|t3|rep00001',
                     'ticket_id', pg_temp.recall('t1'), 'action', 'done',
                     'before', jsonb_build_object('sample', 'dumping'),
                     'after', jsonb_build_object('sample', 'clean'))
))::text);
select pg_temp.eq(
  (select string_agg(e ->> 'result', ',' order by i)
   from jsonb_array_elements(pg_temp.recall('up2')::jsonb -> 'events') with ordinality as x (e, i)),
  'duplicate,stored', 'the same tap sent again is recognised; the finish with photos is stored');
select pg_temp.eq((select count(*)::int from public.tickets t where not t.is_sample), 0,
                  'a finished pickup leaves the truck phone''s list');
select pg_temp.as_owner();
select pg_temp.eq(
  (select t.status || '|' || (select count(*) from public.ticket_events e
                              where e.ticket_id = t.id and e.kind = 'started')
   from public.tickets t where t.id = pg_temp.recall('t1')),
  'collected|1', 'collect: in progress -> collected, and the start was recorded once');
select pg_temp.eq(
  (select string_agg(p.slot || ':' || p.sample_id, ',' order by p.slot desc)
   from public.ticket_photos p
   join public.ticket_events e on e.id = p.event_id
   where p.ticket_id = pg_temp.recall('t1') and e.kind = 'collected' and e.actor = 'driver'
     and e.truck_id = 't3'),
  'before:dumping,after:clean', 'the proof photos belong to the crew''s collected action');

-- The reporter reopens within 48 hours, then rates.
select pg_temp.as_user('resident_b');
select pg_temp.throws($$select public.ticket_reopen(pg_temp.recall('t1'), 'not mine')$$,
                      'unknown_ticket', 'only the reporter can reopen');
select pg_temp.as_user('resident_a');
select public.ticket_reopen(pg_temp.recall('t1'), '  May natira pa  ');
select pg_temp.eq(
  (select t.status || '|' || t.dispatch_truck_id || '|'
          || (select e.note from public.ticket_events e
              where e.ticket_id = t.id and e.kind = 'reopened')
   from public.tickets t where t.id = pg_temp.recall('t1')),
  'scheduled|t3|May natira pa', 'reopen: collected -> scheduled again, same truck, note kept');
select pg_temp.as_user('dispatcher');
select public.ticket_collect(pg_temp.recall('t1'), jsonb_build_object('sample', 'clean'));
select pg_temp.eq((select t.status from public.tickets t where t.id = pg_temp.recall('t1')),
                  'collected', 'staff can mark it collected with an after photo');
select pg_temp.eq(
  (select count(*)::int from public.ticket_photos p
   where p.ticket_id = pg_temp.recall('t1') and p.slot = 'after'),
  2, 'both collections keep their own proof');

-- 49 hours later the reopen window has closed, but the report can still be rated.
select pg_temp.as_user('admin');
select public.demo_clock_set(now() + interval '49 hours');
select pg_temp.as_user('resident_a');
select pg_temp.throws($$select public.ticket_reopen(pg_temp.recall('t1'), 'late')$$,
                      'reopen_window_closed', 'reopen after 48 hours is refused');
select pg_temp.throws($$select public.ticket_rate(pg_temp.recall('t1'), 6)$$, 'bad_stars',
                      'rate: 6 stars is refused');
select public.ticket_rate(pg_temp.recall('t1'), 5);
select pg_temp.eq(
  (select t.status || '|' || t.rating from public.tickets t where t.id = pg_temp.recall('t1')),
  'closed|5', 'rate: closes the ticket and keeps the stars');
select pg_temp.throws($$select public.ticket_rate(pg_temp.recall('t1'), 4)$$, 'invalid_transition',
                      'rate twice is refused');
select pg_temp.as_user('admin');
select public.demo_clock_clear();
select pg_temp.eq(
  (select string_agg(e.kind || ':' || e.actor, ',' order by e.id)
   from public.ticket_events e where e.ticket_id = pg_temp.recall('t1')),
  'verified:enro,dispatched:enro,started:driver,collected:driver,reopened:resident,collected:enro,rated:resident',
  'the ticket''s history is exactly the actions taken, one row each');

-- Education, reject, merge.
select pg_temp.as_user('dispatcher');
select public.ticket_educate(pg_temp.recall('t2'), 'Paalala sa tamang oras ng paglalabas');
select pg_temp.eq((select t.status from public.tickets t where t.id = pg_temp.recall('t2')),
                  'closed', 'education notice: submitted -> closed');
select pg_temp.throws($$select public.ticket_reject(pg_temp.recall('t3'), '   ')$$, 'reason_required',
                      'reject: a reason is required');
select pg_temp.throws($$select public.ticket_merge(pg_temp.recall('t3'), pg_temp.recall('t3'))$$,
                      'bad_merge_target', 'merge: not into itself');
select pg_temp.throws($$select public.ticket_merge(pg_temp.recall('t3'), 'KPH-2026-999999')$$,
                      'bad_merge_target', 'merge: not into an unknown ticket');
select public.ticket_merge(pg_temp.recall('t3'), pg_temp.recall('t1'));
select pg_temp.eq(
  (select t.status || '|' || t.merged_into from public.tickets t where t.id = pg_temp.recall('t3')),
  'merged|' || pg_temp.recall('t1'), 'merge: marks the duplicate and points at the kept ticket');
select pg_temp.throws($$select public.ticket_verify(pg_temp.recall('t3'))$$, 'invalid_transition',
                      'a merged ticket takes no further action');
select pg_temp.throws($$select public.ticket_verify('KPH-2026-999999')$$, 'unknown_ticket',
                      'an unknown ticket is reported as such');

-- The table itself refuses impossible states, whatever code asks.
select pg_temp.as_owner();
select pg_temp.throws(
  $$update public.tickets set status = 'scheduled' where id = pg_temp.recall('t2')$$,
  '23514', 'table rule: scheduled needs a dispatch');
select pg_temp.throws(
  $$update public.tickets set rating = 4 where id = pg_temp.recall('t3')$$,
  '23514', 'table rule: a rating only on a closed ticket');
select pg_temp.throws(
  $$update public.tickets set merged_into = null where id = pg_temp.recall('t3')$$,
  '23514', 'table rule: merged needs its target');
select pg_temp.throws(
  $$update public.tickets set missed_day = current_date where id = pg_temp.recall('t2')$$,
  '23514', 'table rule: missed-collection details come together');
select pg_temp.throws(
  $$insert into public.ticket_events (ticket_id, kind, at, actor)
    values (pg_temp.recall('t2'), 'rated', now(), 'enro')$$,
  '23514', 'table rule: only a resident rates');
select pg_temp.throws(
  $$insert into public.ticket_photos (ticket_id, slot) values (pg_temp.recall('t2'), 'wide')$$,
  '23514', 'table rule: a photo needs a file or a sample');

-- =======================================================================================
-- D. "Hindi nadaanan ang kalye namin"
-- =======================================================================================
-- Tuesday 6 October 2026 is a collection day for Milagrosa (route r-poblacion-milagrosa, Truck 2).
select pg_temp.as_user('admin');
select public.demo_clock_set(timestamptz '2026-10-06 06:00:00+08');
select pg_temp.as_user('resident_a');
select pg_temp.throws(
  $$select public.claim_missed('milagrosa', 'r-poblacion-milagrosa', 'milagrosa|9th Street', null, null, 'not_passed')$$,
  'too_early', 'a claim before the collection starts is refused');
select pg_temp.as_user('admin');
select public.demo_clock_set(timestamptz '2026-10-07 09:00:00+08');
select pg_temp.as_user('resident_a');
select pg_temp.throws(
  $$select public.claim_missed('milagrosa', 'r-poblacion-milagrosa', 'milagrosa|9th Street', null, null, 'not_passed')$$,
  'no_collection_today', 'a claim on a day without collection is refused');
select pg_temp.as_user('admin');
select public.demo_clock_set(timestamptz '2026-10-06 09:00:00+08');

select pg_temp.as_user('resident_a');
select pg_temp.throws(
  $$select public.claim_missed('milagrosa', 'r-mabuhay', 'milagrosa|9th Street', null, null, 'not_passed')$$,
  'bad_route', 'refused: a route that does not serve the barangay');
select pg_temp.throws(
  $$select public.claim_missed('milagrosa', 'r-poblacion-milagrosa', 'milagrosa|No Such Street', null, null, 'not_passed')$$,
  'bad_street', 'refused: a street that is not on the route');
select pg_temp.throws(
  $$select public.claim_missed('milagrosa', 'r-poblacion-milagrosa', 'milagrosa|9th Street', null, null, 'crew_was_lazy')$$,
  'bad_basis', 'refused: an unknown basis');
select pg_temp.throws(
  $$select public.claim_missed('milagrosa', 'r-poblacion-milagrosa', 'milagrosa|9th Street', 121.034393, 14.303537, 'not_passed')$$,
  'outside_barangay', 'refused: a point outside the barangay');

select pg_temp.remember('claim1', public.claim_missed(
  'milagrosa', 'r-poblacion-milagrosa', 'milagrosa|9th Street', 121.04384, 14.30479, 'not_passed')::text);
select pg_temp.eq(
  (pg_temp.recall('claim1')::jsonb ->> 'created') || '|' || (pg_temp.recall('claim1')::jsonb ->> 'verified'),
  'true|false', 'a claim the server cannot prove is filed and waits for staff');
select pg_temp.eq(
  (select t.category || '|' || t.status || '|' || t.source || '|' || t.missed_route_id || '|'
          || t.missed_street_key || '|' || t.missed_day || '|' || t.missed_basis
   from public.tickets t where t.id = pg_temp.recall('claim1')::jsonb ->> 'ticket_id'),
  'MISSED|submitted|claim|r-poblacion-milagrosa|milagrosa|9th Street|2026-10-06|not_passed',
  'the claim ticket records the route, street, day and basis');

-- A neighbour claims the same street the same day: the same ticket.
select pg_temp.as_user('resident_b');
select pg_temp.remember('claim1b', public.claim_missed(
  'milagrosa', 'r-poblacion-milagrosa', 'milagrosa|9th Street', null, null, 'not_passed')::text);
select pg_temp.eq(
  (pg_temp.recall('claim1b')::jsonb ->> 'ticket_id') || '|' || (pg_temp.recall('claim1b')::jsonb ->> 'created'),
  (pg_temp.recall('claim1')::jsonb ->> 'ticket_id') || '|false',
  'one ticket per street per day: a second claim returns the first ticket');

-- The crew logged a street as skipped because the truck was full: the server can prove it.
select pg_temp.as_user('phone_t2');
select public.driver_upload(jsonb_build_array(
  jsonb_build_object('id', 't2|shift_start|rep00010', 'kind', 'shift_start',
                     'at', extract(epoch from timestamptz '2026-10-06 07:17:00+08') * 1000,
                     'shift_id', 'shift|t2|rep00010', 'route_id', 'r-poblacion-milagrosa', 'crew', 3),
  jsonb_build_object('id', 't2|street|rep00011', 'kind', 'street',
                     'at', extract(epoch from timestamptz '2026-10-06 08:40:00+08') * 1000,
                     'shift_id', 'shift|t2|rep00010', 'street_key', 'milagrosa|Acacia Lane',
                     'outcome', 'skipped', 'reason', 'truck_full')));
select pg_temp.as_user('resident_b');
select pg_temp.remember('claim2', public.claim_missed(
  'milagrosa', 'r-poblacion-milagrosa', 'milagrosa|Acacia Lane', null, null, 'truck_full')::text);
select pg_temp.eq(pg_temp.recall('claim2')::jsonb ->> 'verified', 'true',
                  'a claim the crew''s own log proves is verified at once');
select pg_temp.eq(
  (select e.kind || ':' || e.actor from public.ticket_events e
   where e.ticket_id = pg_temp.recall('claim2')::jsonb ->> 'ticket_id'),
  'verified:system', 'and the verification is attributed to the system');
select pg_temp.remember('claim3', public.claim_missed(
  'milagrosa', 'r-poblacion-milagrosa', 'milagrosa|Alley', null, null, 'road_blocked')::text);
select pg_temp.eq(pg_temp.recall('claim3')::jsonb ->> 'verified', 'false',
                  'a "road blocked" claim with no such crew log is not verified by the system');
-- Three new claims a day per device. (Joining a neighbour's claim, as above, does not count.)
select public.claim_missed('milagrosa', 'r-poblacion-milagrosa', 'milagrosa|Angola Street', null, null, 'not_passed');
select pg_temp.throws(
  $$select public.claim_missed('milagrosa', 'r-poblacion-milagrosa', 'milagrosa|A. Villanueva Street', null, null, 'not_passed')$$,
  'rate_limited', 'the fourth new claim of the day from one device is refused');

-- Staff schedule a re-collection: the same single ticket, verified by them.
select pg_temp.as_user('dispatcher');
select pg_temp.eq(
  public.recollection_create('r-poblacion-milagrosa', 'milagrosa|9th Street', date '2026-10-06', 'not_passed'),
  pg_temp.recall('claim1')::jsonb ->> 'ticket_id',
  're-collection for a street already claimed uses the existing ticket');
select pg_temp.eq(
  (select t.status || '|' || t.source from public.tickets t
   where t.id = pg_temp.recall('claim1')::jsonb ->> 'ticket_id'),
  'verified|claim', 'and verifies it');
select pg_temp.remember('recollect', public.recollection_create(
  'r-poblacion-milagrosa', 'milagrosa|A. Laurora Street', date '2026-10-06', 'no_garbage'));
select pg_temp.eq(
  (select t.status || '|' || t.source || '|' || t.barangay_id || '|' || t.missed_basis
   from public.tickets t where t.id = pg_temp.recall('recollect')),
  'verified|enro|milagrosa|no_garbage', 're-collection for a new street creates a staff ticket, verified');
select pg_temp.throws(
  $$select public.recollection_create('r-poblacion-milagrosa', 'milagrosa|A. Laurora Street', date '2026-10-07', 'not_passed')$$,
  'bad_day', 'a re-collection for a future day is refused');
select pg_temp.throws(
  $$select public.recollection_create('r-poblacion-milagrosa', 'milagrosa|A. Laurora Street', date '2026-10-05', 'not_passed')$$,
  'no_collection_that_day', 'a re-collection for a day without collection is refused');
select pg_temp.as_owner();
select pg_temp.throws(
  $$insert into public.tickets (id, category, size, location, barangay_id, created_at,
                                missed_route_id, missed_street_key, missed_day, missed_basis)
    select 'KPH-2026-999998', 'MISSED', 'bags', t.location, t.barangay_id, now(),
           t.missed_route_id, t.missed_street_key, t.missed_day, 'other'
    from public.tickets t where t.id = pg_temp.recall('recollect')$$,
  '23505', 'table rule: a second missed ticket for the same street and day cannot exist');

select pg_temp.finish();
