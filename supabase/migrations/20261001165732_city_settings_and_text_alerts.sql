-- KolektaPH pilot database · 5 of 8 · city settings and text alerts
--
-- What City ENRO staff enter (announcements, the SMS lead time, office contacts, decisions on
-- backup-truck suggestions, schedule changes) and what residents enter to get text alerts.
-- The automatic alerts themselves are calculated by the app and never stored.

-- ---------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------

create table private.sms_subscriptions (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  mobile       text not null unique check (mobile ~ '^[+]639[0-9]{9}$'),
  barangay_id  text not null references public.barangays (id),
  opted_in_at  timestamptz not null default now()
);
comment on table private.sms_subscriptions is
  'A mobile number signed up for text alerts, tied to the device identity that entered it. Deleted on opt-out. No API role can read it.';

create table public.announcements (
  id               integer generated always as identity primary key,
  client_ref       uuid not null unique,
  body             text not null check (body = btrim(body) and char_length(body) between 1 and 480),
  sent_at          timestamptz not null,
  sent_by          uuid not null references public.staff (user_id),
  recipient_count  integer not null check (recipient_count >= 0)
);
comment on table public.announcements is
  'A message staff sent from the SMS center. recipient_count is the number of signed-up numbers in the target barangays at that moment.';
create index announcements_sent_at_idx on public.announcements (sent_at);

create table public.announcement_barangays (
  announcement_id  integer not null references public.announcements (id) on delete cascade,
  barangay_id      text not null references public.barangays (id),
  primary key (announcement_id, barangay_id)
);

create table public.sms_lead_changes (
  effective_at  timestamptz primary key,
  minutes       smallint not null check (minutes between 5 and 30),
  set_by        uuid not null references public.staff (user_id)
);
comment on table public.sms_lead_changes is
  'Each change of "minutes before arrival" for the vicinity text. Kept as history because the app replays past days with the value in force then. Before the first row the app''s default applies.';

create table public.contacts (
  id           smallint generated always as identity primary key,
  barangay_id  text references public.barangays (id),
  phone        text check (phone = btrim(phone) and char_length(phone) between 1 and 40),
  hours        text check (hours = btrim(hours) and char_length(hours) between 1 and 80),
  updated_by   uuid not null references public.staff (user_id),
  updated_at   timestamptz not null default now(),
  -- One row for the City ENRO (no barangay) and at most one per barangay.
  constraint contacts_one_per_office unique nulls not distinct (barangay_id),
  constraint contacts_not_empty check (phone is not null or hours is not null)
);
comment on table public.contacts is
  'Office contact details that Kolek gives residents. A row exists only when there is something to show; numbers are never invented.';

create table public.suggestion_decisions (
  service_day  date not null,
  route_id     text not null references public.routes (id),
  decision     text not null check (decision in ('dispatched', 'dismissed')),
  decided_by   uuid not null references public.staff (user_id),
  decided_at   timestamptz not null,
  primary key (service_day, route_id)
);
comment on table public.suggestion_decisions is
  'What staff decided on the backup-truck suggestion for a route on a day. The suggestion itself is calculated by the app.';

-- ---------------------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------------------

alter table private.sms_subscriptions enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_barangays enable row level security;
alter table public.sms_lead_changes enable row level security;
alter table public.contacts enable row level security;
alter table public.suggestion_decisions enable row level security;

create policy read_all on public.announcements for select to anon, authenticated using (true);
create policy read_all on public.announcement_barangays for select to anon, authenticated using (true);
create policy read_all on public.sms_lead_changes for select to anon, authenticated using (true);
create policy read_all on public.contacts for select to anon, authenticated using (true);
create policy staff_read on public.suggestion_decisions for select to authenticated
  using ((select private.staff_role()) in ('admin', 'dispatcher', 'viewer'));

-- Who sent, set or decided is not readable through the API.
grant select (id, body, sent_at, recipient_count) on public.announcements to anon, authenticated;
grant select on public.announcement_barangays to anon, authenticated;
grant select (effective_at, minutes) on public.sms_lead_changes to anon, authenticated;
grant select (id, barangay_id, phone, hours) on public.contacts to anon, authenticated;
grant select (service_day, route_id, decision, decided_at)
  on public.suggestion_decisions to authenticated;

-- ---------------------------------------------------------------------------------------
-- Schedule helpers (the same rules as src/features/schedule/collections.ts)
-- ---------------------------------------------------------------------------------------

-- Does the route collect on this Manila date, by the stored schedule and holiday changes?
create function private.route_runs_on(p_route_id text, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select
       -- a holiday change moved a collection onto this date
       exists (
         select 1
         from public.schedule_exceptions e
         join public.schedule_exception_routes r on r.exception_id = e.id
         where r.route_id = p_route_id and e.action = 'move' and e.move_to = p_date
       )
       or (
         extract(dow from p_date)::smallint = any (s.days)
         and not exists (
           select 1
           from public.schedule_exception_routes r
           where r.route_id = p_route_id and r.on_date = p_date
         )
       )
     from public.route_schedules s
     where s.route_id = p_route_id and (s.valid_from is null or s.valid_from <= p_date)
     order by s.valid_from desc nulls last
     limit 1),
    false
  );
$$;

-- Is this a street of the route? A key is "barangay|street name", or "barangay|segment id"
-- for an unnamed road (see driverStreets in src/features/driver/streets.ts).
create function private.street_key_ok(p_route_id text, p_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.route_segments s
    join public.route_barangays rb
      on rb.route_id = s.route_id and rb.barangay_id = s.barangay_id
    where s.route_id = p_route_id
      and s.collect
      and p_key = s.barangay_id || '|' || coalesce(s.name, s.id)
  );
$$;

-- ---------------------------------------------------------------------------------------
-- Entry points: staff
-- ---------------------------------------------------------------------------------------

-- Returns {"id", "sent_at", "recipient_count"}. The same client_ref always returns the same
-- announcement, so a double tap or a retry can never send twice.
create function private.announcement_send(p_client_ref uuid, p_body text, p_barangay_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := private.require_staff('admin', 'dispatcher');
  v_body text := btrim(coalesce(p_body, ''));
  v_ids text[];
  v_row public.announcements;
begin
  if p_client_ref is null then
    perform private.fail('bad_client_ref');
  end if;
  select a.* into v_row from public.announcements a where a.client_ref = p_client_ref;
  if found then
    return jsonb_build_object('id', v_row.id, 'sent_at', v_row.sent_at,
                              'recipient_count', v_row.recipient_count);
  end if;

  if char_length(v_body) not between 1 and 480 then
    perform private.fail('bad_body', 400, 'A message is 1 to 480 characters.');
  end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_barangay_ids) as x;
  if v_ids is null
     or array_position(v_ids, null) is not null
     or cardinality(v_ids) <> (select count(*) from public.barangays b where b.id = any (v_ids)) then
    perform private.fail('bad_barangays');
  end if;

  begin
    insert into public.announcements (client_ref, body, sent_at, sent_by, recipient_count)
    values (
      p_client_ref, v_body, private.app_now(), v_staff,
      (select count(*) from private.sms_subscriptions s where s.barangay_id = any (v_ids))
    )
    returning * into v_row;
  exception when unique_violation then
    -- The same request arrived twice at the same moment.
    select a.* into v_row from public.announcements a where a.client_ref = p_client_ref;
    return jsonb_build_object('id', v_row.id, 'sent_at', v_row.sent_at,
                              'recipient_count', v_row.recipient_count);
  end;
  insert into public.announcement_barangays (announcement_id, barangay_id)
  select v_row.id, x from unnest(v_ids) as x;

  return jsonb_build_object('id', v_row.id, 'sent_at', v_row.sent_at,
                            'recipient_count', v_row.recipient_count);
end;
$$;

create function private.sms_lead_set(p_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := private.require_staff('admin');
  v_now timestamptz := private.app_now();
begin
  if p_minutes is null or p_minutes not between 5 and 30 then
    perform private.fail('bad_minutes', 400, 'The lead time is 5 to 30 minutes.');
  end if;
  -- A change replaces any change dated at or after it (same rule as the prototype).
  delete from public.sms_lead_changes c where c.effective_at >= v_now;
  insert into public.sms_lead_changes (effective_at, minutes, set_by)
  values (v_now, p_minutes, v_staff);
end;
$$;

-- p_barangay_id null = the City ENRO office. Both values empty = remove the entry.
create function private.contact_set(p_barangay_id text, p_phone text, p_hours text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := private.require_staff('admin');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_hours text := nullif(btrim(coalesce(p_hours, '')), '');
begin
  if p_barangay_id is not null
     and not exists (select 1 from public.barangays b where b.id = p_barangay_id) then
    perform private.fail('bad_barangay');
  end if;
  if char_length(v_phone) > 40 or char_length(v_hours) > 80 then
    perform private.fail('too_long', 400, 'A number is up to 40 characters and hours up to 80.');
  end if;

  if v_phone is null and v_hours is null then
    delete from public.contacts c where c.barangay_id is not distinct from p_barangay_id;
    return;
  end if;
  insert into public.contacts (barangay_id, phone, hours, updated_by)
  values (p_barangay_id, v_phone, v_hours, v_staff)
  on conflict on constraint contacts_one_per_office do update
    set phone = excluded.phone,
        hours = excluded.hours,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

create function private.suggestion_decide(p_day date, p_route_id text, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := private.require_staff('admin', 'dispatcher');
begin
  if p_decision is null or p_decision not in ('dispatched', 'dismissed') then
    perform private.fail('bad_decision');
  end if;
  if p_day is null or p_route_id is null or not private.route_runs_on(p_route_id, p_day) then
    perform private.fail('no_collection_that_day', 409);
  end if;
  insert into public.suggestion_decisions (service_day, route_id, decision, decided_by, decided_at)
  values (p_day, p_route_id, p_decision, v_staff, private.app_now())
  on conflict (service_day, route_id) do update
    set decision = excluded.decision,
        decided_by = excluded.decided_by,
        decided_at = excluded.decided_at;
end;
$$;

-- A schedule change starts on p_from (tomorrow at the earliest). The row in force before it is
-- left untouched; rows that would only start on or after p_from are replaced. Mirrors
-- validateScheduleChange and applyScheduleChange in src/features/schedule/editing.ts.
create function private.schedule_change(
  p_route_id text, p_from date, p_truck_id text, p_days smallint[],
  p_start time, p_window_end time, p_waste_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := private.require_staff('admin', 'dispatcher');
  v_days smallint[];
  v_base public.route_schedules;
begin
  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    perform private.fail('unknown_route', 404);
  end if;
  if not exists (select 1 from public.trucks t where t.id = p_truck_id) then
    perform private.fail('unknown_truck', 404);
  end if;
  select array_agg(distinct d order by d) into v_days from unnest(p_days) as d;
  if not private.is_weekday_set(v_days) then
    perform private.fail('no_days');
  end if;
  if p_start is null or p_window_end is null then
    perform private.fail('bad_time');
  end if;
  if p_window_end <= p_start then
    perform private.fail('end_before_start');
  end if;
  if p_from is null or p_from <= private.today() then
    perform private.fail('too_soon', 400, 'A change can start tomorrow at the earliest.');
  end if;
  if p_waste_type is null
     or p_waste_type not in ('mixed', 'biodegradable', 'residual', 'recyclable') then
    perform private.fail('bad_waste_type');
  end if;

  -- One change per route at a time.
  perform 1 from public.routes r where r.id = p_route_id for update;

  -- The record the change is based on: the one in force just before p_from.
  select s.* into v_base
  from public.route_schedules s
  where s.route_id = p_route_id and (s.valid_from is null or s.valid_from < p_from)
  order by s.valid_from desc nulls last
  limit 1;
  if not found then
    select s.* into v_base
    from public.route_schedules s
    where s.route_id = p_route_id and s.valid_from >= p_from
    order by s.valid_from
    limit 1;
  end if;

  delete from public.route_schedules s where s.route_id = p_route_id and s.valid_from >= p_from;
  insert into public.route_schedules
    (route_id, truck_id, days, start_time, window_end, depart_at, waste_type, expected_load,
     valid_from, created_by)
  values (
    p_route_id, p_truck_id, v_days, p_start, p_window_end,
    -- The late departure was tuned to the old window: keep it only if the start is unchanged.
    case
      when v_base.depart_at is not null and v_base.start_time = p_start
           and v_base.depart_at < p_window_end
        then v_base.depart_at
    end,
    p_waste_type, coalesce(v_base.expected_load, 0.80), p_from, v_staff
  );
end;
$$;

-- Signed-up numbers per barangay. Staff only; a barangay focal person sees their own.
create function private.sms_subscriber_counts()
returns table (barangay_id text, subscribers integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := private.require_staff('admin', 'dispatcher', 'viewer', 'barangay');
  v_only text := private.staff_barangay();
begin
  return query
    select b.id, count(s.user_id)::integer
    from public.barangays b
    left join private.sms_subscriptions s on s.barangay_id = b.id
    where v_only is null or b.id = v_only
    group by b.id
    order by b.id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Entry points: residents (text alerts, and "delete my data")
-- ---------------------------------------------------------------------------------------

-- "+639171234567" -> "0917 ••• 4567", the same mask the app shows.
create function private.mask_mobile(p_mobile text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '0' || substr(p_mobile, 4, 3) || ' ••• ' || right(p_mobile, 4);
$$;

create function private.sms_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_sub private.sms_subscriptions;
begin
  select s.* into v_sub from private.sms_subscriptions s where s.user_id = v_uid;
  if not found then
    return jsonb_build_object('subscribed', false);
  end if;
  return jsonb_build_object(
    'subscribed', true,
    'mobile_masked', private.mask_mobile(v_sub.mobile),
    'barangay_id', v_sub.barangay_id,
    'opted_in_at', v_sub.opted_in_at
  );
end;
$$;

-- One row per device and per number. A number that signs up again moves to the new device,
-- because a guest who clears their browser cannot get their old identity back.
create function private.sms_subscribe(p_mobile text, p_barangay_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  if p_mobile is null or p_mobile !~ '^[+]639[0-9]{9}$' then
    perform private.fail('bad_mobile', 400, 'Expected a Philippine mobile number as +639XXXXXXXXX.');
  end if;
  if p_barangay_id is null
     or not exists (select 1 from public.barangays b where b.id = p_barangay_id) then
    perform private.fail('bad_barangay');
  end if;

  delete from private.sms_subscriptions s where s.mobile = p_mobile and s.user_id <> v_uid;
  insert into private.sms_subscriptions as cur (user_id, mobile, barangay_id)
  values (v_uid, p_mobile, p_barangay_id)
  on conflict (user_id) do update
    set barangay_id = excluded.barangay_id,
        -- A new number is a new consent; a change of barangay is not.
        opted_in_at = case when cur.mobile = excluded.mobile then cur.opted_in_at else now() end,
        mobile = excluded.mobile;
  return private.sms_status();
end;
$$;

create function private.sms_unsubscribe()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  delete from private.sms_subscriptions s where s.user_id = v_uid;
end;
$$;

-- "Burahin ang data ko": removes the guest identity. Its text sign-up and driver session go
-- with it; its reports stay as city records but are no longer linked to anyone.
create function private.forget_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  delete from auth.users u where u.id = v_uid and u.is_anonymous;
  if not found then
    perform private.fail('not_allowed', 403, 'Only a guest identity can be removed this way.');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The API surface
-- ---------------------------------------------------------------------------------------

create function public.announcement_send(p_client_ref uuid, p_body text, p_barangay_ids text[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.announcement_send(p_client_ref, p_body, p_barangay_ids);
$$;

create function public.sms_lead_set(p_minutes integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.sms_lead_set(p_minutes);
$$;

create function public.contact_set(p_barangay_id text, p_phone text, p_hours text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.contact_set(p_barangay_id, p_phone, p_hours);
$$;

create function public.suggestion_decide(p_day date, p_route_id text, p_decision text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.suggestion_decide(p_day, p_route_id, p_decision);
$$;

create function public.schedule_change(
  p_route_id text, p_from date, p_truck_id text, p_days smallint[],
  p_start time, p_window_end time, p_waste_type text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.schedule_change(p_route_id, p_from, p_truck_id, p_days, p_start, p_window_end,
                                 p_waste_type);
$$;

create function public.sms_subscriber_counts()
returns table (barangay_id text, subscribers integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.sms_subscriber_counts();
$$;

create function public.sms_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.sms_status();
$$;

create function public.sms_subscribe(p_mobile text, p_barangay_id text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.sms_subscribe(p_mobile, p_barangay_id);
$$;

create function public.sms_unsubscribe()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.sms_unsubscribe();
$$;

create function public.forget_me()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.forget_me();
$$;

grant execute on function private.announcement_send(uuid, text, text[]) to authenticated;
grant execute on function public.announcement_send(uuid, text, text[]) to authenticated;
grant execute on function private.sms_lead_set(integer) to authenticated;
grant execute on function public.sms_lead_set(integer) to authenticated;
grant execute on function private.contact_set(text, text, text) to authenticated;
grant execute on function public.contact_set(text, text, text) to authenticated;
grant execute on function private.suggestion_decide(date, text, text) to authenticated;
grant execute on function public.suggestion_decide(date, text, text) to authenticated;
grant execute on function private.schedule_change(text, date, text, smallint[], time, time, text)
  to authenticated;
grant execute on function public.schedule_change(text, date, text, smallint[], time, time, text)
  to authenticated;
grant execute on function private.sms_subscriber_counts() to authenticated;
grant execute on function public.sms_subscriber_counts() to authenticated;
grant execute on function private.sms_status() to authenticated;
grant execute on function public.sms_status() to authenticated;
grant execute on function private.sms_subscribe(text, text) to authenticated;
grant execute on function public.sms_subscribe(text, text) to authenticated;
grant execute on function private.sms_unsubscribe() to authenticated;
grant execute on function public.sms_unsubscribe() to authenticated;
grant execute on function private.forget_me() to authenticated;
grant execute on function public.forget_me() to authenticated;
