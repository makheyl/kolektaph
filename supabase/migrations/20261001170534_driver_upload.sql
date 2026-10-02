-- KolektaPH pilot database · 7 of 8 · the driver upload
--
-- One entry point for everything a driver phone has queued (src/features/driver/outbox.ts):
-- the crew's taps and one batch of GPS fixes. A phone may send the same upload again after a
-- lost reply, so every part is safe to repeat:
--   events   by the id the phone gave them
--   GPS      by the index of the first fix in the shift's recording
--
-- driver_upload(p_events, p_gps) -> {"events": [{"id", "result", "reason"}], "gps": {...}}
--
--   p_events  [{"id", "kind", "at": <epoch ms>, "shift_id", ...}], at most 200, in order:
--     shift_start   route_id, crew
--     shift_end
--     status        status
--     load          load
--     disposal      action
--     incident      incident, minutes
--     incident_end
--     street        street_key, outcome, reason
--     task          ticket_id, action (start | done), before, after
--   result: stored | duplicate | rejected (with a reason). A rejected event is never retried;
--   the phone drops it.
--
--   p_gps  null, or {"shift_id", "source", "from_index", "fixes": [{"t", "lng", "lat", "acc"}]}
--     with at most 200 fixes. The answer says what the server did and which index it expects
--     next, so the phone resends from there after a gap:
--     {"result": stored | duplicate | gap | rejected, "reason", "next_index"}

-- Stores the part of a GPS batch the server does not have yet.
create function private.gps_store(p_truck text, p_gps jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.shifts;
  v_fixes jsonb := p_gps -> 'fixes';
  v_source text := p_gps ->> 'source';
  v_from integer;
  v_n integer;
  v_have integer;
  v_skip integer;
  v_last timestamptz;
  v_first_ms double precision;
  v_t0 timestamptz;
  v_dt integer[];
  v_lng integer[];
  v_lat integer[];
  v_acc smallint[];
begin
  -- Locking the shift row makes GPS writers of one shift take turns.
  select s.* into v_shift
  from public.shifts s
  where s.id = p_gps ->> 'shift_id' and s.truck_id = p_truck
  for update;
  if not found then
    return jsonb_build_object('result', 'rejected', 'reason', 'unknown_shift', 'next_index', 0);
  end if;

  select coalesce(max(b.from_index + b.fix_count), 0) into v_have
  from public.gps_batches b
  where b.shift_id = v_shift.id;

  begin
    v_from := (p_gps ->> 'from_index')::integer;
    if jsonb_typeof(v_fixes) is distinct from 'array' or v_from is null or v_from < 0 then
      raise exception using errcode = 'KP001', message = 'bad_batch';
    end if;
    v_n := jsonb_array_length(v_fixes);
    if v_n not between 1 and 200 or v_source is null or v_source not in ('phone', 'demo') then
      raise exception using errcode = 'KP001', message = 'bad_batch';
    end if;
    if v_shift.gps_source is not null and v_shift.gps_source <> v_source then
      raise exception using errcode = 'KP001', message = 'source_changed';
    end if;

    if v_from > v_have then
      return jsonb_build_object('result', 'gap', 'reason', null, 'next_index', v_have);
    end if;
    if v_from + v_n <= v_have then
      return jsonb_build_object('result', 'duplicate', 'reason', null, 'next_index', v_have);
    end if;

    -- Keep only the tail the server does not have (a retry may carry a few more fixes).
    v_skip := v_have - v_from;
    v_first_ms := (v_fixes -> v_skip ->> 't')::double precision;
    select
      array_agg(round((x ->> 't')::double precision - v_first_ms)::integer order by i),
      array_agg(round((x ->> 'lng')::numeric * 1000000)::integer order by i),
      array_agg(round((x ->> 'lat')::numeric * 1000000)::integer order by i),
      array_agg(round((x ->> 'acc')::numeric)::smallint order by i)
      into v_dt, v_lng, v_lat, v_acc
    from jsonb_array_elements(v_fixes) with ordinality as a (x, i)
    where i > v_skip;
    v_t0 := to_timestamp(v_first_ms / 1000.0);

    -- Fix times are the phone's own clock: recent, not in the future, and after what is stored.
    select b.t0 + b.dt_ms[b.fix_count] * interval '1 millisecond' into v_last
    from public.gps_batches b
    where b.shift_id = v_shift.id
    order by b.from_index desc
    limit 1;
    if v_t0 is null
       or v_t0 < now() - interval '8 days'
       or v_t0 + v_dt[cardinality(v_dt)] * interval '1 millisecond' > now() + interval '15 minutes'
       or (v_last is not null and v_t0 < v_last) then
      raise exception using errcode = 'KP001', message = 'bad_time';
    end if;

    insert into public.gps_batches (shift_id, from_index, t0, dt_ms, lng_e6, lat_e6, acc_m)
    values (v_shift.id, v_have, v_t0, v_dt, v_lng, v_lat, v_acc);
    update public.shifts s
       set gps_source = v_source
     where s.id = v_shift.id and s.gps_source is null;
  exception
    when sqlstate 'KP001' then
      return jsonb_build_object('result', 'rejected', 'reason', sqlerrm, 'next_index', v_have);
    when check_violation or not_null_violation or numeric_value_out_of_range
         or invalid_text_representation or null_value_not_allowed then
      return jsonb_build_object('result', 'rejected', 'reason', 'bad_fixes', 'next_index', v_have);
  end;

  return jsonb_build_object('result', 'stored', 'reason', null,
                            'next_index', v_have + v_n - v_skip);
end;
$$;

create function private.driver_upload(p_events jsonb, p_gps jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_truck text := private.require_truck();
  v_events jsonb := coalesce(p_events, '[]'::jsonb);
  -- Tap times come from the phone. They follow the app's clock, so allow for both clocks.
  v_lo timestamptz := least(now(), private.app_now()) - interval '8 days';
  v_hi timestamptz := greatest(now(), private.app_now()) + interval '15 minutes';
  v_e jsonb;
  v_id text;
  v_kind text;
  v_at timestamptz;
  v_shift_id text;
  v_shift public.shifts;
  v_route text;
  v_crew integer;
  v_ticket text;
  v_action text;
  v_result text;
  v_reason text;
  v_rows integer;
  v_out jsonb := '[]'::jsonb;
  v_gps jsonb;
begin
  if jsonb_typeof(v_events) <> 'array' or jsonb_array_length(v_events) > 200 then
    perform private.fail('bad_events', 400, 'Up to 200 events per upload.');
  end if;
  if jsonb_array_length(v_events) > 0 then
    -- One event writer at a time, so seq (the cursor readers poll with) follows commit order
    -- and a reader can never skip a row.
    perform pg_advisory_xact_lock(7166001);
  end if;

  for v_e in select x from jsonb_array_elements(v_events) as x loop
    v_id := v_e ->> 'id';
    v_kind := v_e ->> 'kind';
    v_shift_id := v_e ->> 'shift_id';
    v_result := 'stored';
    v_reason := null;
    begin
      if v_id is null or v_id !~ '^[A-Za-z0-9|_.:-]{8,80}$' then
        raise exception using errcode = 'KP001', message = 'bad_id';
      end if;
      v_at := to_timestamp((v_e ->> 'at')::double precision / 1000.0);
      if v_at is null or v_at < v_lo or v_at > v_hi then
        raise exception using errcode = 'KP001', message = 'bad_time';
      end if;
      if v_shift_id is null or v_shift_id !~ '^[A-Za-z0-9|_.:-]{8,80}$' then
        raise exception using errcode = 'KP001', message = 'unknown_shift';
      end if;

      if v_kind = 'shift_start' then
        v_route := v_e ->> 'route_id';
        v_crew := (v_e ->> 'crew')::integer;
        if v_route is not null
           and not exists (select 1 from public.routes r where r.id = v_route) then
          raise exception using errcode = 'KP001', message = 'unknown_route';
        end if;
        insert into public.shifts (id, truck_id, route_id, crew, started_at)
        values (v_shift_id, v_truck, v_route, v_crew, v_at)
        on conflict (id) do nothing;
        get diagnostics v_rows = row_count;
        if v_rows = 0 then
          if exists (
            select 1 from public.shifts s where s.id = v_shift_id and s.truck_id = v_truck
          ) then
            v_result := 'duplicate';
          else
            raise exception using errcode = 'KP001', message = 'shift_taken';
          end if;
        end if;

      else
        select s.* into v_shift
        from public.shifts s
        where s.id = v_shift_id and s.truck_id = v_truck;
        if not found then
          raise exception using errcode = 'KP001', message = 'unknown_shift';
        end if;

        if v_kind = 'shift_end' then
          if v_shift.ended_at is not null then
            v_result := 'duplicate';
          else
            update public.shifts s
               set ended_at = greatest(v_at, s.started_at)
             where s.id = v_shift_id;
          end if;

        elsif v_kind = 'task' then
          -- A crew's work on a special pickup is a ticket action, stored once, there.
          v_ticket := v_e ->> 'ticket_id';
          v_action := v_e ->> 'action';
          if v_action is null or v_action not in ('start', 'done') then
            raise exception using errcode = 'KP001', message = 'bad_action';
          end if;
          if exists (select 1 from public.ticket_events te where te.client_event_id = v_id) then
            v_result := 'duplicate';
          elsif not exists (
            select 1 from public.tickets t
            where t.id = v_ticket and t.dispatch_truck_id = v_truck
          ) then
            raise exception using errcode = 'KP001', message = 'not_your_task';
          else
            perform private.ticket_apply(
              v_ticket,
              case v_action when 'start' then 'start' else 'collect' end,
              'driver', v_at, v_uid, v_truck,
              jsonb_build_object('before', v_e -> 'before', 'after', v_e -> 'after'),
              v_id
            );
          end if;

        elsif v_kind in ('status', 'load', 'disposal', 'incident', 'incident_end', 'street') then
          if v_kind = 'street'
             and (v_shift.route_id is null
                  or not private.street_key_ok(v_shift.route_id, v_e ->> 'street_key')) then
            raise exception using errcode = 'KP001', message = 'bad_street';
          end if;
          insert into public.truck_events
            (id, truck_id, shift_id, at, kind, status, load, disposal_action, incident,
             incident_minutes, street_key, street_outcome, skip_reason)
          values (
            v_id, v_truck, v_shift_id, v_at, v_kind,
            case when v_kind = 'status' then v_e ->> 'status' end,
            case when v_kind = 'load' then (v_e ->> 'load')::numeric end,
            case when v_kind = 'disposal' then v_e ->> 'action' end,
            case when v_kind = 'incident' then v_e ->> 'incident' end,
            case when v_kind = 'incident' then (v_e ->> 'minutes')::smallint end,
            case when v_kind = 'street' then v_e ->> 'street_key' end,
            case when v_kind = 'street' then v_e ->> 'outcome' end,
            case when v_kind = 'street' then v_e ->> 'reason' end
          )
          on conflict (id) do nothing;
          get diagnostics v_rows = row_count;
          if v_rows = 0 then
            v_result := 'duplicate';
          end if;

        else
          raise exception using errcode = 'KP001', message = 'bad_kind';
        end if;
      end if;
    exception
      when sqlstate 'KP001' or sqlstate 'PT400' or sqlstate 'PT403' or sqlstate 'PT404'
           or sqlstate 'PT409' then
        v_result := 'rejected';
        v_reason := sqlerrm;
      when check_violation or not_null_violation or foreign_key_violation
           or numeric_value_out_of_range or invalid_text_representation
           or datetime_field_overflow then
        v_result := 'rejected';
        v_reason := 'bad_value';
    end;
    v_out := v_out || jsonb_build_object('id', v_id, 'result', v_result, 'reason', v_reason);
  end loop;

  if jsonb_typeof(p_gps) = 'object' then
    v_gps := private.gps_store(v_truck, p_gps);
  end if;

  return jsonb_build_object('events', v_out, 'gps', v_gps);
end;
$$;

create function public.driver_upload(p_events jsonb default '[]'::jsonb, p_gps jsonb default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.driver_upload(p_events, p_gps);
$$;

grant execute on function private.driver_upload(jsonb, jsonb) to authenticated;
grant execute on function public.driver_upload(jsonb, jsonb) to authenticated;
