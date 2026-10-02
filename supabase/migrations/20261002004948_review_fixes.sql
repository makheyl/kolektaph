-- KolektaPH pilot database · follow-up 1 · changes from the test and advisor review

-- 1. A point on a shared border can lie in two barangays: the OpenStreetMap boundaries overlap
--    in thin slivers. Take the first by id in plain byte order, whatever the database's
--    collation is, which is what the app's barangayAt does.
create or replace function private.barangay_at(p_point extensions.geometry)
returns text
language sql
stable
set search_path = ''
as $$
  select b.id
  from public.barangays b
  where extensions.st_covers(b.geom, p_point)
  order by b.id collate "C"
  limit 1;
$$;

-- 2. A truck's phone reads the pickups it still has to do, not its whole history: a ticket
--    stays "collected" until it is rated, so the earlier rule let the list grow without end.
alter policy tickets_read on public.tickets
  using (
    is_sample
    or reporter_id = (select auth.uid())
    or (select private.staff_role()) in ('admin', 'dispatcher', 'viewer')
    or ((select private.staff_role()) = 'barangay'
        and barangay_id = (select private.staff_barangay()))
    or (dispatch_truck_id = (select private.my_truck())
        and status in ('scheduled', 'in_progress'))
  );

-- 3. Indexes only where a query needs one. Shifts and announcements grow by a few hundred rows
--    a year, so their time indexes cost more than they save. "The duplicates of this ticket"
--    is a real lookup, and its index holds only merged tickets.
drop index public.shifts_started_at_idx;
drop index public.announcements_sent_at_idx;
create index tickets_merged_into_idx on public.tickets (merged_into)
  where merged_into is not null;
