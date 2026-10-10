This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Project: KolektaPH

- Users are ordinary Carmona residents (including seniors and people on low-end phones), truck drivers, and City ENRO staff. Resident UI is Filipino-first (English toggle), uses large text and touch targets, and never relies on colour alone.
- Screens call only `src/services/` interfaces. `services/index.ts` picks the implementation: the pilot database (`services/supabase`) when `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` are set (see `.env.example`; `.env.local` is git-ignored), otherwise the sample services (`services/mock`, everything on the device; tests always use these). Both reuse the same calculation (simulator, alerts, coverage, stats, Kolek): the Supabase layer only changes where facts come from and where entries go. Don't import mock data or stores directly into screens.
- A pilot Supabase database lives in `supabase/` (read `supabase/README.md` first). No API role can write a table: every write is an entry-point function, and each one is safe to repeat. Store only what a person or device enters; anything the app can calculate stays calculated. Change the schema only with a new migration (never edit an applied one), keep `supabase/tests` passing, and rebuild the seed with `npx tsx scripts/db/build-seed.ts` instead of typing data. Only the publishable key may appear in the app or the repo (`config.ts` refuses any other key).
- The app talks to Supabase through the small `fetch` client in `services/supabase` (`http.ts`, `auth.ts`, `storage.ts`), not `@supabase/supabase-js`, to keep the first web load small. Reads: `sync.ts` asks `pulse` every few seconds (clock, new truck events by `seq`, a fingerprint per data set) and re-reads a set only when its fingerprint changes; select named columns (the who-did-it columns are not readable). Writes: one entry point each, with a device-made reference where the entry point takes one (`clientRef`, photo names from `uuidFromText`), so a retry never files twice. Mappers (`mappers.ts`, tested in `__tests__/supabaseMappers.test.ts`) rebuild what the database stores once (ticket timelines, schedule end days, shift start/end events) into the app's types.
- A device has two identities (`auth.ts`): a guest one (anonymous sign-in, made on first report, text sign-up or truck sign-in) and the City ENRO login (dashboard only). The dashboard reads as staff; everything else as the guest. Rights come from the database (`staff` row, truck sign-in), never from the app; the UI only hides what would be refused (`staffRights`). Never type or store a staff password anywhere but the sign-in form.
- Domain logic (ETA, vicinity SMS, missed streets, report lifecycle, Kolek intents) is pure TypeScript in `src/features/` and is unit-tested.
- Every user-facing string goes through i18n (`src/i18n/`). Sample numbers must be labelled as sample data.
- Maps are MapLibre only: `KMapMapLibre.web.tsx` (maplibre-gl, loaded on demand by `KMap.web.tsx` so screens without a map stay light) and `KMap.tsx` (native, @maplibre/maplibre-react-native), sharing the layer specs in `layers.ts`. Keep both in sync. Don't add react-native-maps.
- Web output is `single` (SPA), because maplibre-gl needs `window` and can't be statically rendered. Its worker is served from `public/maplibre/` (copied on postinstall).
- Role areas are real URL segments (`src/app/resident`, `driver`, `enro`), not route groups, so the dashboard lives at `/enro`.
- Asia/Manila time uses the fixed UTC+8 helpers in `src/lib/time.ts` (the Philippines has no DST). Don't add timezone libraries.
- With the React Compiler on, never read `Date.now()` during render. Get time from `useSimNow()` or read it inside event handlers.
- Map fixtures come from `scripts/data/build-carmona-data.mjs`. Regenerate them; don't edit the JSON by hand.
- SMS texts are Filipino (like the pitch samples) and live in `src/features/alerts/templates.ts`. A test checks that every template fits one GSM-7 SMS for every barangay, so keep them that way.
- Alerts come from `AlertEngine` (a stateful evaluator, the same as a backend would run), replayed over the deterministic simulation. Send once per barangay per day; never invent ETAs (see `etaBase`).
- The GPS coverage check (`features/coverage`) is the single source of truth for missed streets; the backup suggestion counts streets from it. Suggestions never act on their own: staff decide.
- The sample schedule is tuned to the pitch story (Truck 2 departs 7:17, so Milagrosa's 15-minute SMS goes out around 7:25). Check `__tests__/alerts.test.ts` after changing routes or schedules.
- Driver app reports are `TruckEvent`s. The simulator replays them (a driver can take over a truck mid-route; until a shift starts the simulator stands in for the crew). New driver features = new event kinds + simulator/alert handling + tests in `__tests__/driver.test.ts`.
- The driver phone keeps an offline queue (`stores/driver.ts` outbox, `stores/gps.ts`). Uploads must stay idempotent (event ids, GPS `fromIndex`); undoable taps are held for `UNDO_MS` before upload, so undo never needs the server.
- GPS is recorded only during a shift (HAKOT TC-09): `acceptFixes` enforces it and `finishShift` stops the service first. Android uses a foreground service with the "while using the app" permission only; don't add background location permission.
- Phone GPS = location task (foreground service, keeps recording with the screen off) + a `watchPositionAsync` watcher (reliable delivery while the app runs); a watchdog in the driver layout restarts both when fixes stop. Keep expo-task-manager ≥ 57.0.21: older versions left a stale task manager after a React context was destroyed (e.g. by the dev launcher), so background fixes never reached JS (the GPS log shows such gaps).
- On the sample data, `stores/backend.ts` stands in for the server; on web, `stores/tabSync.web.ts` reloads shared stores when another tab writes them (the driver ↔ ENRO demo bridge). Screens never read it directly. On the pilot database every tab simply asks the server, and the demo clock is the server's (`demo_clock`, admin only).
- Reports are `Ticket`s changed only through `applyAction` (`features/reports/lifecycle.ts`: HAKOT Fig. 4, roles per action, 48-hour reopen, auto-close). Priority (`priority.ts`, HAKOT App. B.2) and dispatch (`dispatch.ts`) are suggestions computed from the ticket list; they are never stored and never act on their own.
- Crew work on a ticket is a `task` `TruckEvent` (start / done with before and after photos); the backend turns it into lifecycle actions, so it goes through the same offline queue as every other driver tap.
- "Hindi nadaanan" claims are judged by `judgeClaim` (`features/claims/missed.ts`, HAKOT §10.2) from the same coverage check as the ENRO missed-streets page. A claim opens at most one MISSED ticket per street per day.
- Photos: native uses live camera capture only (`PhotoCapture.tsx`, no gallery) and web uses a file input with `capture`. `compressPhoto` only scales down (1280 px native, 960 px web as a data URI). Sample tickets use `SamplePhoto` drawings labelled as sample photos. Never present them as real.
- Location readings for residents pass `mayShowUserSettingsDialog: false`, so declining Google's "Location Accuracy" prompt can't block the pin. If there's no fix, the pin starts at the barangay and the resident moves the map.
- Ask Kolek is rule-based (`features/kolek`): `understand` (Taglish normalisation, then ordered rules) → `answerKolek` (answers from the same functions the screens use) → `renderLine`. Answers carry facts as structured `KolekValue`s; the `kolek.*` texts must never contain digits or prices (a test checks), and every value must come from data. When Kolek doesn't know, it says so and gives the contacts. A new intent needs a rule, answer, chips and questions in `__tests__/kolek.test.ts` (keep ≥ 85% on the 50-question set; don't tune rules only to that set). The chat stays in memory, never saved.
- The Home status wording lives in `features/resident/statusText.ts`, shared by the Home card and Kolek. Change it there, not in `StatusCard`.
- Schedule edits are dated: `applyScheduleChange` ends the old record the day before (`validUntil`) and adds one with `validFrom`, so past days replay unchanged. Never edit a schedule in place. `routeRunsOnDay` honours validity; use `scheduleOn`/`scheduleValidOn` to find the record in force.
- City settings (`stores/cityAdmin.ts`, a stand-in for server tables): edited schedules, SMS lead time as a history of changes (`leadAt(time)`, so sent texts never change), contacts, and sample staff. Contact numbers stay null until the City or barangay gives official ones: never invent numbers. The demo reset restores all of it.
- Statistics: `services.stats.getDailyStats` replays days (simulation + coverage check + alert log); the summaries and the CSV are pure (`features/stats/history.ts`). `lib/download` saves a file on web and opens the share sheet on phones.
- Edge-to-edge Android doesn't resize the window for the keyboard, and `KeyboardAvoidingView` measures relative to its parent. Pad by the measured overlap instead (see `app/resident/kolek.tsx`). For decorative views use `aria-hidden`, which works on web and native (`accessibilityElementsHidden` warns on web).
- Web build: `npm run build:web` exports to `dist/` and generates the service worker (Workbox, `workbox-config.js`). The service worker registers only in production (`src/lib/pwa.web.ts`). Hosting must compress responses and send unknown paths to `index.html`. The page template, manifest and icons are in `public/`.
- Keep the first web load small (3G): routes are split (`asyncRoutes` on web), and maplibre-gl is not bundled on web: `metro.config.js` redirects the bare `maplibre-gl` import to a stub and `KMapMapLibre.web.tsx` loads it from `public/maplibre/` (copied on postinstall). Expo puts every other node_modules package in the first download, so think before adding a dependency.
- Fonts are subsets in `assets/fonts/` (`npm run fonts`): icons come from `src/components/ui/iconGlyphs.json` (only icons whose names appear in `src/`), so after using a new icon or an unusual character run `npm run fonts`, or TypeScript rejects the icon name. Don't import `@expo/vector-icons` or `@expo-google-fonts/inter` index files (they ship every font).
- App icons come from `npm run icons` (`scripts/brand/build-icons.mjs`, needs `rsvg-convert`). Native icon changes show after the next `expo prebuild`/build.
- Accessibility: axe (WCAG 2.1 A/AA) is clean on every screen and resident screens work at 200% text (see `docs/VERIFICATION.md`). Keep it that way: roles with labels, `aria-checked` on checkboxes, list items inside lists, text that wraps (`flexShrink`, `maxWidth: '100%'`, `minWidth: 0` on inputs).
- Design follows the Figma file (mint `#CBFFDA`, green `#177A42`, white shadowed cards): tokens in `src/theme/tokens.ts` with contrast tests in `__tests__/theme.test.ts`. Every resident page uses `<Screen header={<AppHeader … />}>` (mint bar: back, page icon, left-aligned title), chips are mint when idle and green with a check when chosen, headline numbers sit on `Card variant="hero"`, and the Profile pages use `tone="mint"`. Pages before sign-in use `AuthShell`.
- "Mga abiso" is one list built by `buildFeed` (`features/alerts/feed.ts`): the barangay's alerts, what the City did on the resident's own reports and hauling requests, and points earned lately. It is calculated, never stored; unread uses `alertsSeenAt`.
- Newer features (resident accounts, private hauling with checkout, Eco Points and perks, the segregation scanner) sit behind `services.features`. With the sample data all are on and work in memory only (`services/mock/{account,hauling,rewards}.ts`, fixtures in `src/data/samples/`); with the pilot database all are off (`services/unavailable.ts`) until their tables and entry points exist, so hide their entry points with the flag. Every figure, perk and fee there is a sample and labelled so. No payment provider is connected: `HaulingPayment.sample` is always true and the checkout says so. The scanner answer is a sample too.
- Points are a list of entries; balance, tier and the week's streak are calculated from it (`features/rewards/points.ts`), never stored. A quotation not accepted in 24 hours is expired by rule (`haulingView` in `features/hauling/status.ts`), not by a stored status. Fees are added up in `features/hauling/pricing.ts`.
- `/sus` is the facilitator's usability-test page (SUS scoring in `features/usability/sus.ts`); participants are codes, never names. `docs/` holds the demo script, usability guide and verification record.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
