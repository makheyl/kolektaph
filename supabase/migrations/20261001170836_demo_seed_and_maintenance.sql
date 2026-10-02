-- KolektaPH pilot database · 8 of 8 · demo controls, seed loader and maintenance
--
-- The demo controls are prototype-only and are dropped for production, together with
-- public.demo_clock. Everything here is admin-only or not reachable through the API at all.

-- ---------------------------------------------------------------------------------------
-- Sample tickets: the recipe, and the function that builds them
-- ---------------------------------------------------------------------------------------

create table private.sample_tickets (
  seq   integer primary key check (seq between 1 and 999999),
  spec  jsonb not null
);
comment on table private.sample_tickets is
  'Recipe of each sample report (from src/data/carmona/sampleTickets.ts): its details and the actions taken on it, with times relative to "now". The seed and the demo reset build the sample tickets from it through the real lifecycle.';
alter table private.sample_tickets enable row level security;

create function private.seed_sample_tickets()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.app_now();
  v_year text := extract(year from v_now at time zone 'Asia/Manila')::integer::text;
  r record;
  v_photo record;
  v_step jsonb;
  v_args jsonb;
  v_actor text;
  v_truck text;
  v_id text;
begin
  for r in select s.seq, s.spec from private.sample_tickets s order by s.seq loop
    v_id := 'KPH-' || v_year || '-' || lpad(r.seq::text, 6, '0');
    insert into public.tickets
      (id, category, size, location, accuracy_m, barangay_id, landmark, near_waterway,
       near_sensitive, note, created_at, is_sample)
    values (
      v_id, r.spec ->> 'category', r.spec ->> 'size',
      private.make_point((r.spec ->> 'lng')::double precision, (r.spec ->> 'lat')::double precision),
      (r.spec ->> 'accuracy_m')::smallint, r.spec ->> 'barangay_id',
      nullif(r.spec ->> 'landmark', ''),
      (r.spec ->> 'near_waterway')::boolean, (r.spec ->> 'near_sensitive')::boolean,
      nullif(r.spec ->> 'note', ''),
      v_now - (r.spec ->> 'created_hours_ago')::numeric * interval '1 hour',
      true
    );

    for v_photo in
      select x.id, x.i
      from jsonb_array_elements_text(r.spec -> 'photos') with ordinality as x (id, i)
    loop
      perform private.attach_photo(
        v_id, null, case v_photo.i when 1 then 'wide' else 'close' end,
        jsonb_build_object('sample', v_photo.id), null
      );
    end loop;

    for v_step in select x from jsonb_array_elements(r.spec -> 'steps') as x loop
      v_actor := v_step ->> 'by';
      v_args := v_step - 'hours_ago' - 'action' - 'by' - 'due_hours_from_now';
      if v_step ? 'due_hours_from_now' then
        v_args := v_args || jsonb_build_object(
          'due', v_now + (v_step ->> 'due_hours_from_now')::numeric * interval '1 hour'
        );
      end if;
      select t.dispatch_truck_id into v_truck from public.tickets t where t.id = v_id;
      perform private.ticket_apply(
        v_id, v_step ->> 'action', v_actor,
        v_now - (v_step ->> 'hours_ago')::numeric * interval '1 hour',
        null, case when v_actor = 'driver' then v_truck end, v_args, null
      );
    end loop;
  end loop;

  -- Real ticket numbers continue after the samples.
  insert into private.ticket_counters as c (year, last_seq)
  select v_year::smallint, coalesce(max(s.seq), 0) from private.sample_tickets s
  on conflict (year) do update set last_seq = greatest(c.last_seq, excluded.last_seq);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Seed loader: fills an empty database from the JSON built by scripts/db/build-seed.ts
-- ---------------------------------------------------------------------------------------

-- Not reachable through the API. Run it as the database owner, or through the one-time door
-- in supabase/seed/. It refuses to run on a database that already has reference data.
create function private.seed_load(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ex jsonb;
  v_ex_id integer;
begin
  if exists (select 1 from public.barangays)
     or exists (select 1 from public.trucks)
     or exists (select 1 from public.routes)
     or exists (select 1 from public.city_meta) then
    perform private.fail('already_seeded', 409);
  end if;

  insert into public.city_meta
    (west, south, east, north, center, depot_name, depot_point, sources, reference_version)
  select
    (m -> 'bounds' -> 0 ->> 0)::double precision, (m -> 'bounds' -> 0 ->> 1)::double precision,
    (m -> 'bounds' -> 1 ->> 0)::double precision, (m -> 'bounds' -> 1 ->> 1)::double precision,
    extensions.st_setsrid(extensions.st_makepoint(
      (m -> 'center' ->> 0)::double precision, (m -> 'center' ->> 1)::double precision), 4326),
    m -> 'depot' ->> 'name',
    extensions.st_setsrid(extensions.st_makepoint(
      (m -> 'depot' -> 'coordinates' ->> 0)::double precision,
      (m -> 'depot' -> 'coordinates' ->> 1)::double precision), 4326),
    array(select jsonb_array_elements_text(m -> 'sources')),
    m ->> 'reference_version'
  from (select p -> 'meta' as m) as x;

  insert into public.barangays
    (id, name, alt_names, population, osm_relation_id, label_point, geom)
  select
    b ->> 'id', b ->> 'name',
    array(select jsonb_array_elements_text(b -> 'alt_names')),
    (b ->> 'population')::integer, (b ->> 'osm_relation_id')::bigint,
    extensions.st_setsrid(extensions.st_makepoint(
      (b -> 'label_point' ->> 0)::double precision, (b -> 'label_point' ->> 1)::double precision), 4326),
    extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(b -> 'geometry'), 4326))
  from jsonb_array_elements(p -> 'barangays') as b;

  insert into public.trucks (id, code, name, capacity_tonnes)
  select t ->> 'id', t ->> 'code', t ->> 'name', (t ->> 'capacity_tonnes')::numeric
  from jsonb_array_elements(p -> 'trucks') as t;

  insert into public.routes (id)
  select r ->> 'id' from jsonb_array_elements(p -> 'routes') as r;

  insert into public.route_barangays (route_id, seq, barangay_id)
  select r ->> 'id', b.i::smallint, b.id
  from jsonb_array_elements(p -> 'routes') as r,
       jsonb_array_elements_text(r -> 'barangay_ids') with ordinality as b (id, i);

  insert into public.route_segments
    (id, route_id, seq, name, barangay_id, collect, length_m, geom)
  select
    s.x ->> 'id', r ->> 'id', s.i::smallint, s.x ->> 'name', s.x ->> 'barangay_id',
    (s.x ->> 'collect')::boolean, (s.x ->> 'length_m')::integer,
    extensions.st_setsrid(extensions.st_geomfromgeojson(
      jsonb_build_object('type', 'LineString', 'coordinates', s.x -> 'coordinates')), 4326)
  from jsonb_array_elements(p -> 'routes') as r,
       jsonb_array_elements(r -> 'segments') with ordinality as s (x, i);

  insert into public.route_schedules
    (route_id, truck_id, days, start_time, window_end, depart_at, waste_type, expected_load)
  select
    s ->> 'route_id', s ->> 'truck_id',
    array(select jsonb_array_elements_text(s -> 'days'))::smallint[],
    (s ->> 'start')::time, (s ->> 'window_end')::time, (s ->> 'depart_at')::time,
    s ->> 'waste_type', (s ->> 'expected_load')::numeric
  from jsonb_array_elements(p -> 'schedules') as s;

  for v_ex in select x from jsonb_array_elements(p -> 'exceptions') as x loop
    insert into public.schedule_exceptions (on_date, action, move_to, reason_fil, reason_en)
    values ((v_ex ->> 'date')::date, v_ex ->> 'action', (v_ex ->> 'move_to')::date,
            v_ex ->> 'reason_fil', v_ex ->> 'reason_en')
    returning id into v_ex_id;
    insert into public.schedule_exception_routes (exception_id, on_date, route_id)
    select v_ex_id, (v_ex ->> 'date')::date, x
    from jsonb_array_elements_text(v_ex -> 'route_ids') as x;
  end loop;

  insert into private.sample_tickets (seq, spec)
  select (t ->> 'seq')::integer, t - 'seq'
  from jsonb_array_elements(p -> 'sample_tickets') as t;
  perform private.seed_sample_tickets();

  return jsonb_build_object(
    'barangays', (select count(*) from public.barangays),
    'trucks', (select count(*) from public.trucks),
    'routes', (select count(*) from public.routes),
    'route_barangays', (select count(*) from public.route_barangays),
    'route_segments', (select count(*) from public.route_segments),
    'route_schedules', (select count(*) from public.route_schedules),
    'schedule_exceptions', (select count(*) from public.schedule_exceptions),
    'schedule_exception_routes', (select count(*) from public.schedule_exception_routes),
    'tickets', (select count(*) from public.tickets),
    'ticket_events', (select count(*) from public.ticket_events),
    'ticket_photos', (select count(*) from public.ticket_photos)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Demo controls (admin only)
-- ---------------------------------------------------------------------------------------

-- "Masira ang Truck 2 ngayon": an incident at the app's current time, with no shift.
create function private.demo_incident(p_truck_id text, p_incident text, p_minutes integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_staff('admin');
  v_now timestamptz := private.app_now();
  v_id text;
begin
  if not exists (select 1 from public.trucks t where t.id = p_truck_id) then
    perform private.fail('unknown_truck', 404);
  end if;
  if p_incident is null
     or p_incident not in ('breakdown', 'flat_tire', 'flood', 'road_blocked') then
    perform private.fail('bad_incident');
  end if;
  if p_minutes is null or p_minutes not between 5 and 480 then
    perform private.fail('bad_minutes');
  end if;

  v_id := 'demo-' || p_incident || '|' || p_truck_id || '|'
          || (extract(epoch from v_now) * 1000)::bigint::text;
  -- The same lock as driver_upload: one event writer at a time.
  perform pg_advisory_xact_lock(7166001);
  insert into public.truck_events (id, truck_id, at, kind, incident, incident_minutes)
  values (v_id, p_truck_id, v_now, 'incident', p_incident, p_minutes)
  on conflict (id) do nothing;
  return v_id;
end;
$$;

-- "I-reset ang lahat ng demo data": back to the seeded state. Staff accounts, truck PINs and
-- text-alert sign-ups are kept, and so is the demo clock. Returns the photo files the caller
-- should now remove from storage.
create function private.demo_reset(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_staff('admin');
  v_paths jsonb;
begin
  if p_confirm is distinct from 'RESET' then
    perform private.fail('confirm_required', 400, 'Pass the word RESET to confirm.');
  end if;

  select coalesce(jsonb_agg(p.storage_path order by p.storage_path), '[]'::jsonb) into v_paths
  from public.ticket_photos p
  where p.storage_path is not null;

  delete from public.suggestion_decisions where true;
  delete from public.announcements where true;
  delete from public.sms_lead_changes where true;
  delete from public.contacts where true;
  delete from public.tickets where true;
  delete from public.gps_batches where true;
  delete from public.truck_events where true;
  delete from public.shifts where true;
  delete from public.route_schedules s where s.valid_from is not null;
  delete from private.ticket_counters where true;

  perform private.seed_sample_tickets();
  return jsonb_build_object('photos_to_remove', v_paths);
end;
$$;

create function public.demo_incident(
  p_truck_id text, p_incident text default 'breakdown', p_minutes integer default 120
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.demo_incident(p_truck_id, p_incident, p_minutes);
$$;

create function public.demo_reset(p_confirm text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.demo_reset(p_confirm);
$$;

grant execute on function private.demo_incident(text, text, integer) to authenticated;
grant execute on function public.demo_incident(text, text, integer) to authenticated;
grant execute on function private.demo_reset(text) to authenticated;
grant execute on function public.demo_reset(text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Maintenance: one daily job, no logs kept
-- ---------------------------------------------------------------------------------------

create function private.cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.driver_sessions d where d.expires_at < now();
  -- Raw GPS is kept for 35 days (the statistics look back 28).
  delete from public.gps_batches b where b.t0 < now() - interval '35 days';
  -- Guest identities that own nothing: no text sign-up, no report, no driver session.
  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '7 days'
    and not exists (select 1 from private.sms_subscriptions s where s.user_id = u.id)
    and not exists (select 1 from public.tickets t where t.reporter_id = u.id)
    and not exists (select 1 from private.driver_sessions d where d.user_id = u.id);
  -- The scheduler's own run history.
  delete from cron.job_run_details r where r.end_time < now() - interval '7 days';
end;
$$;

create extension if not exists pg_cron with schema pg_catalog;
-- Every day at 03:00 in Manila (19:00 UTC).
select cron.schedule('kolektaph-cleanup', '0 19 * * *', 'select private.cleanup()');
