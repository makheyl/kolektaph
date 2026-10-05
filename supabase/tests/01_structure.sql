-- KolektaPH pilot database · test 1 · structure and privileges
-- Run after 00_harness.sql, as one query.

-- ---------- Tables ----------
select pg_temp.eq((select count(*)::int from pg_tables where schemaname = 'public'), 22,
                  '22 tables in public');
select pg_temp.eq((select count(*)::int from pg_tables where schemaname = 'private'), 5,
                  '5 tables in private');
select pg_temp.eq(
  (select count(*)::int
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity),
  0, 'row rules are on for every table in public and private');
select pg_temp.eq(
  (select count(*)::int
   from pg_tables t
   where t.schemaname = 'public'
     and not exists (select 1 from pg_policies p
                     where p.schemaname = 'public' and p.tablename = t.tablename)),
  0, 'every public table has a read rule');
select pg_temp.eq(
  (select count(*)::int from pg_policies p
   where p.schemaname in ('public', 'private') and p.cmd <> 'SELECT'),
  0, 'every rule is read-only: there is no insert, update or delete rule');
select pg_temp.eq(
  (select count(*)::int from pg_policies p where p.schemaname = 'private'),
  0, 'private tables have no rule at all (nobody but the owner reads them)');

-- ---------- No app role can write, anywhere ----------
select pg_temp.eq(
  (select count(*)::int
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['anon', 'authenticated', 'service_role']) as r (name)
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p (name)
   where n.nspname in ('public', 'private') and c.relkind = 'r'
     and has_table_privilege(r.name, c.oid, p.name)),
  0, 'no write privilege on any table for anon, authenticated or service_role');
select pg_temp.eq(
  (select count(*)::int
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['anon', 'authenticated', 'service_role']) as r (name)
   where n.nspname in ('public', 'private') and c.relkind = 'r'
     and has_any_column_privilege(r.name, c.oid, 'INSERT, UPDATE, REFERENCES')),
  0, 'no column-level write privilege either');
select pg_temp.eq(
  (select count(*)::int
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['anon', 'authenticated', 'service_role']) as r (name)
   where n.nspname in ('public', 'private') and c.relkind = 'S'
     and has_sequence_privilege(r.name, c.oid, 'USAGE, SELECT, UPDATE')),
  0, 'no privilege on any sequence');
select pg_temp.eq(
  (select count(*)::int
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['anon', 'authenticated', 'service_role']) as r (name)
   where n.nspname = 'private' and c.relkind = 'r'
     and (has_table_privilege(r.name, c.oid, 'SELECT')
          or has_any_column_privilege(r.name, c.oid, 'SELECT'))),
  0, 'private tables cannot be read by any app role');

-- ---------- Who can read which table ----------
select pg_temp.eq(
  (select string_agg(c.relname, ' ' order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'SELECT')),
  'announcement_barangays barangays city_meta demo_clock route_barangays route_segments routes '
  || 'schedule_exception_routes schedule_exceptions shifts ticket_photos truck_events trucks',
  'tables fully readable without sign-in');
select pg_temp.eq(
  (select string_agg(c.relname, ' ' order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not has_table_privilege('anon', c.oid, 'SELECT')
     and has_any_column_privilege('anon', c.oid, 'SELECT')),
  'announcements contacts route_schedules sms_lead_changes ticket_events tickets',
  'tables readable without sign-in except their who-did-it columns');
select pg_temp.eq(
  (select string_agg(c.relname, ' ' order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not has_any_column_privilege('anon', c.oid, 'SELECT')),
  'gps_batches staff suggestion_decisions',
  'tables that need sign-in');
select pg_temp.eq(
  (select string_agg(c.relname, ' ' order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not has_any_column_privilege('authenticated', c.oid, 'SELECT')),
  null, 'a signed-in caller can address every public table (the row rules decide the rows)');

-- Who reported, who acted, who changed: never readable through the API.
select pg_temp.eq(
  (select count(*)::int
   from (values
     ('route_schedules', 'created_by'), ('route_schedules', 'created_at'),
     ('announcements', 'sent_by'), ('announcements', 'client_ref'),
     ('sms_lead_changes', 'set_by'),
     ('contacts', 'updated_by'), ('contacts', 'updated_at'),
     ('suggestion_decisions', 'decided_by'),
     ('tickets', 'reporter_id'), ('tickets', 'created_by_staff'), ('tickets', 'client_ref'),
     ('ticket_events', 'staff_id')
   ) as h (tbl, col)
   cross join unnest(array['anon', 'authenticated']) as r (name)
   where has_column_privilege(r.name, ('public.' || h.tbl)::regclass, h.col, 'SELECT')),
  0, 'the 12 who-did-it columns are not readable by anon or authenticated');

-- ---------- Functions ----------
select pg_temp.eq(
  (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace),
  33, '33 functions in public: 31 entry points and the two reads the app repeats');
select pg_temp.eq(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef),
  0, 'no function in public runs with owner rights');
select pg_temp.eq(
  (select count(*)::int from pg_proc p
   where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) as c (v)
                     where c.v like 'search_path=%')),
  0, 'every function pins its search_path');
select pg_temp.eq(
  (select count(*)::int
   from pg_proc p
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
   where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'no function is executable by everyone (PUBLIC)');
select pg_temp.eq(
  (select string_agg(p.proname, ' ' order by p.proname) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'clock pulse', 'without sign-in only clock and pulse can be called, and both only read');
select pg_temp.eq(
  (select string_agg(p.proname, ' ' order by p.proname) from pg_proc p
   where p.pronamespace = 'private'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'my_truck staff_barangay staff_role',
  'without sign-in the only private helpers reachable are the three the row rules use');
select pg_temp.eq(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  33, 'a signed-in caller can call all 33 (each entry point checks who is calling)');
select pg_temp.eq(
  (select string_agg(p.proname, ' ' order by p.proname) from pg_proc p
   where p.pronamespace = 'private'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'announcement_send claim_missed contact_set demo_clock_clear demo_clock_set demo_incident '
  || 'demo_reset driver_sign_in driver_sign_out driver_upload forget_me my_truck photo_attached '
  || 'recollection_create report_submit schedule_change sms_lead_set sms_status sms_subscribe '
  || 'sms_subscriber_counts sms_unsubscribe staff_barangay staff_role staff_save suggestion_decide '
  || 'ticket_act truck_pin_set upload_quota_ok',
  'the private functions a signed-in caller can reach are the implementations and rule helpers');
select pg_temp.eq(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'private'::regnamespace
     and p.proname in ('seed_load', 'set_truck_pin', 'ticket_apply', 'attach_photo', 'next_ticket_id',
                       'seed_sample_tickets', 'cleanup', 'gps_store')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE'))),
  0, 'the loader, the lifecycle core and the maintenance job cannot be called by any app role');

-- ---------- Defaults: nothing new is exposed by accident ----------
select pg_temp.eq(
  (select count(*)::int
   from pg_default_acl d
   cross join lateral aclexplode(d.defaclacl) as a
   where d.defaclrole = 'postgres'::regrole
     and d.defaclnamespace in (0, 'public'::regnamespace)
     and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))),
  0, 'new tables, sequences and functions get no grant for app roles or PUBLIC');

-- ---------- Storage, extensions, maintenance ----------
select pg_temp.eq(
  (select b.public::text || ' ' || b.file_size_limit || ' ' || array_to_string(b.allowed_mime_types, ',')
   from storage.buckets b where b.id = 'report-photos'),
  'false 1048576 image/jpeg', 'photo bucket is private, 1 MB, JPEG only');
select pg_temp.eq(
  (select string_agg(p.policyname || ':' || p.cmd, ' ' order by p.policyname)
   from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'),
  'report_photos_delete:DELETE report_photos_read:SELECT report_photos_upload:INSERT',
  'storage rules: upload, read, delete; no overwrite');
select pg_temp.eq(
  (select string_agg(e.extname || '@' || n.nspname, ' ' order by e.extname)
   from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname in ('postgis', 'pgcrypto', 'pg_cron', 'pg_graphql')),
  'pg_cron@pg_catalog pgcrypto@extensions postgis@extensions',
  'PostGIS and pgcrypto live in extensions; GraphQL is not installed');
select pg_temp.eq(
  (select j.schedule || ' ' || j.command || ' ' || j.active from cron.job j
   where j.jobname = 'kolektaph-cleanup'),
  '0 19 * * * select private.cleanup() true', 'the daily clean-up job is scheduled');
select pg_temp.eq((select count(*)::int from cron.job), 1, 'it is the only scheduled job');

select pg_temp.finish();
