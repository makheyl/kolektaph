-- KolektaPH pilot database · test 2 · the seed equals the app's own data
-- Run after 00_harness.sql, as one query, on a freshly seeded (or freshly reset) database.
--
-- The expected values come from `npx tsx scripts/db/build-seed.ts --expect`, which computes
-- them from src/data/carmona with the app's own functions. If the app's data changes, re-seed
-- and paste the new values here.

-- ---------- Counts ----------
select pg_temp.eq((select count(*)::int from public.barangays), 14, '14 barangays');
select pg_temp.eq((select count(*)::int from public.city_meta), 1, '1 city row');
select pg_temp.eq((select count(*)::int from public.trucks), 4, '4 trucks');
select pg_temp.eq((select count(*)::int from public.routes), 6, '6 routes');
select pg_temp.eq((select count(*)::int from public.route_barangays), 14, '14 route-barangay links');
select pg_temp.eq((select count(*)::int from public.route_segments), 291, '291 route segments');
select pg_temp.eq((select count(*)::int from public.route_schedules), 6, '6 schedules');
select pg_temp.eq((select count(*)::int from public.schedule_exceptions), 3, '3 holiday changes');
select pg_temp.eq((select count(*)::int from public.schedule_exception_routes), 10,
                  '10 routes affected by holiday changes');
select pg_temp.eq((select count(*)::int from public.tickets where is_sample), 12, '12 sample tickets');
select pg_temp.eq((select count(*)::int from private.truck_credentials), 4, 'a PIN for each truck');
select pg_temp.eq((select reference_version from public.city_meta), '2026-09-29T01:56:19.797Z',
                  'reference version matches meta.json');

-- ---------- Content, to the digit ----------
select pg_temp.eq(
  (select md5(string_agg(
     b.id || ':' || b.name || ':' || coalesce(b.population::text, '') || ':' || b.osm_relation_id
     || ':' || array_to_string(b.alt_names, '/')
     || ':' || round(extensions.st_x(b.label_point) * 100000)::bigint
     || ':' || round(extensions.st_y(b.label_point) * 100000)::bigint
     || ':' || g.n || ':' || g.sx || ':' || g.sy,
     ',' order by b.id collate "C"))
   from public.barangays b
   join lateral (
     select count(*) as n,
            sum(round(extensions.st_x(d.geom) * 100000)::bigint) as sx,
            sum(round(extensions.st_y(d.geom) * 100000)::bigint) as sy
     from extensions.st_dumppoints(b.geom) as d
   ) as g on true),
  '8f95ffd5e52fa5bc4afe97558e626d45',
  'barangays: names, populations, label points and every boundary point');
select pg_temp.eq(
  (select md5(string_agg(
     s.id || ':' || s.route_id || ':' || s.seq || ':' || coalesce(s.name, '') || ':'
     || coalesce(s.barangay_id, '') || ':' || case when s.collect then '1' else '0' end || ':'
     || s.length_m || ':' || g.n || ':' || g.sx || ':' || g.sy,
     ',' order by s.route_id collate "C", s.seq))
   from public.route_segments s
   join lateral (
     select count(*) as n,
            sum(round(extensions.st_x(d.geom) * 100000)::bigint) as sx,
            sum(round(extensions.st_y(d.geom) * 100000)::bigint) as sy
     from extensions.st_dumppoints(s.geom) as d
   ) as g on true),
  '4d5550d62da115e8ad8289fb3d9953d8',
  'route segments: order, names, barangays, lengths and every point');
select pg_temp.eq(
  (select string_agg(r.id || ':' || rb.ids || ':' || sg.total, ',' order by r.id collate "C")
   from public.routes r
   join lateral (select string_agg(x.barangay_id, '+' order by x.seq) as ids
                 from public.route_barangays x where x.route_id = r.id) as rb on true
   join lateral (select sum(x.length_m) as total
                 from public.route_segments x where x.route_id = r.id) as sg on true),
  'r-bancal:bancal:11324,r-cabilang-baybay:cabilang-baybay:9774,r-lantic:lantic:27398,'
  || 'r-mabuhay:mabuhay:11155,r-poblacion-maduya:brgy-5+brgy-6+brgy-7+brgy-8+maduya:13170,'
  || 'r-poblacion-milagrosa:brgy-1+brgy-2+brgy-3+brgy-4+milagrosa:15207',
  'routes: barangays in order, and each route''s length is the sum of its segments');
select pg_temp.eq(
  (select string_agg(
     s.route_id || ':' || s.truck_id || ':' || array_to_string(s.days, '') || ':'
     || to_char(s.start_time, 'HH24:MI') || ':' || to_char(s.window_end, 'HH24:MI') || ':'
     || coalesce(to_char(s.depart_at, 'HH24:MI'), '') || ':' || s.waste_type || ':'
     || to_char(s.expected_load, 'FM0.00'),
     ',' order by s.route_id collate "C")
   from public.route_schedules s),
  'r-bancal:t1:14:07:00:10:00::mixed:0.80,r-cabilang-baybay:t2:14:07:00:10:00::mixed:0.60,'
  || 'r-lantic:t1:25:07:00:11:00::mixed:0.90,r-mabuhay:t3:25:07:00:10:00::mixed:1.45,'
  || 'r-poblacion-maduya:t4:25:07:00:10:30::mixed:0.80,'
  || 'r-poblacion-milagrosa:t2:25:07:00:10:00:07:17:mixed:0.85',
  'schedules');
select pg_temp.eq(
  (select string_agg(
     e.on_date || ':' || e.action || ':' || coalesce(e.move_to::text, '') || ':' || e.reason_fil
     || ':' || e.reason_en || ':'
     || (select string_agg(r.route_id, '+' order by r.route_id collate "C")
         from public.schedule_exception_routes r where r.exception_id = e.id),
     ',' order by e.on_date)
   from public.schedule_exceptions e),
  '2026-11-30:move:2026-12-02:Araw ni Bonifacio:Bonifacio Day:r-bancal+r-cabilang-baybay,'
  || '2026-12-25:move:2026-12-26:Pasko:Christmas Day:r-lantic+r-mabuhay+r-poblacion-maduya+r-poblacion-milagrosa,'
  || '2027-01-01:move:2027-01-02:Bagong Taon:New Year''s Day:r-lantic+r-mabuhay+r-poblacion-maduya+r-poblacion-milagrosa',
  'holiday changes');

-- ---------- The server's rules agree with the app's ----------
-- routeRunsOnDay (src/features/schedule/collections.ts) for 120 days from 1 October 2026,
-- which covers all three holiday moves.
select pg_temp.eq(
  (select md5(string_agg(r.id || '@' || d::date, ',' order by d, r.id collate "C"))
   from generate_series(date '2026-10-01', date '2026-10-01' + 119, interval '1 day') as d
   cross join public.routes r
   where private.route_runs_on(r.id, d::date)),
  '3af1088629e8c1e0ca8f5dbac22c98bc',
  'route_runs_on gives the same collection calendar as the app');
-- Every street the driver app can show (driverStreets) is accepted by street_key_ok.
select pg_temp.eq(
  (select md5(string_agg(x.k, ',' order by x.k collate "C"))
   from (select distinct s.route_id || '>' || s.barangay_id || '|' || coalesce(s.name, s.id) as k
         from public.route_segments s
         join public.route_barangays rb
           on rb.route_id = s.route_id and rb.barangay_id = s.barangay_id
         where s.collect) as x),
  '2bc93f859ae6a8d5695d47690e45c7b8',
  'the street keys the database accepts are the app''s');
select pg_temp.eq(
  (select count(*)::int
   from (select distinct s.route_id, s.barangay_id || '|' || coalesce(s.name, s.id) as k
         from public.route_segments s
         join public.route_barangays rb
           on rb.route_id = s.route_id and rb.barangay_id = s.barangay_id
         where s.collect) as x
   where not private.street_key_ok(x.route_id, x.k)),
  0, 'street_key_ok accepts each of them');
select pg_temp.ok(not private.street_key_ok('r-lantic', 'milagrosa|J. M. Loyola Street'),
                  'street_key_ok refuses a street of another route');

-- ---------- Geometry ----------
select pg_temp.eq(
  (select count(*)::int from public.barangays b where not extensions.st_isvalid(b.geom)),
  0, 'every barangay boundary is a valid shape');
select pg_temp.eq(
  (select count(*)::int from public.barangays b
   where private.barangay_at(b.label_point) is distinct from b.id),
  0, 'each barangay''s label point is found inside that barangay');
-- The OpenStreetMap boundaries overlap in thin slivers along shared borders (the largest is
-- about 520 square metres). A point in a sliver goes to the first barangay by id, which is
-- also what the app's barangayAt does.
select pg_temp.eq(
  (select count(*)::int
   from public.barangays a
   join public.barangays b on a.id < b.id
   cross join lateral (
     select extensions.st_area(extensions.st_intersection(a.geom, b.geom)::extensions.geography) as m2
   ) as o
   where o.m2 > 1000
      or o.m2 > 0.03 * least(extensions.st_area(a.geom::extensions.geography),
                             extensions.st_area(b.geom::extensions.geography))),
  0, 'barangay overlaps are slivers: under 1,000 square metres and under 3% of the smaller one');
select pg_temp.eq(
  (select private.barangay_at(
            extensions.st_pointonsurface(extensions.st_intersection(a.geom, b.geom)))
   from public.barangays a, public.barangays b
   where a.id = 'brgy-6' and b.id = 'brgy-8'),
  'brgy-6', 'a point in an overlap goes to the first barangay by id');
-- Lengths come from the app's data build; the geometry is the simplified line.
select pg_temp.eq(
  (select count(*)::int
   from public.route_segments s
   where abs(extensions.st_length(s.geom::extensions.geography) - s.length_m)
         > greatest(3, s.length_m * 0.02)),
  0, 'each segment''s stated length is within 2% (or 3 m) of its measured length');
select pg_temp.eq(private.barangay_at(private.make_point(121.04384, 14.30479)), 'milagrosa',
                  'a point in Milagrosa is placed in Milagrosa');
select pg_temp.eq(private.barangay_at(private.make_point(121.2, 14.6)), null,
                  'a point outside the city is in no barangay');

-- ---------- Sample tickets, rebuilt by the database's own lifecycle ----------
select pg_temp.eq(
  (select string_agg(
     right(t.id, 6)::integer || ':' || t.status || ':' || t.barangay_id || ':'
     || coalesce(t.dispatch_mode, '') || ':' || coalesce(t.dispatch_truck_id, '') || ':'
     || coalesce(t.rating::text, '') || ':'
     || (select count(*) from public.ticket_events e where e.ticket_id = t.id) || ':'
     || (select count(*) from public.ticket_photos p where p.ticket_id = t.id),
     ',' order by t.id)
   from public.tickets t
   where t.is_sample),
  '101:verified:milagrosa::::1:2,102:submitted:brgy-3::::0:1,'
  || '103:scheduled:maduya:special_pickup:t4::1:1,104:submitted:lantic::::0:1,'
  || '105:scheduled:bancal:next_schedule:t1::1:1,106:collected:mabuhay:add_to_route:t3::4:3,'
  || '107:closed:cabilang-baybay:special_pickup:t2:5:4:3,108:submitted:brgy-3::::0:1,'
  || '109:verified:brgy-8::::1:1,110:collected:milagrosa:special_pickup:t2::2:3,'
  || '111:collected:milagrosa:special_pickup:t2::2:3,112:rejected:brgy-4::::1:1',
  'the 12 sample tickets end in the same state as in the app');
select pg_temp.eq(
  (select count(*)::int from public.tickets t
   where private.barangay_at(t.location) is distinct from t.barangay_id),
  0, 'every ticket is filed under the barangay its location is in');
select pg_temp.eq(
  (select count(*)::int from public.tickets t
   where t.is_sample and t.source <> 'resident'),
  0, 'sample tickets read as resident reports');
select pg_temp.eq(
  (select count(*)::int from public.ticket_photos p where p.storage_path is not null),
  0, 'sample tickets use bundled sample pictures, not uploaded files');
select pg_temp.eq(
  (select c.last_seq from private.ticket_counters c
   where c.year = extract(year from private.app_now() at time zone 'Asia/Manila')),
  112, 'the next real ticket number follows the samples (000113)');

select pg_temp.finish();
