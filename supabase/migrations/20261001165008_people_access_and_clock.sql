-- KolektaPH pilot database · 3 of 8 · people, access and the clock
--
-- Three kinds of caller share the API role "authenticated":
--   staff     a login (email + password) with an active row in public.staff
--   driver    any identity holding an unexpired row in private.driver_sessions
--   resident  an anonymous identity, created on the device when it first reports or signs
--             up for text alerts
-- Having a login gives no rights by itself.

-- ---------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------

create table public.staff (
  user_id      uuid primary key references auth.users (id),
  name         text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  role         text not null check (role in ('admin', 'dispatcher', 'viewer', 'barangay')),
  barangay_id  text references public.barangays (id),
  active       boolean not null default true,
  -- A barangay focal person belongs to a barangay; the other roles are city-wide.
  check ((role = 'barangay') = (barangay_id is not null))
);
comment on table public.staff is
  'City ENRO accounts. Rights come only from an active row here. To remove someone, set active to false.';

alter table public.route_schedules
  add constraint route_schedules_created_by_fkey
  foreign key (created_by) references public.staff (user_id);

create table private.truck_credentials (
  truck_id         text primary key references public.trucks (id) on delete cascade,
  pin_hash         text not null,
  failed_attempts  smallint not null default 0 check (failed_attempts between 0 and 1000),
  locked_until     timestamptz
);
comment on table private.truck_credentials is
  'bcrypt hash of each truck''s sign-in PIN, with a counter of wrong attempts (not a log of them).';

create table private.driver_sessions (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  truck_id    text not null references public.trucks (id) on delete cascade,
  expires_at  timestamptz not null
);
comment on table private.driver_sessions is
  'A phone signed in to a truck. Removed on sign-out, on a PIN change and after it expires.';

create table public.demo_clock (
  id           boolean primary key default true check (id),
  anchor_real  timestamptz,
  anchor_sim   timestamptz,
  speed        smallint not null default 1 check (speed in (1, 10, 60)),
  check ((anchor_real is null) = (anchor_sim is null))
);
comment on table public.demo_clock is
  'Prototype only. One row. Empty anchors = real time; otherwise app time = anchor_sim + (now - anchor_real) x speed.';
insert into public.demo_clock default values;

-- ---------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------

-- The time every entry point stamps with: real time, or the shared demo time.
create function private.app_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select case
              when c.anchor_sim is null then now()
              else c.anchor_sim + (now() - c.anchor_real) * c.speed
            end
     from public.demo_clock c),
    now()
  );
$$;

-- Today's date in Manila, by the app's clock.
create function private.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (private.app_now() at time zone 'Asia/Manila')::date;
$$;

-- The caller's staff role, or null. Used by row rules, so it must not depend on them.
create function private.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff s
  where s.user_id = (select auth.uid()) and s.active;
$$;

create function private.staff_barangay()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.barangay_id
  from public.staff s
  where s.user_id = (select auth.uid()) and s.active;
$$;

-- The truck the caller's phone is signed in to, or null.
create function private.my_truck()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.truck_id
  from private.driver_sessions d
  where d.user_id = (select auth.uid()) and d.expires_at > now();
$$;

grant execute on function private.staff_role() to anon, authenticated;
grant execute on function private.staff_barangay() to anon, authenticated;
grant execute on function private.my_truck() to anon, authenticated;

create function private.require_user()
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    perform private.fail('sign_in_required', 401);
  end if;
  return v_uid;
end;
$$;

create function private.require_staff(variadic p_roles text[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_role text := private.staff_role();
begin
  if v_role is null or not (v_role = any (p_roles)) then
    perform private.fail('not_allowed', 403);
  end if;
  return v_uid;
end;
$$;

create function private.require_truck()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_truck text := private.my_truck();
begin
  if v_truck is null then
    perform private.fail('driver_sign_in_required', 401);
  end if;
  return v_truck;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------------------

alter table public.staff enable row level security;
alter table public.demo_clock enable row level security;
alter table private.truck_credentials enable row level security;
alter table private.driver_sessions enable row level security;

create policy staff_read on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or (select private.staff_role()) = 'admin');
create policy read_all on public.demo_clock for select to anon, authenticated using (true);

grant select on public.staff to authenticated;
grant select on public.demo_clock to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Entry points: staff accounts and truck PINs (admin)
-- ---------------------------------------------------------------------------------------

create function private.staff_save(
  p_user_id uuid, p_name text, p_role text, p_barangay_id text, p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_staff('admin');
  v_name text := btrim(coalesce(p_name, ''));
begin
  -- One change at a time, so two admins cannot remove each other at the same moment.
  lock table public.staff in share row exclusive mode;

  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id and not coalesce(u.is_anonymous, false)
  ) then
    perform private.fail('unknown_login', 404, 'Create the login in the Supabase dashboard first.');
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    perform private.fail('bad_name');
  end if;
  if p_role is null or p_role not in ('admin', 'dispatcher', 'viewer', 'barangay') then
    perform private.fail('bad_role');
  end if;
  if (p_role = 'barangay') <> (p_barangay_id is not null)
     or (p_barangay_id is not null
         and not exists (select 1 from public.barangays b where b.id = p_barangay_id)) then
    perform private.fail('bad_barangay');
  end if;
  if p_active is null then
    perform private.fail('bad_active');
  end if;
  -- Never leave the city without an active admin.
  if (p_role <> 'admin' or not p_active) and not exists (
    select 1 from public.staff s where s.role = 'admin' and s.active and s.user_id <> p_user_id
  ) then
    perform private.fail('last_admin', 409);
  end if;

  insert into public.staff (user_id, name, role, barangay_id, active)
  values (p_user_id, v_name, p_role, p_barangay_id, p_active)
  on conflict (user_id) do update
    set name = excluded.name,
        role = excluded.role,
        barangay_id = excluded.barangay_id,
        active = excluded.active;
end;
$$;

-- Sets a truck's PIN. No caller check: only the seed and truck_pin_set use it.
create function private.set_truck_pin(p_truck_id text, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.trucks t where t.id = p_truck_id) then
    perform private.fail('unknown_truck', 404);
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    perform private.fail('bad_pin', 400, 'A PIN is 4 to 8 digits.');
  end if;

  insert into private.truck_credentials (truck_id, pin_hash)
  values (p_truck_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (truck_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null;

  -- A new PIN signs out every phone on that truck.
  delete from private.driver_sessions d where d.truck_id = p_truck_id;
end;
$$;

create function private.truck_pin_set(p_truck_id text, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_staff('admin');
begin
  perform private.set_truck_pin(p_truck_id, p_pin);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Entry points: driver sign-in
-- ---------------------------------------------------------------------------------------

-- Returns {"ok": true, "truck_id", "expires_at"} or {"ok": false, "error", ...}. A wrong PIN is
-- an ordinary answer, not an exception: an exception would undo the attempt counter.
create function private.driver_sign_in(p_truck_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_cred private.truck_credentials;
  v_failed integer;
  v_locked timestamptz;
  v_expires timestamptz := now() + interval '18 hours';
begin
  select c.* into v_cred
  from private.truck_credentials c
  join public.trucks t on t.id = c.truck_id
  where t.code = upper(btrim(coalesce(p_truck_code, '')))
  for update of c;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_truck');
  end if;
  if v_cred.locked_until is not null and v_cred.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', v_cred.locked_until);
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{4,8}$'
     and v_cred.pin_hash = extensions.crypt(p_pin, v_cred.pin_hash) then
    update private.truck_credentials c
       set failed_attempts = 0, locked_until = null
     where c.truck_id = v_cred.truck_id;
    insert into private.driver_sessions (user_id, truck_id, expires_at)
    values (v_uid, v_cred.truck_id, v_expires)
    on conflict (user_id) do update
      set truck_id = excluded.truck_id, expires_at = excluded.expires_at;
    return jsonb_build_object('ok', true, 'truck_id', v_cred.truck_id, 'expires_at', v_expires);
  end if;

  -- Every fifth wrong PIN locks the truck: 15 minutes, then 30, 60 ... up to 24 hours.
  v_failed := least(v_cred.failed_attempts + 1, 1000);
  if v_failed % 5 = 0 then
    v_locked := now() + least(interval '15 minutes' * power(2, v_failed / 5 - 1), interval '24 hours');
  end if;
  update private.truck_credentials c
     set failed_attempts = v_failed, locked_until = v_locked
   where c.truck_id = v_cred.truck_id;

  return jsonb_build_object(
    'ok', false, 'error', 'wrong_pin',
    'attempts_left', 5 - (v_failed % 5),
    'locked_until', v_locked
  );
end;
$$;

create function private.driver_sign_out()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  delete from private.driver_sessions d where d.user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Entry points: the clock
-- ---------------------------------------------------------------------------------------

-- p_sim: jump to this moment (null = stay where the clock is). p_speed: null = keep it.
create function private.demo_clock_set(p_sim timestamptz, p_speed smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_staff('admin');
  v_sim timestamptz := coalesce(p_sim, private.app_now());
begin
  if p_speed is not null and p_speed not in (1, 10, 60) then
    perform private.fail('bad_speed');
  end if;
  if v_sim not between now() - interval '400 days' and now() + interval '400 days' then
    perform private.fail('bad_time');
  end if;
  update public.demo_clock c
     set anchor_real = now(), anchor_sim = v_sim, speed = coalesce(p_speed, c.speed)
   where c.id;
end;
$$;

create function private.demo_clock_clear()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_staff('admin');
begin
  update public.demo_clock c
     set anchor_real = null, anchor_sim = null, speed = 1
   where c.id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The API surface: thin functions that run as the caller and hand over to private
-- ---------------------------------------------------------------------------------------

create function public.staff_save(
  p_user_id uuid, p_name text, p_role text, p_barangay_id text, p_active boolean
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.staff_save(p_user_id, p_name, p_role, p_barangay_id, p_active);
$$;

create function public.truck_pin_set(p_truck_id text, p_pin text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.truck_pin_set(p_truck_id, p_pin);
$$;

create function public.driver_sign_in(p_truck_code text, p_pin text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.driver_sign_in(p_truck_code, p_pin);
$$;

create function public.driver_sign_out()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.driver_sign_out();
$$;

create function public.demo_clock_set(p_sim timestamptz default null, p_speed smallint default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.demo_clock_set(p_sim, p_speed);
$$;

create function public.demo_clock_clear()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.demo_clock_clear();
$$;

-- Server time plus the demo clock, so a device can line its own clock up with the server's.
create function public.clock()
returns table (server_now timestamptz, anchor_real timestamptz, anchor_sim timestamptz, speed smallint)
language sql
security invoker
set search_path = ''
as $$
  select clock_timestamp(), c.anchor_real, c.anchor_sim, c.speed
  from public.demo_clock c;
$$;

grant execute on function private.staff_save(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.staff_save(uuid, text, text, text, boolean) to authenticated;
grant execute on function private.truck_pin_set(text, text) to authenticated;
grant execute on function public.truck_pin_set(text, text) to authenticated;
grant execute on function private.driver_sign_in(text, text) to authenticated;
grant execute on function public.driver_sign_in(text, text) to authenticated;
grant execute on function private.driver_sign_out() to authenticated;
grant execute on function public.driver_sign_out() to authenticated;
grant execute on function private.demo_clock_set(timestamptz, smallint) to authenticated;
grant execute on function public.demo_clock_set(timestamptz, smallint) to authenticated;
grant execute on function private.demo_clock_clear() to authenticated;
grant execute on function public.demo_clock_clear() to authenticated;
grant execute on function public.clock() to anon, authenticated;
