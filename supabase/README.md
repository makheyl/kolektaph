# KolektaPH pilot database (Supabase)

A free-plan Supabase project that holds the prototype's data: `kolektaph-pilot`, Singapore
(`ap-southeast-1`), project ref `mxitciwrvcxitwkfszbd`, Postgres 17.

**Status: Stage 1, database only.** The schema, access rules, entry points, mock data and tests
are in place. The app is **not connected yet**: it still runs on the mock services in
`src/services/mock`. Stage 2 adds `src/services/supabase/` behind the same `Services` interface.

All data in it is sample data, the same as the app's.

## What is stored, and what is not

| Stored (a person or device entered it)                                      | Calculated by the app, never stored      | Stays on the device                  |
| --------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------ |
| Barangays, city, trucks, routes and street segments                         | Truck positions and arrival times        | Language, text size, chosen barangay |
| Weekly schedules (dated history) and holiday changes                        | Automatic alerts (night before, 15 min)  | Read markers, offline drafts         |
| Driver shifts, crew taps (status, load, disposal, incident, street), GPS    | Missed streets and statistics            | The driver's upload queue            |
| Reports: tickets, each action on them, photos                               | Report priority and dispatch suggestions | Kolek chat                           |
| Announcements, SMS lead-time changes, office contacts, suggestion decisions | Kolek's answers                          | Usability-test answers               |
| Text-alert sign-ups, truck PINs (hashed), staff roles, the demo clock       |                                          |                                      |

## Design rules

1. **One fact, one place.** A ticket has no stored "submitted" step (it is `created_at`), no stored
   auto-close (48 hours after collection is a rule), and no status copied onto each action. A crew's
   pickup task is a ticket action, not also a truck event. A shift's start and end are columns of
   `shifts`, not events.
2. **Reads go through row rules; writes go through entry points.** No API role has insert, update
   or delete on any table. Every write is a function that checks the caller and the input first.
3. **Illegal states cannot be stored.** CHECK rules tie a ticket's status to its details, a truck
   event's columns to its kind, and so on. The tests try to break each one.
4. **Every entry point is safe to repeat.** Reports by `client_ref`, announcements by `client_ref`,
   crew taps by the id the phone gave them, GPS by the index of the first fix.
5. **No logs.** No request log, no sign-in attempt log, no audit table. Limits are counted from
   the data itself; "who did it" is a column on the row.
6. **Secrets are out of reach.** The `private` schema is not exposed by the API. It holds PIN
   hashes, mobile numbers, driver sessions, ticket counters and all privileged code.
7. **The server stamps time**, from one shared clock (`private.app_now()`). Phones send a time only
   for what happens offline: crew taps and GPS fixes.

## Tables

`public` (22, readable under row rules):

| Group          | Tables                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Reference      | `barangays`, `city_meta`, `trucks`, `routes`, `route_barangays`, `route_segments`                 |
| Schedules      | `route_schedules`, `schedule_exceptions`, `schedule_exception_routes`                             |
| People         | `staff`                                                                                           |
| Truck activity | `shifts`, `truck_events`, `gps_batches`                                                           |
| Reports        | `tickets`, `ticket_events`, `ticket_photos`                                                       |
| City settings  | `announcements`, `announcement_barangays`, `sms_lead_changes`, `contacts`, `suggestion_decisions` |
| Demo           | `demo_clock`                                                                                      |

`private` (5, no API access): `truck_credentials`, `driver_sessions`, `sms_subscriptions`,
`ticket_counters`, `sample_tickets`.

Notes that are easy to miss:

- `route_schedules`: the row in force on a day is the one with the latest `valid_from` on or before
  it (empty = the original). There is no "valid until" column, and rows in force are never edited.
- `truck_events.seq` is the arrival order. Clients fetch only new rows with `seq=gt.<last seen>`.
  A row with no `shift_id` is an incident triggered from the demo controls.
- `gps_batches` stores one upload (up to 200 fixes) per row as packed arrays: fix _i_ is at
  `t0 + dt_ms[i]`, position `lng_e6[i] / 1e6`, `lat_e6[i] / 1e6`, accuracy `acc_m[i]` metres.
- `tickets.status` is the last recorded status. A `collected` ticket counts as closed 48 hours
  after its collection (the app's `withAutoClose`).
- `tickets.source` is derived: `enro` if staff created it, `claim` if it has missed-street details,
  otherwise `resident`.
- Photos live in the private bucket `report-photos` (JPEG, 1 MB) as `<identity>/<uuid>.jpg`;
  `ticket_photos` points to the file, or to one of the bundled sample pictures.

## Who can read what

| Data                                                                 | No sign-in     | Resident device | Truck phone      | Staff                        |
| -------------------------------------------------------------------- | -------------- | --------------- | ---------------- | ---------------------------- |
| Map, trucks, routes, schedules, holidays                             | read           | read            | read             | read                         |
| Truck events, shifts, announcements, lead time, contacts, demo clock | read           | read            | read             | read                         |
| Tickets, their actions and photos                                    | the 12 samples | own + samples   | its open pickups | all (barangay role: its own) |
| Raw GPS                                                              | none           | none            | its own truck    | read (not the barangay role) |
| Suggestion decisions                                                 | none           | none            | none             | read (not the barangay role) |
| Staff list                                                           | none           | none            | none             | own row; admin sees all      |
| Mobile numbers, PIN hashes, sessions, counters                       | never          | never           | never            | never                        |

- A resident device and a truck phone are **guest identities** (Supabase anonymous sign-in),
  created only when the device first reports, signs up for texts, or signs in to a truck.
- Staff rights come only from an active row in `staff`. Having a login gives nothing.
  **viewer** reads; **barangay** reads its barangay's reports; **dispatcher** also acts on
  tickets, schedules re-collections, decides suggestions, sends announcements and changes
  schedules; **admin** also changes the lead time, contacts, staff, truck PINs and demo controls.
- "Who did it" columns (`created_by`, `sent_by`, `set_by`, `updated_by`, `decided_by`, `staff_id`,
  `reporter_id`, `created_by_staff`, `client_ref`) are not readable through the API. Read them in
  the Supabase dashboard. Because of this, select named columns from `tickets`, `ticket_events`,
  `route_schedules`, `announcements`, `sms_lead_changes`, `contacts` and `suggestion_decisions`;
  `select *` on them is refused.

## Entry points

All are functions in `public` that run as the caller and hand over to an implementation in
`private`. Errors carry a short code in `message` (for example `rate_limited`, `invalid_transition`).

| Entry point                                                                                             | Who               | What it does                                                                |
| ------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| `report_submit`                                                                                         | resident          | Files a report; the server works out the barangay. 5 an hour, 15 a day.     |
| `claim_missed`                                                                                          | resident          | "Hindi nadaanan": one ticket per street per day. 3 new claims a day.        |
| `ticket_reopen`, `ticket_rate`                                                                          | the reporter      | Reopen within 48 hours; rate once, 1 to 5.                                  |
| `sms_subscribe`, `sms_unsubscribe`, `sms_status`                                                        | resident          | Text-alert sign-up; the number comes back masked only.                      |
| `forget_me`                                                                                             | resident          | Removes the guest identity; its reports stay, unlinked.                     |
| `driver_sign_in`, `driver_sign_out`                                                                     | truck phone       | Truck code + PIN. Every fifth wrong PIN locks the truck (15 min, doubling). |
| `driver_upload`                                                                                         | truck phone       | Crew taps and one GPS batch; answers per event and with the next GPS index. |
| `ticket_verify`, `ticket_dispatch`, `ticket_collect`, `ticket_educate`, `ticket_reject`, `ticket_merge` | dispatcher, admin | The lifecycle in `src/features/reports/lifecycle.ts`.                       |
| `recollection_create`, `suggestion_decide`, `announcement_send`, `schedule_change`                      | dispatcher, admin | Re-collection ticket, suggestion decision, announcement, dated schedule.    |
| `sms_lead_set`, `contact_set`, `staff_save`, `truck_pin_set`                                            | admin             | City settings, staff roles, truck PINs.                                     |
| `sms_subscriber_counts`                                                                                 | staff             | Sign-ups per barangay (counts only).                                        |
| `demo_clock_set`, `demo_clock_clear`, `demo_incident`, `demo_reset`                                     | admin             | The shared demo clock, a demo incident, back to the seeded state.           |
| `clock`                                                                                                 | anyone            | Server time and the demo clock.                                             |

Three behaviours to know before wiring the app:

- **Claims.** The device still works out the verdict. The server marks a claim verified "by the
  system" only when the crew's own log proves it (the street was logged as skipped for a full truck
  or a blocked road, or the truck reported FULL). Otherwise the ticket waits for staff.
- **The driver upload** (`supabase/migrations/…_driver_upload.sql` documents the payload). Each event
  carries its `shift_id`. A `shift_start` or `shift_end` becomes a row or a column of `shifts`; a
  `task` becomes a ticket action; the rest become `truck_events`. A rejected event is dropped by the
  phone, not retried. The GPS answer includes `next_index`: the phone continues from there.
- **The demo clock** is one shared clock in the database, set by an admin. Everything the server
  stamps follows it, so a demo is the same moment on every device.

## Running the tests

The tests are plain SQL in `supabase/tests`. To run one, put `00_harness.sql` in front of it and
run both as **one query**, in the dashboard's SQL editor or with the Supabase MCP `execute_sql`
tool. The run always ends with an error on purpose: its message is the report (for example
`TESTS: 85 passed, 0 failed`), and raising it rolls back everything the test did.

| File                          | Checks | What it proves                                                                      |
| ----------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `01_structure.sql`            | 30     | Row rules everywhere, no write grant anywhere, no privileged code in `public`       |
| `02_seed.sql`                 | 33     | The seed equals `src/data/carmona` to the digit; the server's rules match the app's |
| `03_access.sql`               | 73     | What each kind of caller can and cannot read or call                                |
| `04_reports.sql`              | 85     | Sending reports, photos, the whole lifecycle, missed-street claims                  |
| `05_driver.sql`               | 49     | PIN lockout, the upload (repeats, refusals, GPS tail and gap)                       |
| `06_city.sql`                 | 73     | Text alerts, announcements, lead time, contacts, schedules, staff, "delete my data" |
| `07_demo_and_maintenance.sql` | 31     | The clock, demo incident, reset, the daily clean-up                                 |

`02_seed.sql` holds checksums printed by `npx tsx scripts/db/build-seed.ts --expect`. If the data
in `src/data/carmona` changes, re-seed and paste the new values. Tests 4 and 7 use dates in October
2026 and January 2027 through the demo clock, which accepts times within 400 days of today.

## Rebuilding from scratch

1. Create a Supabase project and apply `supabase/migrations` in order.
2. Build the seed from the app's own data: `npx tsx scripts/db/build-seed.ts seed.json`.
3. Load it. With database access: `select private.seed_load('<contents of seed.json>'::jsonb);`.
   Without it: follow `supabase/seed/one_time_door.sql`.
4. Set the truck PINs: `select private.set_truck_pin(id, '<PIN>') from public.trucks;` (the seed
   used the public demo PIN from the root README; set real ones before real crews use it).
5. In the dashboard, turn on **Anonymous sign-ins** (Authentication → Sign In / Providers) and add
   the first staff login (Authentication → Users → Add user). Then give it a role:

   ```sql
   insert into public.staff (user_id, name, role)
   select id, 'ENRO Admin', 'admin' from auth.users where email = 'the-login@example.com';
   ```

   After that, an admin adds or changes staff with `staff_save`.

## Operations

- **Daily job** (`pg_cron`, 03:00 Manila): removes expired driver sessions, GPS older than 35 days,
  guest identities over 7 days old that own nothing, and its own run history.
- **Free-plan limits:** 500 MB database (about 21 MB used after seeding), 1 GB file storage,
  5 GB egress, 200 live connections. The project **pauses after 7 quiet days** and can be restored
  from the dashboard within 90 days.
- **Keys:** only the publishable key (`sb_publishable_…`) belongs in the app. Never commit a
  secret key.
- **Schema changes:** add a new migration; never edit an applied one. Keep the tests passing.

## Advisor notices (reviewed)

- Security: five "RLS enabled, no policy" notices for the `private` tables. Intended: nobody but
  the database owner reads them.
- Performance: "unindexed foreign key" notices on small reference and who-did-it columns that are
  never deleted or joined, and "unused index" on a new database. Indexes exist only where a query
  needs one.

## Known limits of the pilot

- No SMS gateway yet: numbers are not verified by a real code and nothing is sent.
- Server-side GPS verification of claims is not built; staff verify with one tap.
- Barangay boundaries come from OpenStreetMap and overlap in thin slivers (up to about 520 m²).
  A point in a sliver goes to the first barangay by id, the same as in the app.
- Sample ticket 112 is labelled Barangay 2 in `sampleTickets.ts`, but its pin is in Barangay 4;
  the database files it under Barangay 4.
- Photo files of deleted reports are not removed automatically (`demo_reset` lists them).
- The demo controls and `demo_clock` are for the prototype only; drop them for production.
