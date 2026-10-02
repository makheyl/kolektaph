-- KolektaPH pilot database · 2 of 8 · reference data and schedules
--
-- Reference rows come from the app's own data files (src/data/carmona) through the seed
-- loader. Everyone may read them. Nobody can change any table through the API: there are no
-- insert, update or delete grants anywhere in this database.

-- ---------------------------------------------------------------------------------------
-- Reference
-- ---------------------------------------------------------------------------------------

create table public.barangays (
  id               text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name             text not null unique
                     check (name = btrim(name) and char_length(name) between 1 and 60),
  alt_names        text[] not null default '{}'
                     check (array_position(alt_names, null) is null),
  population       integer check (population > 0),
  osm_relation_id  bigint not null unique,
  label_point      extensions.geometry(Point, 4326) not null,
  geom             extensions.geometry(MultiPolygon, 4326) not null
                     check (extensions.st_isvalid(geom))
);
comment on table public.barangays is
  'The barangays of the city. The boundary decides which barangay a report belongs to.';
create index barangays_geom_idx on public.barangays using gist (geom);

create table public.city_meta (
  id                 boolean primary key default true check (id),
  west               double precision not null,
  south              double precision not null,
  east               double precision not null,
  north              double precision not null,
  center             extensions.geometry(Point, 4326) not null,
  depot_name         text not null
                       check (depot_name = btrim(depot_name) and char_length(depot_name) between 1 and 80),
  depot_point        extensions.geometry(Point, 4326) not null,
  sources            text[] not null
                       check (cardinality(sources) >= 1 and array_position(sources, null) is null),
  reference_version  text not null check (char_length(reference_version) between 1 and 40),
  check (west < east and south < north)
);
comment on table public.city_meta is
  'Exactly one row. reference_version lets the app check its bundled copy of the reference data.';

create table public.trucks (
  id               text primary key check (id ~ '^[a-z0-9-]{1,20}$'),
  code             text not null unique check (code ~ '^[A-Z0-9-]{1,12}$'),
  name             text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  capacity_tonnes  numeric(4, 1) not null check (capacity_tonnes > 0)
);

create table public.routes (
  id  text primary key check (id ~ '^[a-z0-9-]{1,40}$')
);
comment on table public.routes is
  'A route. Its length is the sum of its segments and its barangays are in route_barangays.';

create table public.route_barangays (
  route_id     text not null references public.routes (id),
  seq          smallint not null check (seq >= 1),
  barangay_id  text not null references public.barangays (id),
  primary key (route_id, seq),
  unique (route_id, barangay_id)
);

create table public.route_segments (
  id           text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  route_id     text not null references public.routes (id),
  seq          smallint not null check (seq >= 1),
  name         text check (name = btrim(name) and char_length(name) between 1 and 80),
  barangay_id  text references public.barangays (id),
  collect      boolean not null,
  length_m     integer not null check (length_m > 0),
  geom         extensions.geometry(LineString, 4326) not null,
  unique (route_id, seq),
  -- A street the truck collects on is always inside a barangay.
  check (not collect or barangay_id is not null)
);

-- ---------------------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------------------

-- A weekday set: 1 to 7 values, each 0 (Sunday) to 6, ascending, no repeats.
create function private.is_weekday_set(d smallint[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    d is not null
    and array_ndims(d) = 1
    and array_lower(d, 1) = 1
    and cardinality(d) between 1 and 7
    and not exists (
      select 1
      from unnest(d) with ordinality as u (v, i)
      where u.v is null
         or u.v not between 0 and 6
         or (u.i > 1 and u.v <= d[(u.i - 1)::integer])
    ),
    false
  );
$$;

create table public.route_schedules (
  id             integer generated always as identity primary key,
  route_id       text not null references public.routes (id),
  truck_id       text not null references public.trucks (id),
  days           smallint[] not null,
  start_time     time not null,
  window_end     time not null,
  depart_at      time,
  waste_type     text not null
                   check (waste_type in ('mixed', 'biodegradable', 'residual', 'recyclable')),
  expected_load  numeric(3, 2) not null check (expected_load > 0 and expected_load <= 3),
  valid_from     date,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  constraint route_schedules_days_ok check (private.is_weekday_set(days)),
  constraint route_schedules_window_ok check (window_end > start_time),
  constraint route_schedules_depart_ok
    check (depart_at is null or (depart_at >= start_time and depart_at < window_end)),
  constraint route_schedules_one_per_start unique nulls not distinct (route_id, valid_from)
);
comment on table public.route_schedules is
  'Weekly schedule of a route from valid_from (empty = the original). The row in force on a day is the one with the latest valid_from on or before it. Rows already in force are never edited.';
comment on column public.route_schedules.expected_load is
  'Simulation input: how full the truck gets on this route (above 1 = it fills up early).';
comment on column public.route_schedules.depart_at is
  'Simulation input: when the truck leaves the depot, if later than start_time.';

create table public.schedule_exceptions (
  id          integer generated always as identity primary key,
  on_date     date not null,
  action      text not null check (action in ('cancel', 'move')),
  move_to     date,
  reason_fil  text not null
                check (reason_fil = btrim(reason_fil) and char_length(reason_fil) between 1 and 80),
  reason_en   text not null
                check (reason_en = btrim(reason_en) and char_length(reason_en) between 1 and 80),
  check ((action = 'move') = (move_to is not null)),
  check (move_to is null or move_to <> on_date),
  unique (id, on_date)
);
comment on table public.schedule_exceptions is
  'A holiday change: collection cancelled or moved to another date for the routes listed in schedule_exception_routes.';

create table public.schedule_exception_routes (
  exception_id  integer not null,
  on_date       date not null,
  route_id      text not null references public.routes (id),
  primary key (exception_id, route_id),
  foreign key (exception_id, on_date)
    references public.schedule_exceptions (id, on_date) on delete cascade,
  -- A route has at most one change on a date.
  unique (route_id, on_date)
);

-- ---------------------------------------------------------------------------------------
-- Access: everyone reads, nobody writes
-- ---------------------------------------------------------------------------------------

alter table public.barangays enable row level security;
alter table public.city_meta enable row level security;
alter table public.trucks enable row level security;
alter table public.routes enable row level security;
alter table public.route_barangays enable row level security;
alter table public.route_segments enable row level security;
alter table public.route_schedules enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.schedule_exception_routes enable row level security;

create policy read_all on public.barangays for select to anon, authenticated using (true);
create policy read_all on public.city_meta for select to anon, authenticated using (true);
create policy read_all on public.trucks for select to anon, authenticated using (true);
create policy read_all on public.routes for select to anon, authenticated using (true);
create policy read_all on public.route_barangays for select to anon, authenticated using (true);
create policy read_all on public.route_segments for select to anon, authenticated using (true);
create policy read_all on public.route_schedules for select to anon, authenticated using (true);
create policy read_all on public.schedule_exceptions for select to anon, authenticated using (true);
create policy read_all on public.schedule_exception_routes
  for select to anon, authenticated using (true);

grant select on public.barangays to anon, authenticated;
grant select on public.city_meta to anon, authenticated;
grant select on public.trucks to anon, authenticated;
grant select on public.routes to anon, authenticated;
grant select on public.route_barangays to anon, authenticated;
grant select on public.route_segments to anon, authenticated;
grant select on public.schedule_exceptions to anon, authenticated;
grant select on public.schedule_exception_routes to anon, authenticated;
-- Who changed a schedule (created_by, created_at) is not readable through the API.
grant select (id, route_id, truck_id, days, start_time, window_end, depart_at, waste_type,
              expected_load, valid_from)
  on public.route_schedules to anon, authenticated;
