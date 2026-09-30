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
- No database or backend in this phase. Screens call only `src/services/` interfaces; mock implementations and the deterministic simulator live behind them. Don't import mock data directly into screens.
- Domain logic (ETA, vicinity SMS, missed streets, report lifecycle, Kolek intents) is pure TypeScript in `src/features/` and is unit-tested.
- Every user-facing string goes through i18n (`src/i18n/`). Sample numbers must be labelled as sample data.
- Maps are MapLibre only: `KMap.web.tsx` (maplibre-gl) and `KMap.tsx` (native, @maplibre/maplibre-react-native), sharing the layer specs in `layers.ts`. Keep both in sync. Don't add react-native-maps.
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
- `stores/backend.ts` stands in for the server; on web, `stores/tabSync.web.ts` reloads shared stores when another tab writes them (the driver ↔ ENRO demo bridge). Screens never read it directly.
- Reports are `Ticket`s changed only through `applyAction` (`features/reports/lifecycle.ts`: HAKOT Fig. 4, roles per action, 48-hour reopen, auto-close). Priority (`priority.ts`, HAKOT App. B.2) and dispatch (`dispatch.ts`) are suggestions computed from the ticket list; they are never stored and never act on their own.
- Crew work on a ticket is a `task` `TruckEvent` (start / done with before and after photos); the backend turns it into lifecycle actions, so it goes through the same offline queue as every other driver tap.
- "Hindi nadaanan" claims are judged by `judgeClaim` (`features/claims/missed.ts`, HAKOT §10.2) from the same coverage check as the ENRO missed-streets page. A claim opens at most one MISSED ticket per street per day.
- Photos: native uses live camera capture only (`PhotoCapture.tsx`, no gallery) and web uses a file input with `capture`. `compressPhoto` only scales down (1280 px native, 960 px web as a data URI). Sample tickets use `SamplePhoto` drawings labelled as sample photos. Never present them as real.
- Location readings for residents pass `mayShowUserSettingsDialog: false`, so declining Google's "Location Accuracy" prompt can't block the pin. If there's no fix, the pin starts at the barangay and the resident moves the map.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
