-- KolektaPH pilot database · test harness
--
-- Put this file in front of a test file and run both as ONE query, in the Supabase SQL editor
-- or with the MCP execute_sql tool. The run always ends with an error on purpose: the message
-- is the test report, and raising it rolls back everything the test did (test users, reports,
-- uploads), so a test run leaves nothing behind.
--
--   TESTS: 41 passed, 0 failed                  all good
--   TESTS: 39 passed, 2 failed  + the failures   something is wrong

create temp table _results (
  n       serial primary key,
  passed  boolean not null,
  label   text not null,
  detail  text
) on commit drop;
create temp table _who (name text primary key, id uuid not null) on commit drop;
create temp table _vars (key text primary key, value text) on commit drop;
grant select, insert on _results to public;
grant usage on sequence _results_n_seq to public;
grant select on _who to public;
grant select, insert, update on _vars to public;

create function pg_temp.ok(p_passed boolean, p_label text, p_detail text default null)
returns void language sql as $$
  insert into _results (passed, label, detail) values (coalesce(p_passed, false), p_label, p_detail);
$$;

create function pg_temp.eq(p_have anyelement, p_want anyelement, p_label text)
returns void language sql as $$
  select pg_temp.ok(
    p_have is not distinct from p_want, p_label,
    format('have %s, want %s', coalesce(p_have::text, 'null'), coalesce(p_want::text, 'null'))
  );
$$;

-- Passes when p_sql fails with the expected SQLSTATE or message.
create function pg_temp.throws(p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.ok(false, p_label, 'no error was raised');
exception when others then
  perform pg_temp.ok(sqlstate = p_expect or sqlerrm = p_expect, p_label, sqlstate || ': ' || sqlerrm);
end;
$$;

-- A login that exists only inside this test run. No email = an anonymous (guest) identity.
create function pg_temp.new_user(p_name text, p_email text default null)
returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, is_anonymous) values (v_id, p_email, p_email is null);
  insert into _who (name, id) values (p_name, v_id);
  return v_id;
end;
$$;

create function pg_temp.uid(p_name text)
returns uuid language sql stable as $$
  select w.id from _who w where w.name = p_name;
$$;

-- Keep a value (a ticket id, a server reply) for later statements of the same run.
create function pg_temp.remember(p_key text, p_value text)
returns text language sql as $$
  insert into _vars (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value
  returning value;
$$;

create function pg_temp.recall(p_key text)
returns text language sql stable as $$
  select v.value from _vars v where v.key = p_key;
$$;

-- Act as a signed-in caller, exactly as the API would set things up.
create function pg_temp.as_user(p_name text)
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', pg_temp.uid(p_name), 'role', 'authenticated',
      'is_anonymous', (select u.is_anonymous from auth.users u where u.id = pg_temp.uid(p_name))
    )::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

create function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

create function pg_temp.finish()
returns void language plpgsql as $$
declare
  v_passed integer;
  v_failed integer;
  v_lines text;
begin
  perform pg_temp.as_owner();
  select count(*) filter (where r.passed), count(*) filter (where not r.passed)
    into v_passed, v_failed
  from _results r;
  select string_agg(format(E'\n  #%s %s -- %s', r.n, r.label, coalesce(r.detail, '')), '' order by r.n)
    into v_lines
  from _results r
  where not r.passed;
  raise exception 'TESTS: % passed, % failed%', v_passed, v_failed, coalesce(v_lines, '');
end;
$$;

grant execute on function pg_temp.ok(boolean, text, text) to public;
grant execute on function pg_temp.eq(anyelement, anyelement, text) to public;
grant execute on function pg_temp.throws(text, text, text) to public;
grant execute on function pg_temp.uid(text) to public;
grant execute on function pg_temp.remember(text, text) to public;
grant execute on function pg_temp.recall(text) to public;
grant execute on function pg_temp.as_user(text) to public;
grant execute on function pg_temp.as_anon() to public;
grant execute on function pg_temp.as_owner() to public;
grant execute on function pg_temp.finish() to public;
