-- KolektaPH pilot database · follow-up 2 · what a connected app reads
--
-- pulse(p_seq)        The one small read a device repeats every few seconds. It answers with
--                     the shared clock, what the caller is allowed to do, the truck events that
--                     arrived after p_seq, and a fingerprint of each set of rows the caller can
--                     see. A device reads a set again only when its fingerprint changes, so an
--                     idle app costs one small request per tick and nothing is downloaded twice.
-- shift_gps(p_since)  How many GPS fixes each shift has and when the last one was taken,
--                     without downloading the fixes.
--
-- Both only read, and both run as the caller: the row rules and column grants decide what each
-- caller gets. Nothing new is stored.
--
-- Why new events can be fetched with "seq > the last one seen": every writer of truck_events
-- takes the same lock (driver_upload, demo_incident), so seq order is commit order and a reader
-- can never skip a row.

create function public.pulse(p_seq bigint default 0)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_clock public.demo_clock;
  v_app_now timestamptz;
  v_events jsonb;
  v_rev jsonb;
begin
  select c.* into v_clock from public.demo_clock c;
  -- The same formula as private.app_now().
  v_app_now := coalesce(v_clock.anchor_sim + (now() - v_clock.anchor_real) * v_clock.speed, now());

  -- New truck events, oldest first, 500 at a time. Events older than nine days of app time are
  -- left out: the app replays at most the last eight days.
  select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(x)) order by x.seq), '[]'::jsonb)
    into v_events
  from (
    select e.seq, e.id, e.truck_id, e.shift_id,
           (extract(epoch from e.at) * 1000)::bigint as at,
           e.kind, e.status, e.load, e.disposal_action, e.incident, e.incident_minutes,
           e.street_key, e.street_outcome, e.skip_reason
    from public.truck_events e
    where e.seq > coalesce(p_seq, 0)
      and e.at >= v_app_now - interval '9 days'
    order by e.seq
    limit 500
  ) x;

  v_rev := jsonb_build_object(
    'shifts', (
      select md5(coalesce(jsonb_agg(
               jsonb_build_array(s.id, s.route_id, s.crew, s.gps_source, s.started_at, s.ended_at)
               order by s.id)::text, ''))
      from public.shifts s
      where s.started_at >= v_app_now - interval '9 days'),
    'schedules', (
      select md5(coalesce(jsonb_agg(
               jsonb_build_array(s.id, s.route_id, s.truck_id, s.days, s.start_time, s.window_end,
                                 s.depart_at, s.waste_type, s.expected_load, s.valid_from)
               order by s.id)::text, ''))
      from public.route_schedules s),
    'lead', (
      select md5(coalesce(jsonb_agg(jsonb_build_array(c.effective_at, c.minutes)
                                    order by c.effective_at)::text, ''))
      from public.sms_lead_changes c),
    'contacts', (
      select md5(coalesce(jsonb_agg(jsonb_build_array(c.id, c.barangay_id, c.phone, c.hours)
                                    order by c.id)::text, ''))
      from public.contacts c),
    -- Announcements are only ever added (or all removed by a demo reset).
    'announcements', (
      select count(*)::text || ':' || coalesce(max(a.id), 0)::text
      from public.announcements a),
    -- Every change to a ticket adds an action, so the counts and the newest action tell.
    'tickets',
      (select count(*)::text from public.tickets t) || ':' ||
      (select count(*)::text || ':' || coalesce(max(e.id), 0)::text from public.ticket_events e)
  );

  -- Sets only a signed-in caller has any right to. (A separate statement, so a caller without
  -- sign-in is never checked against tables it has no grant on.)
  if (select auth.uid()) is not null then
    v_rev := v_rev || jsonb_build_object(
      'decisions', (
        select md5(coalesce(jsonb_agg(
                 jsonb_build_array(d.service_day, d.route_id, d.decision, d.decided_at)
                 order by d.service_day, d.route_id)::text, ''))
        from public.suggestion_decisions d),
      'staff', (
        select md5(coalesce(jsonb_agg(
                 jsonb_build_array(s.user_id, s.name, s.role, s.barangay_id, s.active)
                 order by s.user_id)::text, ''))
        from public.staff s),
      'gps', (
        select count(*)::text || ':' || coalesce(sum(b.fix_count), 0)::text
        from public.gps_batches b)
    );
  end if;

  return jsonb_build_object(
    -- When this request reached the database (a device lines its own clock up with it).
    'now', (extract(epoch from statement_timestamp()) * 1000)::bigint,
    'clock', jsonb_build_object(
      'anchor_real', (extract(epoch from v_clock.anchor_real) * 1000)::bigint,
      'anchor_sim', (extract(epoch from v_clock.anchor_sim) * 1000)::bigint,
      'speed', coalesce(v_clock.speed, 1)),
    'reference', (select m.reference_version from public.city_meta m),
    'me', jsonb_build_object(
      'role', (select private.staff_role()),
      'barangay', (select private.staff_barangay()),
      'truck', (select private.my_truck())),
    -- The oldest and newest event the server holds: a device drops what is older than the
    -- first (a demo reset removed it) and need not ask again for anything up to the last.
    'first_seq', (select min(e.seq) from public.truck_events e),
    'last_seq', (select max(e.seq) from public.truck_events e),
    'events', v_events,
    'rev', v_rev
  );
end;
$$;

comment on function public.pulse(bigint) is
  'Read only. The shared clock, the caller''s rights, truck events after p_seq, and a fingerprint per readable set.';

create function public.shift_gps(p_since timestamptz)
returns table (shift_id text, source text, points integer, last_fix_at bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id,
         s.gps_source,
         max(b.from_index + b.fix_count)::integer,
         (extract(epoch from max(b.t0 + b.dt_ms[b.fix_count] * interval '1 millisecond')) * 1000)::bigint
  from public.gps_batches b
  join public.shifts s on s.id = b.shift_id
  where s.started_at >= p_since
  group by s.id, s.gps_source;
$$;

comment on function public.shift_gps(timestamptz) is
  'Read only. Fixes received per shift and the time of the last one (epoch ms), for shifts started since p_since.';

grant execute on function public.pulse(bigint) to anon, authenticated;
grant execute on function public.shift_gps(timestamptz) to authenticated;
