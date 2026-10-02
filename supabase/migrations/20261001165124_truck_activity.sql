-- KolektaPH pilot database · 4 of 8 · truck activity
--
-- What driver phones enter: shifts, the crew's taps and GPS. Rows are written only by
-- driver_upload (migration 6) and by the demo controls (migration 8). Truck positions, missed
-- streets and statistics are calculated by the app from these rows and are never stored.

create function private.is_non_decreasing(a integer[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    a is not null
    and not exists (
      select 1
      from unnest(a) with ordinality as u (v, i)
      where u.v is null or (u.i > 1 and u.v < a[(u.i - 1)::integer])
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------------------

create table public.shifts (
  id          text primary key check (id ~ '^[A-Za-z0-9|_.:-]{8,80}$'),
  truck_id    text not null references public.trucks (id),
  route_id    text references public.routes (id),
  crew        smallint not null check (crew between 1 and 10),
  gps_source  text check (gps_source in ('phone', 'demo')),
  started_at  timestamptz not null,
  ended_at    timestamptz,
  check (ended_at is null or ended_at >= started_at),
  -- Lets truck_events prove that its shift belongs to its truck.
  unique (id, truck_id)
);
comment on table public.shifts is
  'A driver shift. The id is made on the phone, so a repeated upload cannot create a second one. Start and end are columns here, not separate events.';
comment on column public.shifts.gps_source is
  'Set by the first GPS upload: the phone''s own GPS, or the demo stand-in.';
create index shifts_started_at_idx on public.shifts (started_at);

-- ---------------------------------------------------------------------------------------
-- Truck events
-- ---------------------------------------------------------------------------------------

create table public.truck_events (
  seq               bigint generated always as identity primary key,
  id                text not null unique check (id ~ '^[A-Za-z0-9|_.:-]{8,80}$'),
  truck_id          text not null references public.trucks (id),
  shift_id          text,
  at                timestamptz not null,
  kind              text not null
                      check (kind in ('status', 'load', 'disposal', 'incident', 'incident_end', 'street')),
  status            text check (status in ('on_route', 'full', 'to_disposal', 'break')),
  load              numeric(3, 2) check (load in (0.25, 0.50, 0.75)),
  disposal_action   text check (disposal_action in ('arrive', 'leave')),
  incident          text check (incident in ('breakdown', 'flat_tire', 'flood', 'road_blocked')),
  incident_minutes  smallint check (incident_minutes between 5 and 480),
  street_key        text check (street_key ~ '^[a-z0-9-]{1,40}[|].{1,80}$'),
  street_outcome    text check (street_outcome in ('collected', 'skipped')),
  skip_reason       text
                      check (skip_reason in ('no_garbage', 'not_segregated', 'road_blocked', 'truck_full', 'other')),
  foreign key (shift_id, truck_id) references public.shifts (id, truck_id),
  -- Only the columns that belong to the kind may be filled.
  constraint truck_events_payload_matches_kind check (
    case kind
      when 'status' then
        status is not null
        and num_nonnulls(load, disposal_action, incident, incident_minutes,
                         street_key, street_outcome, skip_reason) = 0
      when 'load' then
        load is not null
        and num_nonnulls(status, disposal_action, incident, incident_minutes,
                         street_key, street_outcome, skip_reason) = 0
      when 'disposal' then
        disposal_action is not null
        and num_nonnulls(status, load, incident, incident_minutes,
                         street_key, street_outcome, skip_reason) = 0
      when 'incident' then
        incident is not null and incident_minutes is not null
        and num_nonnulls(status, load, disposal_action,
                         street_key, street_outcome, skip_reason) = 0
      when 'incident_end' then
        num_nonnulls(status, load, disposal_action, incident, incident_minutes,
                     street_key, street_outcome, skip_reason) = 0
      when 'street' then
        street_key is not null and street_outcome is not null
        and (street_outcome = 'skipped') = (skip_reason is not null)
        and num_nonnulls(status, load, disposal_action, incident, incident_minutes) = 0
      else false
    end
  ),
  -- A row without a shift is an incident triggered from the demo controls.
  constraint truck_events_no_shift_means_demo
    check (shift_id is not null or kind in ('incident', 'incident_end'))
);
comment on table public.truck_events is
  'One crew tap. seq is the arrival order and the cursor clients use to fetch only new rows; id is made on the phone and makes a repeated upload harmless.';
comment on column public.truck_events.at is
  'When it happened, as the phone recorded it (taps are often uploaded later).';
comment on column public.truck_events.street_key is
  'The street, as "barangay|street name" (or "barangay|segment id" for an unnamed road). The route is the shift''s route.';
create index truck_events_at_idx on public.truck_events (at);

-- ---------------------------------------------------------------------------------------
-- GPS
-- ---------------------------------------------------------------------------------------

create table public.gps_batches (
  shift_id    text not null references public.shifts (id) on delete cascade,
  from_index  integer not null check (from_index >= 0),
  t0          timestamptz not null,
  dt_ms       integer[] not null,
  lng_e6      integer[] not null,
  lat_e6      integer[] not null,
  acc_m       smallint[] not null,
  fix_count   smallint generated always as (cardinality(dt_ms)::smallint) stored,
  primary key (shift_id, from_index),
  constraint gps_batches_shape check (
    array_ndims(dt_ms) = 1
    and cardinality(dt_ms) between 1 and 200
    and cardinality(lng_e6) = cardinality(dt_ms)
    and cardinality(lat_e6) = cardinality(dt_ms)
    and cardinality(acc_m) = cardinality(dt_ms)
  ),
  constraint gps_batches_values check (
    private.is_non_decreasing(dt_ms)
    and 0 <= all (dt_ms)
    and array_position(lng_e6, null) is null
    and array_position(lat_e6, null) is null
    -- A sanity box around the Philippines; the disposal site may be outside the city.
    and 116000000 <= all (lng_e6) and 127000000 >= all (lng_e6)
    and 4000000 <= all (lat_e6) and 22000000 >= all (lat_e6)
    -- Accuracy may be unknown (null); a known one is 0 to 100 m.
    and 0 <= all (acc_m) and 100 >= all (acc_m)
  )
);
comment on table public.gps_batches is
  'One GPS upload of a shift: up to 200 fixes as packed arrays. Fix i is at t0 + dt_ms[i], at (lng_e6[i], lat_e6[i]) / 1e6 degrees, with accuracy acc_m[i] metres. from_index is the position of the first fix in the shift''s recording.';

-- ---------------------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------------------

alter table public.shifts enable row level security;
alter table public.truck_events enable row level security;
alter table public.gps_batches enable row level security;

create policy read_all on public.shifts for select to anon, authenticated using (true);
create policy read_all on public.truck_events for select to anon, authenticated using (true);
-- Raw GPS: city-wide staff, and the phones of the truck it belongs to.
create policy gps_read on public.gps_batches for select to authenticated
  using (
    (select private.staff_role()) in ('admin', 'dispatcher', 'viewer')
    or exists (
      select 1
      from public.shifts s
      where s.id = gps_batches.shift_id and s.truck_id = (select private.my_truck())
    )
  );

grant select on public.shifts to anon, authenticated;
grant select on public.truck_events to anon, authenticated;
grant select on public.gps_batches to authenticated;
