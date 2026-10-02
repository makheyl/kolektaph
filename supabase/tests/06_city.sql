-- KolektaPH pilot database · test 6 · city settings, text alerts, staff accounts, "delete my data"
-- Run after 00_harness.sql, as one query.

-- ---------- The cast ----------
select pg_temp.new_user('resident_a');
select pg_temp.new_user('resident_b');
select pg_temp.new_user('guest');
select pg_temp.new_user('admin', 'admin@test.invalid');
select pg_temp.new_user('dispatcher', 'dispatcher@test.invalid');
select pg_temp.new_user('viewer', 'viewer@test.invalid');
select pg_temp.new_user('newcomer', 'newcomer@test.invalid');
-- Any real admin is set aside for this run, so the "last admin" rule can be tested.
update public.staff set active = false where role = 'admin';
insert into public.staff (user_id, name, role) values
  (pg_temp.uid('admin'), 'Test Admin', 'admin'),
  (pg_temp.uid('dispatcher'), 'Test Dispatcher', 'dispatcher'),
  (pg_temp.uid('viewer'), 'Test Viewer', 'viewer');
select pg_temp.remember('today', ((now() at time zone 'Asia/Manila')::date)::text);
select pg_temp.remember('contacts_before', (select count(*) from public.contacts)::text);
select pg_temp.remember('leads_before', (select count(*) from public.sms_lead_changes)::text);

-- =======================================================================================
-- A. Text alerts
-- =======================================================================================
select pg_temp.as_user('resident_a');
select pg_temp.eq(public.sms_status() ->> 'subscribed', 'false', 'a new device has no text sign-up');
select pg_temp.throws($$select public.sms_subscribe('09171234567', 'milagrosa')$$, 'bad_mobile',
                      'refused: a number not in +639 form');
select pg_temp.throws($$select public.sms_subscribe('+63917123456', 'milagrosa')$$, 'bad_mobile',
                      'refused: a number that is too short');
select pg_temp.throws($$select public.sms_subscribe('+639171234567', 'atlantis')$$, 'bad_barangay',
                      'refused: an unknown barangay');
select pg_temp.remember('sub1', public.sms_subscribe('+639171234567', 'milagrosa')::text);
select pg_temp.eq(
  (pg_temp.recall('sub1')::jsonb ->> 'subscribed') || '|' || (pg_temp.recall('sub1')::jsonb ->> 'mobile_masked')
  || '|' || (pg_temp.recall('sub1')::jsonb ->> 'barangay_id'),
  'true|0917 ••• 4567|milagrosa', 'a sign-up answers with the number masked');
select pg_temp.ok(pg_temp.recall('sub1') !~ '9171234567',
                  'the full number is never sent back');

-- Moving barangay keeps the consent date; a new number is a new consent.
select pg_temp.as_owner();
update private.sms_subscriptions set opted_in_at = now() - interval '30 days'
where user_id = pg_temp.uid('resident_a');
select pg_temp.as_user('resident_a');
select public.sms_subscribe('+639171234567', 'mabuhay');
select pg_temp.as_owner();
select pg_temp.eq(
  (select s.barangay_id || '|' || (s.opted_in_at < now() - interval '29 days')
   from private.sms_subscriptions s where s.user_id = pg_temp.uid('resident_a')),
  'mabuhay|true', 'changing barangay keeps the original consent date');
select pg_temp.as_user('resident_a');
select public.sms_subscribe('+639170000001', 'mabuhay');
select pg_temp.as_owner();
select pg_temp.eq(
  (select s.mobile || '|' || (s.opted_in_at > now() - interval '1 minute')
   from private.sms_subscriptions s where s.user_id = pg_temp.uid('resident_a')),
  '+639170000001|true', 'a new number replaces the old one and records a new consent');
select pg_temp.eq(
  (select count(*)::int from private.sms_subscriptions s where s.user_id = pg_temp.uid('resident_a')),
  1, 'one sign-up per device');

-- The same number on another device moves to that device.
select pg_temp.as_user('resident_b');
select public.sms_subscribe('+639170000001', 'milagrosa');
select pg_temp.as_owner();
select pg_temp.eq(
  (select string_agg(case s.user_id when pg_temp.uid('resident_b') then 'b' else 'other' end, ',')
   from private.sms_subscriptions s where s.mobile = '+639170000001'),
  'b', 'one sign-up per number: it moves to the device that entered it last');
select pg_temp.as_user('resident_a');
select pg_temp.eq(public.sms_status() ->> 'subscribed', 'false', 'the first device is no longer signed up');
select public.sms_subscribe('+639171234567', 'mabuhay');

-- =======================================================================================
-- B. Announcements
-- =======================================================================================
select pg_temp.as_user('dispatcher');
select pg_temp.remember('ref', gen_random_uuid()::text);
select pg_temp.remember('ann', public.announcement_send(
  pg_temp.recall('ref')::uuid, '  Walang koleksyon bukas dahil sa bagyo.  ',
  array['milagrosa', 'mabuhay', 'milagrosa'])::text);
select pg_temp.eq((pg_temp.recall('ann')::jsonb ->> 'recipient_count')::int, 2,
                  'an announcement records how many numbers were signed up in its barangays');
select pg_temp.eq(
  (select a.body from public.announcements a where a.id = (pg_temp.recall('ann')::jsonb ->> 'id')::int),
  'Walang koleksyon bukas dahil sa bagyo.', 'the text is stored trimmed');
select pg_temp.eq(
  (select string_agg(b.barangay_id, ',' order by b.barangay_id)
   from public.announcement_barangays b
   where b.announcement_id = (pg_temp.recall('ann')::jsonb ->> 'id')::int),
  'mabuhay,milagrosa', 'a barangay named twice is stored once');
select pg_temp.eq(
  public.announcement_send(pg_temp.recall('ref')::uuid, 'Different text', array['bancal']) ->> 'id',
  pg_temp.recall('ann')::jsonb ->> 'id', 'the same request again returns the same announcement');
select pg_temp.eq(
  (select count(*)::int from public.announcements a where a.body like '%bagyo%' or a.body = 'Different text'),
  1, 'and sends nothing new');
select pg_temp.throws(
  $$select public.announcement_send(gen_random_uuid(), repeat('x', 481), array['milagrosa'])$$,
  'bad_body', 'refused: a message over 480 characters');
select pg_temp.throws(
  $$select public.announcement_send(gen_random_uuid(), '   ', array['milagrosa'])$$,
  'bad_body', 'refused: an empty message');
select pg_temp.throws(
  $$select public.announcement_send(gen_random_uuid(), 'Hello', array['milagrosa', 'atlantis'])$$,
  'bad_barangays', 'refused: an unknown barangay');
select pg_temp.throws(
  $$select public.announcement_send(gen_random_uuid(), 'Hello', array[]::text[])$$,
  'bad_barangays', 'refused: no barangay');
select pg_temp.throws(
  $$select public.announcement_send(null, 'Hello', array['milagrosa'])$$,
  'bad_client_ref', 'refused: no request reference');
-- A later opt-out does not rewrite what was sent.
select pg_temp.as_user('resident_a');
select public.sms_unsubscribe();
select pg_temp.eq(public.sms_status() ->> 'subscribed', 'false', 'opting out removes the sign-up');
select pg_temp.as_owner();
select pg_temp.eq(
  (select count(*)::int from private.sms_subscriptions s where s.user_id = pg_temp.uid('resident_a')),
  0, 'the number is deleted, not flagged');
select pg_temp.eq(
  (select a.recipient_count from public.announcements a
   where a.id = (pg_temp.recall('ann')::jsonb ->> 'id')::int),
  2, 'the announcement keeps the count it was sent with');

-- =======================================================================================
-- C. SMS lead time
-- =======================================================================================
select pg_temp.as_user('admin');
select pg_temp.throws($$select public.sms_lead_set(4)$$, 'bad_minutes', 'refused: under 5 minutes');
select pg_temp.throws($$select public.sms_lead_set(31)$$, 'bad_minutes', 'refused: over 30 minutes');
select public.sms_lead_set(10);
select public.sms_lead_set(20);
select pg_temp.eq(
  (select string_agg(c.minutes::text, ',' order by c.effective_at)
   from public.sms_lead_changes c where c.effective_at >= now()),
  '20', 'a change at the same moment replaces the earlier one');
select public.demo_clock_set(now() + interval '1 day');
select public.sms_lead_set(12);
select pg_temp.eq(
  (select string_agg(c.minutes::text, ',' order by c.effective_at)
   from public.sms_lead_changes c where c.effective_at >= now()),
  '20,12', 'a later change is added: the earlier value stays as history');
select public.demo_clock_clear();
select public.sms_lead_set(25);
select pg_temp.eq(
  (select string_agg(c.minutes::text, ',' order by c.effective_at)
   from public.sms_lead_changes c where c.effective_at >= now()),
  '25', 'a change replaces every change dated at or after it');
select pg_temp.as_owner();
select pg_temp.eq(
  (select count(*)::text from public.sms_lead_changes c where c.effective_at < now()),
  pg_temp.recall('leads_before'), 'earlier history is untouched');

-- =======================================================================================
-- D. Office contacts
-- =======================================================================================
select pg_temp.as_user('admin');
select public.contact_set(null, '  (046) 430-0000  ', 'Lunes-Biyernes, 8 AM-5 PM');
select public.contact_set('milagrosa', '0917 000 0000', null);
select pg_temp.eq(
  (select string_agg(coalesce(c.barangay_id, 'ENRO') || ':' || coalesce(c.phone, '-') || ':' || coalesce(c.hours, '-'),
                     ' | ' order by c.barangay_id nulls first)
   from public.contacts c where c.barangay_id is null or c.barangay_id = 'milagrosa'),
  'ENRO:(046) 430-0000:Lunes-Biyernes, 8 AM-5 PM | milagrosa:0917 000 0000:-',
  'contacts are stored trimmed, one row per office');
select public.contact_set(null, '(046) 430-0001', null);
select pg_temp.eq(
  (select count(*)::int || ':' || max(c.phone) || ':' || coalesce(max(c.hours), '-')
   from public.contacts c where c.barangay_id is null),
  '1:(046) 430-0001:-', 'saving again replaces the office''s row');
select pg_temp.throws($$select public.contact_set('atlantis', '123', null)$$, 'bad_barangay',
                      'refused: an unknown barangay');
select pg_temp.throws($$select public.contact_set(null, repeat('1', 41), null)$$, 'too_long',
                      'refused: a number over 40 characters');
select public.contact_set(null, '  ', '');
select public.contact_set('milagrosa', null, null);
select pg_temp.eq((select count(*)::text from public.contacts), pg_temp.recall('contacts_before'),
                  'clearing both fields removes the row');
select pg_temp.as_owner();
select pg_temp.throws(
  $$insert into public.contacts (barangay_id, updated_by) values ('bancal', pg_temp.uid('admin'))$$,
  '23514', 'table rule: a contact row is never empty');

-- =======================================================================================
-- E. Decisions on backup-truck suggestions
-- =======================================================================================
select pg_temp.as_user('dispatcher');
select public.suggestion_decide(date '2026-10-06', 'r-mabuhay', 'dispatched');
select public.suggestion_decide(date '2026-10-06', 'r-mabuhay', 'dismissed');
select pg_temp.eq(
  (select count(*)::int || ':' || max(d.decision) from public.suggestion_decisions d
   where d.service_day = date '2026-10-06' and d.route_id = 'r-mabuhay'),
  '1:dismissed', 'one decision per route per day; the last one stands');
select pg_temp.throws($$select public.suggestion_decide(date '2026-10-06', 'r-mabuhay', 'maybe')$$,
                      'bad_decision', 'refused: an unknown decision');
select pg_temp.throws($$select public.suggestion_decide(date '2026-10-07', 'r-mabuhay', 'dispatched')$$,
                      'no_collection_that_day', 'refused: a day the route does not run');

-- =======================================================================================
-- F. Schedule changes
-- =======================================================================================
select pg_temp.throws(
  $$select public.schedule_change('r-mabuhay', pg_temp.recall('today')::date, 't3',
                                  array[2, 5]::smallint[], '07:00', '10:00', 'mixed')$$,
  'too_soon', 'refused: a change that starts today');
select pg_temp.throws(
  $$select public.schedule_change('r-mabuhay', pg_temp.recall('today')::date + 7, 't3',
                                  array[]::smallint[], '07:00', '10:00', 'mixed')$$,
  'no_days', 'refused: no collection day');
select pg_temp.throws(
  $$select public.schedule_change('r-mabuhay', pg_temp.recall('today')::date + 7, 't3',
                                  array[2, 7]::smallint[], '07:00', '10:00', 'mixed')$$,
  'no_days', 'refused: a weekday that does not exist');
select pg_temp.throws(
  $$select public.schedule_change('r-mabuhay', pg_temp.recall('today')::date + 7, 't3',
                                  array[2, 5]::smallint[], '10:00', '10:00', 'mixed')$$,
  'end_before_start', 'refused: a window that ends when it starts');
select pg_temp.throws(
  $$select public.schedule_change('r-nowhere', pg_temp.recall('today')::date + 7, 't3',
                                  array[2, 5]::smallint[], '07:00', '10:00', 'mixed')$$,
  'unknown_route', 'refused: an unknown route');
select pg_temp.throws(
  $$select public.schedule_change('r-mabuhay', pg_temp.recall('today')::date + 7, 't9',
                                  array[2, 5]::smallint[], '07:00', '10:00', 'mixed')$$,
  'unknown_truck', 'refused: an unknown truck');
select pg_temp.throws(
  $$select public.schedule_change('r-mabuhay', pg_temp.recall('today')::date + 7, 't3',
                                  array[2, 5]::smallint[], '07:00', '10:00', 'plastic')$$,
  'bad_waste_type', 'refused: an unknown waste type');

select public.schedule_change('r-mabuhay', pg_temp.recall('today')::date + 7, 't1',
                              array[5, 1, 5, 3]::smallint[], '06:30', '09:30', 'biodegradable');
select pg_temp.eq(
  (select string_agg(coalesce((s.valid_from - pg_temp.recall('today')::date)::text, 'original') || ':'
                     || s.truck_id || ':' || array_to_string(s.days, '') || ':'
                     || to_char(s.start_time, 'HH24:MI') || ':' || s.waste_type || ':' || s.expected_load,
                     ' | ' order by s.valid_from nulls first)
   from public.route_schedules s where s.route_id = 'r-mabuhay'),
  'original:t3:25:07:00:mixed:1.45 | 7:t1:135:06:30:biodegradable:1.45',
  'a change adds a dated row (days sorted, load carried over); the original is untouched');
-- A second change that starts earlier replaces the one that had not started yet.
select public.schedule_change('r-mabuhay', pg_temp.recall('today')::date + 3, 't3',
                              array[2, 4]::smallint[], '07:00', '10:00', 'mixed');
select pg_temp.eq(
  (select string_agg(coalesce((s.valid_from - pg_temp.recall('today')::date)::text, 'original') || ':'
                     || array_to_string(s.days, ''), ' | ' order by s.valid_from nulls first)
   from public.route_schedules s where s.route_id = 'r-mabuhay'),
  'original:25 | 3:24', 'a change replaces rows that would only start on or after it');
-- The late departure (07:17 for the Milagrosa route) is kept only while the start is unchanged.
select public.schedule_change('r-poblacion-milagrosa', pg_temp.recall('today')::date + 2, 't2',
                              array[2, 5]::smallint[], '07:00', '11:00', 'mixed');
select public.schedule_change('r-poblacion-milagrosa', pg_temp.recall('today')::date + 9, 't2',
                              array[2, 5]::smallint[], '06:00', '09:00', 'mixed');
select pg_temp.eq(
  (select string_agg(coalesce(to_char(s.depart_at, 'HH24:MI'), 'none'), ',' order by s.valid_from nulls first)
   from public.route_schedules s where s.route_id = 'r-poblacion-milagrosa'),
  '07:17,07:17,none', 'the late departure is carried while the start time stays the same');
select pg_temp.as_user('viewer');
select pg_temp.throws(
  $$select public.schedule_change('r-bancal', pg_temp.recall('today')::date + 7, 't1',
                                  array[1, 4]::smallint[], '07:00', '10:00', 'mixed')$$,
  'not_allowed', 'a viewer cannot change a schedule');
-- The calendar follows the row in force on each day.
select pg_temp.as_owner();
-- (Days touched by a holiday change are left out, so the test holds whenever it is run.)
select pg_temp.eq(
  (select count(*)::int
   from generate_series(pg_temp.recall('today')::date + 1, pg_temp.recall('today')::date + 9,
                        interval '1 day') as d
   where private.route_runs_on('r-mabuhay', d::date)
         <> (extract(dow from d) in (select unnest(case when d::date < pg_temp.recall('today')::date + 3
                                                        then array[2, 5] else array[2, 4] end)))
     and not exists (
       select 1
       from public.schedule_exceptions e
       join public.schedule_exception_routes r on r.exception_id = e.id
       where r.route_id = 'r-mabuhay' and (e.on_date = d::date or e.move_to = d::date))),
  0, 'the original row decides the days until the change starts, the new row from then on');
select pg_temp.throws(
  $$update public.route_schedules set days = '{5,2}' where route_id = 'r-bancal'$$,
  '23514', 'table rule: collection days are a sorted set of weekdays');
select pg_temp.throws(
  $$insert into public.route_schedules (route_id, truck_id, days, start_time, window_end, waste_type, expected_load)
    values ('r-bancal', 't1', '{1,4}', '07:00', '10:00', 'mixed', 0.8)$$,
  '23505', 'table rule: one schedule row per route per start date');

-- =======================================================================================
-- G. Staff accounts
-- =======================================================================================
select pg_temp.as_user('admin');
select pg_temp.throws($$select public.staff_save(gen_random_uuid(), 'Nobody', 'viewer', null, true)$$,
                      'unknown_login', 'refused: a login that does not exist');
select pg_temp.throws($$select public.staff_save(pg_temp.uid('guest'), 'Guest', 'viewer', null, true)$$,
                      'unknown_login', 'refused: a guest identity cannot become staff');
select pg_temp.throws($$select public.staff_save(pg_temp.uid('newcomer'), 'New', 'boss', null, true)$$,
                      'bad_role', 'refused: an unknown role');
select pg_temp.throws($$select public.staff_save(pg_temp.uid('newcomer'), 'New', 'barangay', null, true)$$,
                      'bad_barangay', 'refused: a barangay focal person without a barangay');
select pg_temp.throws($$select public.staff_save(pg_temp.uid('newcomer'), 'New', 'viewer', 'milagrosa', true)$$,
                      'bad_barangay', 'refused: a city-wide role tied to a barangay');
select pg_temp.throws($$select public.staff_save(pg_temp.uid('newcomer'), '   ', 'viewer', null, true)$$,
                      'bad_name', 'refused: a blank name');
select public.staff_save(pg_temp.uid('newcomer'), '  New Dispatcher  ', 'dispatcher', null, true);
select pg_temp.eq(
  (select s.name || '|' || s.role || '|' || s.active from public.staff s
   where s.user_id = pg_temp.uid('newcomer')),
  'New Dispatcher|dispatcher|true', 'an admin gives a login its role');
select pg_temp.as_user('newcomer');
select pg_temp.eq(private.staff_role(), 'dispatcher', 'the login now has dispatcher rights');
select pg_temp.throws($$select public.staff_save(pg_temp.uid('newcomer'), 'Me', 'admin', null, true)$$,
                      'not_allowed', 'a dispatcher cannot promote themselves');
select pg_temp.as_user('admin');
select public.staff_save(pg_temp.uid('newcomer'), 'New Dispatcher', 'dispatcher', null, false);
select pg_temp.as_user('newcomer');
select pg_temp.eq(private.staff_role(), null, 'a deactivated account has no rights');
-- The city always keeps one active admin.
select pg_temp.as_user('admin');
select pg_temp.throws($$select public.staff_save(pg_temp.uid('admin'), 'Test Admin', 'viewer', null, true)$$,
                      'last_admin', 'the last admin cannot be demoted');
select pg_temp.throws($$select public.staff_save(pg_temp.uid('admin'), 'Test Admin', 'admin', null, false)$$,
                      'last_admin', 'the last admin cannot be deactivated');
select public.staff_save(pg_temp.uid('newcomer'), 'Second Admin', 'admin', null, true);
select public.staff_save(pg_temp.uid('admin'), 'Test Admin', 'viewer', null, true);
select pg_temp.eq(private.staff_role(), 'viewer', 'with a second admin in place, the first can step down');
select pg_temp.as_owner();
select pg_temp.throws(
  $$update public.staff set role = 'barangay' where user_id = pg_temp.uid('dispatcher')$$,
  '23514', 'table rule: a barangay focal person has a barangay');

-- =======================================================================================
-- H. "Burahin ang data ko"
-- =======================================================================================
select pg_temp.as_user('resident_b');
select pg_temp.remember('ticket_b', public.report_submit(
  gen_random_uuid(), 'DUMPING', 'pile', 121.04384, 14.30479));
select public.forget_me();
select pg_temp.as_owner();
select pg_temp.eq(
  (select count(*)::int from auth.users u where u.id = pg_temp.uid('resident_b')),
  0, 'the guest identity is gone');
select pg_temp.eq(
  (select count(*)::int from private.sms_subscriptions s where s.user_id = pg_temp.uid('resident_b')),
  0, 'its text sign-up went with it');
select pg_temp.eq(
  (select (t.reporter_id is null)::text || '|' || t.status || '|' || t.source
   from public.tickets t where t.id = pg_temp.recall('ticket_b')),
  'true|submitted|resident', 'its report stays as a city record, no longer linked to anyone');
select pg_temp.as_user('viewer');
select pg_temp.throws($$select public.forget_me()$$, 'not_allowed',
                      'a staff login cannot be removed this way');
select pg_temp.as_anon();
select pg_temp.throws($$select public.forget_me()$$, '42501', 'without sign-in there is nothing to forget');
select pg_temp.throws($$select public.sms_status()$$, '42501', 'without sign-in there is no text sign-up to read');

select pg_temp.finish();
