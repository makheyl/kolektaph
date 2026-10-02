-- KolektaPH pilot database · 6 of 8 · reports
--
-- Tickets, the actions taken on them, and their photos. The lifecycle is the one in
-- src/features/reports/lifecycle.ts (HAKOT Figure 4):
--
--   submitted -> verified -> scheduled -> in_progress -> collected -> closed
--                  \-> merged (duplicate) · rejected (reason) · closed (education notice)
--   collected -> scheduled again when the reporter reopens within 48 hours
--
-- Stored once, not twice: there is no "submitted" action (it is the ticket's created_at), no
-- stored auto-close (48 hours after collection is a rule), no status copied onto each action,
-- and a dispatch that also verifies is one action. Priority and suggestions are calculated.

-- ---------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------

create table public.tickets (
  id                 text primary key check (id ~ '^KPH-[0-9]{4}-[0-9]{6}$'),
  category           text not null
                       check (category in ('MISSED', 'OVERFLOW', 'DUMPING', 'WATERWAY', 'EVENT',
                                           'BULKY', 'DEBRIS', 'HAZARD', 'ANIMAL', 'BURNING')),
  size               text not null check (size in ('bags', 'pile', 'truckload')),
  location           extensions.geometry(Point, 4326) not null,
  accuracy_m         smallint check (accuracy_m between 0 and 5000),
  barangay_id        text not null references public.barangays (id),
  landmark           text check (landmark = btrim(landmark) and char_length(landmark) between 1 and 120),
  near_waterway      boolean not null default false,
  near_sensitive     boolean not null default false,
  note               text check (note = btrim(note) and char_length(note) between 1 and 280),
  notify             boolean not null default false,
  reporter_id        uuid references auth.users (id) on delete set null,
  created_by_staff   uuid references public.staff (user_id),
  client_ref         uuid,
  created_at         timestamptz not null,
  status             text not null default 'submitted'
                       check (status in ('submitted', 'verified', 'scheduled', 'in_progress',
                                         'collected', 'closed', 'merged', 'rejected')),
  dispatch_mode      text check (dispatch_mode in ('add_to_route', 'special_pickup', 'next_schedule')),
  dispatch_truck_id  text references public.trucks (id),
  dispatch_due       timestamptz,
  merged_into        text references public.tickets (id),
  rating             smallint check (rating between 1 and 5),
  missed_route_id    text references public.routes (id),
  missed_street_key  text check (missed_street_key ~ '^[a-z0-9-]{1,40}[|].{1,80}$'),
  missed_day         date,
  missed_basis       text
                       check (missed_basis in ('not_passed', 'no_gps', 'truck_full', 'road_blocked',
                                               'no_garbage', 'not_segregated', 'other')),
  is_sample          boolean not null default false,
  -- resident = Snap & Report; claim = "Hindi nadaanan"; enro = re-collection from the dashboard.
  source             text generated always as (
                       case
                         when created_by_staff is not null then 'enro'
                         when missed_day is not null then 'claim'
                         else 'resident'
                       end
                     ) stored,
  constraint tickets_one_creator check (reporter_id is null or created_by_staff is null),
  constraint tickets_sample_has_no_owner
    check (not is_sample or num_nonnulls(reporter_id, created_by_staff, client_ref) = 0),
  constraint tickets_client_ref_once unique (reporter_id, client_ref),
  constraint tickets_dispatch_matches_status check (
    case
      when status in ('submitted', 'verified', 'rejected', 'merged') then dispatch_mode is null
      when status in ('scheduled', 'in_progress', 'collected') then dispatch_mode is not null
      else true
    end
    and (dispatch_mode is not null or num_nonnulls(dispatch_truck_id, dispatch_due) = 0)
  ),
  constraint tickets_merge_matches_status
    check ((status = 'merged') = (merged_into is not null) and merged_into is distinct from id),
  constraint tickets_rating_needs_closed check (rating is null or status = 'closed'),
  constraint tickets_missed_details check (
    (missed_day is null) = (missed_route_id is null)
    and (missed_day is null) = (missed_basis is null)
    and (missed_street_key is null or missed_day is not null)
    and (missed_day is null or category = 'MISSED')
  )
);
comment on table public.tickets is
  'A report. The id is issued by the server. barangay_id is worked out by the server from the location. status is the last recorded status; a collected ticket counts as closed 48 hours after its collection.';
comment on column public.tickets.notify is
  'The reporter asked for status texts. The number itself stays in the text-alert sign-up; it is not copied here.';
comment on column public.tickets.client_ref is
  'Made on the device for each report, so sending the same report twice returns the same ticket.';

-- A missed-collection ticket exists once per street per day, whoever asks for it.
create unique index tickets_one_missed_per_street_day
  on public.tickets (barangay_id, missed_day, missed_street_key) nulls not distinct
  where missed_day is not null;
create index tickets_created_at_idx on public.tickets (created_at);
create index tickets_dispatch_truck_idx on public.tickets (dispatch_truck_id)
  where status in ('scheduled', 'in_progress');

create table public.ticket_events (
  id               bigint generated always as identity primary key,
  ticket_id        text not null references public.tickets (id) on delete cascade,
  kind             text not null
                     check (kind in ('verified', 'dispatched', 'started', 'collected', 'education',
                                     'rejected', 'merged', 'reopened', 'rated')),
  at               timestamptz not null,
  actor            text not null check (actor in ('resident', 'enro', 'driver', 'system')),
  staff_id         uuid references public.staff (user_id),
  truck_id         text references public.trucks (id),
  note             text check (note = btrim(note) and char_length(note) between 1 and 280),
  client_event_id  text unique check (client_event_id ~ '^[A-Za-z0-9|_.:-]{8,80}$'),
  -- Who may do what (the same table as RULES in lifecycle.ts).
  constraint ticket_events_actor_allowed check (
    case kind
      when 'verified' then actor in ('enro', 'system')
      when 'dispatched' then actor = 'enro'
      when 'started' then actor in ('driver', 'enro')
      when 'collected' then actor in ('driver', 'enro')
      when 'education' then actor = 'enro'
      when 'rejected' then actor = 'enro'
      when 'merged' then actor = 'enro'
      when 'reopened' then actor = 'resident'
      when 'rated' then actor = 'resident'
      else false
    end
  ),
  constraint ticket_events_actor_ids check (
    (staff_id is null or actor = 'enro')
    and (actor = 'driver') = (truck_id is not null)
    and (client_event_id is null or actor = 'driver')
  ),
  constraint ticket_events_note_rules check (
    (note is null or kind in ('education', 'rejected', 'reopened'))
    and (kind <> 'rejected' or note is not null)
  ),
  -- Lets ticket_photos prove that its action belongs to its ticket.
  unique (id, ticket_id)
);
comment on table public.ticket_events is
  'One action taken on a ticket, with when and by whom. The resulting status follows from the kind. client_event_id is the id a driver phone gave the tap, so a repeated upload is harmless.';
create index ticket_events_ticket_idx on public.ticket_events (ticket_id, at, id);

create table public.ticket_photos (
  id            bigint generated always as identity primary key,
  ticket_id     text not null references public.tickets (id) on delete cascade,
  event_id      bigint,
  slot          text not null check (slot in ('wide', 'close', 'before', 'after')),
  storage_path  text unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$'),
  sample_id     text
                  check (sample_id in ('overflow', 'dumping', 'waterway', 'event', 'bulky', 'animal',
                                       'hazard', 'debris', 'street', 'clean')),
  foreign key (event_id, ticket_id) references public.ticket_events (id, ticket_id) on delete cascade,
  -- A photo is either a file in the report-photos bucket or one of the bundled sample pictures.
  constraint ticket_photos_one_source check (num_nonnulls(storage_path, sample_id) = 1),
  -- The reporter's photos (wide, close) belong to the ticket; proof photos (before, after)
  -- belong to the "collected" action that produced them.
  constraint ticket_photos_slot_matches_owner check ((slot in ('wide', 'close')) = (event_id is null)),
  constraint ticket_photos_one_per_slot unique nulls not distinct (ticket_id, event_id, slot)
);

create table private.ticket_counters (
  year      smallint primary key check (year between 2020 and 2100),
  last_seq  integer not null check (last_seq between 0 and 999999)
);
comment on table private.ticket_counters is
  'The last ticket number issued in a year. Updated in the same transaction as the ticket, so numbers have no gaps.';

-- ---------------------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------------------

alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.ticket_photos enable row level security;
alter table private.ticket_counters enable row level security;

-- Without sign-in: only the sample tickets shipped with the prototype.
create policy tickets_read_public on public.tickets for select to anon using (is_sample);
-- Signed in: your own reports; staff by role; a truck's phone sees what is dispatched to it.
create policy tickets_read on public.tickets for select to authenticated
  using (
    is_sample
    or reporter_id = (select auth.uid())
    or (select private.staff_role()) in ('admin', 'dispatcher', 'viewer')
    or ((select private.staff_role()) = 'barangay'
        and barangay_id = (select private.staff_barangay()))
    or (dispatch_truck_id = (select private.my_truck())
        and status in ('scheduled', 'in_progress', 'collected'))
  );
-- Actions and photos are visible exactly when their ticket is.
create policy ticket_events_read on public.ticket_events for select to anon, authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_events.ticket_id));
create policy ticket_photos_read on public.ticket_photos for select to anon, authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_photos.ticket_id));

-- Who reported, who acted and the device's reference are not readable through the API.
grant select (id, category, size, location, accuracy_m, barangay_id, landmark, near_waterway,
              near_sensitive, note, notify, created_at, status, dispatch_mode, dispatch_truck_id,
              dispatch_due, merged_into, rating, missed_route_id, missed_street_key, missed_day,
              missed_basis, is_sample, source)
  on public.tickets to anon, authenticated;
grant select (id, ticket_id, kind, at, actor, truck_id, note, client_event_id)
  on public.ticket_events to anon, authenticated;
grant select on public.ticket_photos to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Photo storage: one private bucket, JPEG only, 1 MB each
-- ---------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- At most 40 uploads per identity in 24 hours, counted from the files themselves.
create function private.upload_quota_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (select count(*)
          from storage.objects o
          where o.bucket_id = 'report-photos'
            and o.owner_id = (select auth.uid())::text
            and o.created_at > now() - interval '24 hours') < 40;
$$;

create function private.photo_attached(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ticket_photos p where p.storage_path = p_name);
$$;

grant execute on function private.upload_quota_ok() to authenticated;
grant execute on function private.photo_attached(text) to authenticated;

-- A device writes only into its own folder: "<identity>/<uuid>.jpg".
create policy report_photos_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.]jpg$')
    and (select private.upload_quota_ok())
  );
-- Reading follows ticket visibility; before a photo is attached only its uploader sees it.
create policy report_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'report-photos'
    and (
      owner_id = (select auth.uid())::text
      or exists (select 1 from public.ticket_photos p where p.storage_path = objects.name)
    )
  );
-- An uploader may remove a photo that was never attached; an admin may remove any.
create policy report_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-photos'
    and (
      (owner_id = (select auth.uid())::text and not private.photo_attached(name))
      or (select private.staff_role()) = 'admin'
    )
  );

-- ---------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------

create function private.next_ticket_id(p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year smallint := extract(year from p_at at time zone 'Asia/Manila')::smallint;
  v_seq integer;
begin
  insert into private.ticket_counters as c (year, last_seq)
  values (v_year, 1)
  on conflict (year) do update set last_seq = c.last_seq + 1
  returning c.last_seq into v_seq;
  return 'KPH-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');
end;
$$;

-- A point from device coordinates, kept to 6 decimals (about 0.1 m).
create function private.make_point(p_lng double precision, p_lat double precision)
returns extensions.geometry
language plpgsql
set search_path = ''
as $$
begin
  if p_lng is null or p_lat is null
     or p_lng not between -180 and 180 or p_lat not between -90 and 90 then
    perform private.fail('bad_location');
  end if;
  return extensions.st_setsrid(
    extensions.st_makepoint(round(p_lng::numeric, 6)::double precision,
                            round(p_lat::numeric, 6)::double precision),
    4326
  );
end;
$$;

-- The barangay a point is in (same rule as barangayAt in src/lib/geo.ts), or null.
create function private.barangay_at(p_point extensions.geometry)
returns text
language sql
stable
set search_path = ''
as $$
  select b.id
  from public.barangays b
  where extensions.st_covers(b.geom, p_point)
  order by b.id
  limit 1;
$$;

-- Attaches one photo: {"path": "<identity>/<uuid>.jpg"} for an uploaded file, which must have
-- been uploaded by p_owner and not be used anywhere else, or {"sample": "<id>"}.
create function private.attach_photo(
  p_ticket_id text, p_event_id bigint, p_slot text, p_photo jsonb, p_owner uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := p_photo ->> 'path';
  v_sample text := p_photo ->> 'sample';
begin
  if (v_path is null) = (v_sample is null) then
    perform private.fail('bad_photo');
  end if;

  if v_sample is not null then
    if v_sample not in ('overflow', 'dumping', 'waterway', 'event', 'bulky', 'animal', 'hazard',
                        'debris', 'street', 'clean') then
      perform private.fail('bad_photo');
    end if;
    insert into public.ticket_photos (ticket_id, event_id, slot, sample_id)
    values (p_ticket_id, p_event_id, p_slot, v_sample);
    return;
  end if;

  if p_owner is null or v_path !~ ('^' || p_owner::text || '/[0-9a-f-]{36}[.]jpg$') then
    perform private.fail('photo_not_yours', 403);
  end if;
  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'report-photos' and o.name = v_path and o.owner_id = p_owner::text
  ) then
    perform private.fail('photo_not_uploaded', 409);
  end if;
  begin
    insert into public.ticket_photos (ticket_id, event_id, slot, storage_path)
    values (p_ticket_id, p_event_id, p_slot, v_path);
  exception when unique_violation then
    perform private.fail('photo_already_used', 409);
  end;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The lifecycle: the only code that changes a ticket
-- ---------------------------------------------------------------------------------------

-- p_actor_id is the staff member for 'enro'; for 'driver' and 'resident' it is the caller's
-- identity (the owner of any photo passed in). p_args carries what the action needs:
--   dispatch {mode, truck_id, due} · collect {after, before} · education {note}
--   reject {note} · merge {into} · reopen {note} · rate {stars}
create function private.ticket_apply(
  p_ticket_id text, p_action text, p_actor text, p_at timestamptz,
  p_actor_id uuid, p_truck_id text, p_args jsonb, p_client_event_id text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tickets;
  v_kind text;
  v_status text;
  v_note text := nullif(btrim(coalesce(p_args ->> 'note', '')), '');
  v_mode text;
  v_truck text;
  v_due timestamptz;
  v_into text;
  v_stars integer;
  v_collected_at timestamptz;
  v_event_id bigint;
begin
  select t.* into v_t from public.tickets t where t.id = p_ticket_id for update;
  if not found then
    perform private.fail('unknown_ticket', 404);
  end if;

  case p_action
    when 'verify' then
      if v_t.status <> 'submitted' or p_actor not in ('enro', 'system') then
        perform private.fail('invalid_transition', 409);
      end if;
      v_kind := 'verified'; v_status := 'verified'; v_note := null;

    when 'dispatch' then
      -- Dispatching an unverified ticket verifies it on the way: one decision, one action.
      if v_t.status not in ('submitted', 'verified') or p_actor <> 'enro' then
        perform private.fail('invalid_transition', 409);
      end if;
      v_mode := p_args ->> 'mode';
      v_truck := p_args ->> 'truck_id';
      v_due := (p_args ->> 'due')::timestamptz;
      if v_mode is null or v_mode not in ('add_to_route', 'special_pickup', 'next_schedule') then
        perform private.fail('bad_mode');
      end if;
      if v_truck is not null and not exists (select 1 from public.trucks k where k.id = v_truck) then
        perform private.fail('unknown_truck', 404);
      end if;
      v_kind := 'dispatched'; v_status := 'scheduled'; v_note := null;

    when 'start' then
      if v_t.status <> 'scheduled' or p_actor not in ('driver', 'enro') then
        perform private.fail('invalid_transition', 409);
      end if;
      v_kind := 'started'; v_status := 'in_progress'; v_note := null;

    when 'collect' then
      if v_t.status not in ('scheduled', 'in_progress') or p_actor not in ('driver', 'enro') then
        perform private.fail('invalid_transition', 409);
      end if;
      if jsonb_typeof(p_args -> 'after') is distinct from 'object' then
        perform private.fail('after_photo_required');
      end if;
      v_kind := 'collected'; v_status := 'collected'; v_note := null;

    when 'education' then
      if v_t.status not in ('submitted', 'verified') or p_actor <> 'enro' then
        perform private.fail('invalid_transition', 409);
      end if;
      v_kind := 'education'; v_status := 'closed';

    when 'reject' then
      if v_t.status not in ('submitted', 'verified') or p_actor <> 'enro' then
        perform private.fail('invalid_transition', 409);
      end if;
      if v_note is null then
        perform private.fail('reason_required');
      end if;
      v_kind := 'rejected'; v_status := 'rejected';

    when 'merge' then
      if v_t.status not in ('submitted', 'verified') or p_actor <> 'enro' then
        perform private.fail('invalid_transition', 409);
      end if;
      v_into := p_args ->> 'into';
      if v_into is null or v_into = v_t.id or not exists (
        select 1 from public.tickets x where x.id = v_into and x.status <> 'merged'
      ) then
        perform private.fail('bad_merge_target');
      end if;
      v_kind := 'merged'; v_status := 'merged'; v_note := null;

    when 'reopen' then
      if v_t.status <> 'collected' or p_actor <> 'resident' then
        perform private.fail('invalid_transition', 409);
      end if;
      select max(e.at) into v_collected_at
      from public.ticket_events e
      where e.ticket_id = v_t.id and e.kind = 'collected';
      if v_collected_at is null or p_at - v_collected_at > interval '48 hours' then
        perform private.fail('reopen_window_closed', 409);
      end if;
      v_kind := 'reopened'; v_status := 'scheduled';

    when 'rate' then
      -- A collected ticket is rated and closed; one that closed on its own can still be rated.
      if v_t.status not in ('collected', 'closed') or p_actor <> 'resident'
         or v_t.rating is not null then
        perform private.fail('invalid_transition', 409);
      end if;
      v_stars := (p_args ->> 'stars')::integer;
      if v_stars is null or v_stars not between 1 and 5 then
        perform private.fail('bad_stars');
      end if;
      v_kind := 'rated'; v_status := 'closed'; v_note := null;

    else
      perform private.fail('bad_action');
  end case;

  if char_length(v_note) > 280 then
    perform private.fail('note_too_long');
  end if;

  insert into public.ticket_events
    (ticket_id, kind, at, actor, staff_id, truck_id, note, client_event_id)
  values (
    v_t.id, v_kind, p_at, p_actor,
    case when p_actor = 'enro' then p_actor_id end,
    case when p_actor = 'driver' then p_truck_id end,
    v_note, p_client_event_id
  )
  returning id into v_event_id;

  update public.tickets t
     set status = v_status,
         dispatch_mode = case when p_action = 'dispatch' then v_mode else t.dispatch_mode end,
         dispatch_truck_id = case when p_action = 'dispatch' then v_truck else t.dispatch_truck_id end,
         dispatch_due = case when p_action = 'dispatch' then v_due else t.dispatch_due end,
         merged_into = case when p_action = 'merge' then v_into else t.merged_into end,
         rating = case when p_action = 'rate' then v_stars else t.rating end
   where t.id = v_t.id;

  if p_action = 'collect' then
    if jsonb_typeof(p_args -> 'before') = 'object' then
      perform private.attach_photo(v_t.id, v_event_id, 'before', p_args -> 'before', p_actor_id);
    end if;
    perform private.attach_photo(v_t.id, v_event_id, 'after', p_args -> 'after', p_actor_id);
  end if;

  return v_event_id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Entry points: residents
-- ---------------------------------------------------------------------------------------

-- Returns the ticket id. p_photos: [] or [{"slot": "wide", ...}] or wide + close, each with
-- "path" or "sample" (see attach_photo).
create function private.report_submit(
  p_client_ref uuid, p_category text, p_size text,
  p_lng double precision, p_lat double precision, p_accuracy_m double precision,
  p_landmark text, p_near_waterway boolean, p_near_sensitive boolean,
  p_note text, p_notify boolean, p_photos jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_now timestamptz := private.app_now();
  v_id text;
  v_point extensions.geometry;
  v_barangay text;
  v_landmark text := nullif(btrim(coalesce(p_landmark, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
  v_slots text[];
  v_hour integer;
  v_day integer;
  v_photo jsonb;
begin
  if p_client_ref is null then
    perform private.fail('bad_client_ref');
  end if;
  -- The same report sent again (a retry after a lost reply): same ticket, nothing new.
  select t.id into v_id
  from public.tickets t
  where t.reporter_id = v_uid and t.client_ref = p_client_ref;
  if found then
    return v_id;
  end if;

  if p_category is null
     or p_category not in ('MISSED', 'OVERFLOW', 'DUMPING', 'WATERWAY', 'EVENT', 'BULKY',
                           'DEBRIS', 'HAZARD', 'ANIMAL', 'BURNING') then
    perform private.fail('bad_category');
  end if;
  if p_size is null or p_size not in ('bags', 'pile', 'truckload') then
    perform private.fail('bad_size');
  end if;
  if char_length(v_landmark) > 120 or char_length(v_note) > 280 then
    perform private.fail('too_long', 400, 'A landmark is up to 120 characters and a note up to 280.');
  end if;

  v_point := private.make_point(p_lng, p_lat);
  v_barangay := private.barangay_at(v_point);
  if v_barangay is null then
    perform private.fail('outside_city', 422, 'The location is not inside a barangay of the city.');
  end if;

  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 2 then
    perform private.fail('bad_photos');
  end if;
  select array_agg(x ->> 'slot' order by x ->> 'slot' desc) into v_slots
  from jsonb_array_elements(v_photos) as x;
  -- Allowed: no photo, a wide shot, or a wide shot and a close-up.
  if v_slots is not null and v_slots <> array['wide'] and v_slots <> array['wide', 'close'] then
    perform private.fail('bad_photos');
  end if;

  -- Limits are counted from the reports themselves; no request log is kept.
  select count(*) filter (where t.created_at > v_now - interval '1 hour'), count(*)
    into v_hour, v_day
  from public.tickets t
  where t.reporter_id = v_uid and t.created_at > v_now - interval '24 hours';
  if v_hour >= 5 or v_day >= 15 then
    perform private.fail('rate_limited', 429, 'Up to 5 reports an hour and 15 a day per device.');
  end if;
  if (select count(*) from public.tickets t
      where t.reporter_id is not null and t.created_at > v_now - interval '1 hour') >= 300 then
    perform private.fail('busy', 503);
  end if;

  begin
    v_id := private.next_ticket_id(v_now);
    insert into public.tickets
      (id, category, size, location, accuracy_m, barangay_id, landmark, near_waterway,
       near_sensitive, note, notify, reporter_id, client_ref, created_at)
    values (
      v_id, p_category, p_size, v_point,
      case when p_accuracy_m between 0 and 5000 then round(p_accuracy_m)::smallint end,
      v_barangay, v_landmark, coalesce(p_near_waterway, false), coalesce(p_near_sensitive, false),
      v_note,
      coalesce(p_notify, false)
        and exists (select 1 from private.sms_subscriptions s where s.user_id = v_uid),
      v_uid, p_client_ref, v_now
    );
  exception when unique_violation then
    -- The same report arrived twice at the same moment.
    select t.id into v_id
    from public.tickets t
    where t.reporter_id = v_uid and t.client_ref = p_client_ref;
    return v_id;
  end;

  for v_photo in select x from jsonb_array_elements(v_photos) as x loop
    perform private.attach_photo(v_id, null, v_photo ->> 'slot', v_photo, v_uid);
  end loop;

  return v_id;
end;
$$;

-- "Hindi nadaanan ang kalye namin". The device works out the verdict (p_basis); the server
-- files one ticket per street per day and marks it verified only when the crew's own log
-- proves it. Returns {"ticket_id", "created", "verified"}.
create function private.claim_missed(
  p_barangay_id text, p_route_id text, p_street_key text,
  p_lng double precision, p_lat double precision, p_basis text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_now timestamptz := private.app_now();
  v_day date := private.today();
  v_from timestamptz := v_day::timestamp at time zone 'Asia/Manila';
  v_start time;
  v_id text;
  v_point extensions.geometry;
  v_proven boolean;
  v_created boolean := false;
begin
  if p_basis is null or p_basis not in ('not_passed', 'no_gps', 'truck_full', 'road_blocked') then
    perform private.fail('bad_basis');
  end if;
  if not exists (
    select 1 from public.route_barangays rb
    where rb.route_id = p_route_id and rb.barangay_id = p_barangay_id
  ) then
    perform private.fail('bad_route');
  end if;
  if not private.route_runs_on(p_route_id, v_day) then
    perform private.fail('no_collection_today', 409);
  end if;
  select s.start_time into v_start
  from public.route_schedules s
  where s.route_id = p_route_id and (s.valid_from is null or s.valid_from <= v_day)
  order by s.valid_from desc nulls last
  limit 1;
  if v_now < (v_day + v_start) at time zone 'Asia/Manila' then
    perform private.fail('too_early', 409, 'Today''s collection has not started yet.');
  end if;
  if p_street_key is not null
     and (split_part(p_street_key, '|', 1) <> p_barangay_id
          or not private.street_key_ok(p_route_id, p_street_key)) then
    perform private.fail('bad_street');
  end if;

  select t.id into v_id
  from public.tickets t
  where t.barangay_id = p_barangay_id
    and t.missed_day = v_day
    and t.missed_street_key is not distinct from p_street_key;

  if not found then
    if (select count(*) from public.tickets t
        where t.reporter_id = v_uid and t.missed_day = v_day) >= 3 then
      perform private.fail('rate_limited', 429, 'Up to 3 missed-street claims a day per device.');
    end if;

    if p_lng is not null or p_lat is not null then
      v_point := private.make_point(p_lng, p_lat);
      if not exists (
        select 1 from public.barangays b
        where b.id = p_barangay_id and extensions.st_covers(b.geom, v_point)
      ) then
        perform private.fail('outside_barangay', 422);
      end if;
    else
      -- No point given: where the street starts, or the barangay's label point.
      select extensions.st_startpoint(s.geom) into v_point
      from public.route_segments s
      where s.route_id = p_route_id
        and s.collect
        and p_street_key = s.barangay_id || '|' || coalesce(s.name, s.id)
      order by s.seq
      limit 1;
      if v_point is null then
        select b.label_point into v_point from public.barangays b where b.id = p_barangay_id;
      end if;
    end if;

    begin
      v_id := private.next_ticket_id(v_now);
      insert into public.tickets
        (id, category, size, location, barangay_id, reporter_id, created_at,
         missed_route_id, missed_street_key, missed_day, missed_basis)
      values (v_id, 'MISSED', 'bags', v_point, p_barangay_id, v_uid, v_now,
              p_route_id, p_street_key, v_day, p_basis);
      v_created := true;
    exception when unique_violation then
      -- Someone else claimed the same street at the same moment: share their ticket.
      select t.id into v_id
      from public.tickets t
      where t.barangay_id = p_barangay_id
        and t.missed_day = v_day
        and t.missed_street_key is not distinct from p_street_key;
    end;
  end if;

  if v_created and p_basis in ('truck_full', 'road_blocked') then
    -- Provable from what the crew entered today on this route: the street logged as skipped
    -- for that reason, or (for a full truck) the truck reported FULL.
    select exists (
      select 1
      from public.truck_events e
      join public.shifts s on s.id = e.shift_id
      where s.route_id = p_route_id
        and e.at >= v_from and e.at < v_from + interval '1 day'
        and (
          (e.kind = 'street' and e.street_key = p_street_key
           and e.street_outcome = 'skipped' and e.skip_reason = p_basis)
          or (p_basis = 'truck_full' and e.kind = 'status' and e.status = 'full')
        )
    ) into v_proven;
    if v_proven then
      perform private.ticket_apply(v_id, 'verify', 'system', v_now, null, null, '{}'::jsonb, null);
    end if;
  end if;

  return jsonb_build_object(
    'ticket_id', v_id,
    'created', v_created,
    'verified', (select t.status <> 'submitted' from public.tickets t where t.id = v_id)
  );
end;
$$;

-- Reopen and rate are for the reporter; the other actions are for dispatchers and admins.
create function private.ticket_act(p_ticket_id text, p_action text, p_args jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_now timestamptz := private.app_now();
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if p_action in ('verify', 'dispatch', 'collect', 'education', 'reject', 'merge') then
    perform private.require_staff('admin', 'dispatcher');
    perform private.ticket_apply(p_ticket_id, p_action, 'enro', v_now, v_uid, null, v_args, null);
  elsif p_action in ('reopen', 'rate') then
    if not exists (
      select 1 from public.tickets t where t.id = p_ticket_id and t.reporter_id = v_uid
    ) then
      perform private.fail('unknown_ticket', 404);
    end if;
    perform private.ticket_apply(p_ticket_id, p_action, 'resident', v_now, v_uid, null, v_args, null);
  else
    perform private.fail('bad_action');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Entry points: staff
-- ---------------------------------------------------------------------------------------

-- "Iskedyul ang muling pagkolekta" for a missed street: the same single ticket per street per
-- day, verified by the staff member. Returns the ticket id.
create function private.recollection_create(
  p_route_id text, p_street_key text, p_day date, p_basis text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := private.require_staff('admin', 'dispatcher');
  v_now timestamptz := private.app_now();
  v_today date := private.today();
  v_barangay text := split_part(coalesce(p_street_key, ''), '|', 1);
  v_id text;
  v_status text;
  v_point extensions.geometry;
begin
  if p_basis is null
     or p_basis not in ('not_passed', 'truck_full', 'road_blocked', 'no_garbage',
                        'not_segregated', 'other') then
    perform private.fail('bad_basis');
  end if;
  if p_day is null or p_day > v_today or p_day < v_today - 14 then
    perform private.fail('bad_day', 400, 'The day must be within the last 14 days.');
  end if;
  if p_street_key is null or not private.street_key_ok(p_route_id, p_street_key) then
    perform private.fail('bad_street');
  end if;
  if not private.route_runs_on(p_route_id, p_day) then
    perform private.fail('no_collection_that_day', 409);
  end if;

  select t.id, t.status into v_id, v_status
  from public.tickets t
  where t.barangay_id = v_barangay and t.missed_day = p_day and t.missed_street_key = p_street_key;

  if not found then
    select extensions.st_startpoint(s.geom) into v_point
    from public.route_segments s
    where s.route_id = p_route_id
      and s.collect
      and p_street_key = s.barangay_id || '|' || coalesce(s.name, s.id)
    order by s.seq
    limit 1;
    begin
      v_id := private.next_ticket_id(v_now);
      insert into public.tickets
        (id, category, size, location, barangay_id, created_by_staff, created_at,
         missed_route_id, missed_street_key, missed_day, missed_basis)
      values (v_id, 'MISSED', 'bags', v_point, v_barangay, v_staff, v_now,
              p_route_id, p_street_key, p_day, p_basis);
      v_status := 'submitted';
    exception when unique_violation then
      select t.id, t.status into v_id, v_status
      from public.tickets t
      where t.barangay_id = v_barangay and t.missed_day = p_day
        and t.missed_street_key = p_street_key;
    end;
  end if;

  if v_status = 'submitted' then
    perform private.ticket_apply(v_id, 'verify', 'enro', v_now, v_staff, null, '{}'::jsonb, null);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The API surface
-- ---------------------------------------------------------------------------------------

create function public.report_submit(
  p_client_ref uuid, p_category text, p_size text,
  p_lng double precision, p_lat double precision, p_accuracy_m double precision default null,
  p_landmark text default null, p_near_waterway boolean default false,
  p_near_sensitive boolean default false, p_note text default null,
  p_notify boolean default false, p_photos jsonb default '[]'::jsonb
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.report_submit(p_client_ref, p_category, p_size, p_lng, p_lat, p_accuracy_m,
                               p_landmark, p_near_waterway, p_near_sensitive, p_note, p_notify,
                               p_photos);
$$;

create function public.claim_missed(
  p_barangay_id text, p_route_id text, p_street_key text,
  p_lng double precision, p_lat double precision, p_basis text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.claim_missed(p_barangay_id, p_route_id, p_street_key, p_lng, p_lat, p_basis);
$$;

create function public.ticket_reopen(p_ticket_id text, p_note text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.ticket_act(p_ticket_id, 'reopen', jsonb_build_object('note', p_note));
$$;

create function public.ticket_rate(p_ticket_id text, p_stars integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.ticket_act(p_ticket_id, 'rate', jsonb_build_object('stars', p_stars));
$$;

create function public.ticket_verify(p_ticket_id text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.ticket_act(p_ticket_id, 'verify', '{}'::jsonb);
$$;

create function public.ticket_dispatch(
  p_ticket_id text, p_mode text, p_truck_id text default null, p_due timestamptz default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.ticket_act(
    p_ticket_id, 'dispatch',
    jsonb_build_object('mode', p_mode, 'truck_id', p_truck_id, 'due', p_due)
  );
$$;

create function public.ticket_collect(p_ticket_id text, p_after jsonb, p_before jsonb default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.ticket_act(
    p_ticket_id, 'collect', jsonb_build_object('after', p_after, 'before', p_before)
  );
$$;

create function public.ticket_educate(p_ticket_id text, p_note text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.ticket_act(p_ticket_id, 'education', jsonb_build_object('note', p_note));
$$;

create function public.ticket_reject(p_ticket_id text, p_reason text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.ticket_act(p_ticket_id, 'reject', jsonb_build_object('note', p_reason));
$$;

create function public.ticket_merge(p_ticket_id text, p_into text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.ticket_act(p_ticket_id, 'merge', jsonb_build_object('into', p_into));
$$;

create function public.recollection_create(
  p_route_id text, p_street_key text, p_day date, p_basis text
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.recollection_create(p_route_id, p_street_key, p_day, p_basis);
$$;

grant execute on function private.report_submit(uuid, text, text, double precision,
  double precision, double precision, text, boolean, boolean, text, boolean, jsonb) to authenticated;
grant execute on function public.report_submit(uuid, text, text, double precision,
  double precision, double precision, text, boolean, boolean, text, boolean, jsonb) to authenticated;
grant execute on function private.claim_missed(text, text, text, double precision,
  double precision, text) to authenticated;
grant execute on function public.claim_missed(text, text, text, double precision,
  double precision, text) to authenticated;
grant execute on function private.ticket_act(text, text, jsonb) to authenticated;
grant execute on function public.ticket_reopen(text, text) to authenticated;
grant execute on function public.ticket_rate(text, integer) to authenticated;
grant execute on function public.ticket_verify(text) to authenticated;
grant execute on function public.ticket_dispatch(text, text, text, timestamptz) to authenticated;
grant execute on function public.ticket_collect(text, jsonb, jsonb) to authenticated;
grant execute on function public.ticket_educate(text, text) to authenticated;
grant execute on function public.ticket_reject(text, text) to authenticated;
grant execute on function public.ticket_merge(text, text) to authenticated;
grant execute on function private.recollection_create(text, text, date, text) to authenticated;
grant execute on function public.recollection_create(text, text, date, text) to authenticated;
