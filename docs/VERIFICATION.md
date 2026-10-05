# Verification record (plan §10, Sprint S7)

What was checked, how, and what is still open. Date of this record: 1 October 2026. All figures
in the app are sample data.

## Summary

| Check                               | Result                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| Static checks                       | Pass: `expo-doctor` 21/21, `tsc`, `expo lint`, Prettier            |
| Unit tests                          | Pass: 286 tests in 22 suites (2 October 2026)                      |
| Pilot database: SQL tests           | Pass: 415 checks in 8 files (see `supabase/README.md`)             |
| Pilot database: web app connected   | Pass for public reads; guest and staff flows wait on two settings  |
| Web, resident (phone width)         | Pass                                                               |
| Web, City ENRO (desktop width)      | Pass                                                               |
| Android (emulator, dev build)       | Pass                                                               |
| End-to-end "Aling Rosa's morning"   | Pass (see [DEMO.md](DEMO.md))                                      |
| Accessibility: automated (axe)      | Pass: 0 WCAG 2.1 A/AA violations on 29 screens                     |
| Accessibility: 200% text            | Pass on the resident screens checked                               |
| Accessibility: TalkBack walkthrough | **Not done** (needs a person with a phone)                         |
| Accessibility: colour-blind check   | **Not simulated**; by design every status has an icon and a label  |
| Lighthouse (mobile, slow 4G)        | Performance 82–84; accessibility, best practices, SEO 100          |
| Load in under 3 s (NFR-01)          | **Not met**: main content at about 4.5 s; first paint at about 1 s |
| PWA: installable and offline        | Pass                                                               |
| Usability test, SUS ≥ 70            | **Not run**: needs 5–8 residents ([guide](USABILITY_TEST.md))      |
| Real-phone GPS, screen off 15 min   | **Not done on a real phone** (emulator drive only, Sprint S4)      |

## Static checks and unit tests

```bash
npx expo-doctor && npx tsc --noEmit && npx expo lint && npx prettier --check . && npx jest
```

The unit tests cover every rule listed in the plan: point → barangay, ETA along the route,
vicinity alerts (target barangay only, once), every SMS template in one GSM-7 segment, missed
streets (60% within 30 m), the backup-truck suggestion (Truck 1 in the demo scenario), the
report lifecycle with the 48-hour reopen, priority scores, every "Hindi nadaanan" outcome, no
GPS after the shift ends, and Kolek's 50-question Taglish set (50 of 50 routed, no invented
facts). Sprint S7 added SUS scoring and the "streets not yet due" statistics rule.

## Web and Android

- Resident screens at phone width (375 px) and City ENRO at desktop width (1440 px).
- Android emulator (Pixel 8, development build): Home, the native map, Kolek with the keyboard
  open, and the full report wizard with the camera and GPS (Sprint S5).
- Three tabs of one browser (resident, driver, City ENRO) react to each other: the driver's
  **PUNO** raises the City ENRO alert.

## Accessibility

- **axe-core, WCAG 2.1 A and AA rules, on 29 screens:** 11 resident screens, 3 onboarding
  steps, 4 driver screens, 8 City ENRO pages, the demo page, a report detail page and the
  usability page. Five problems were found in shared components and fixed: the barangay list
  markup, the consent checkbox (`aria-checked`), map pins without a role, unlabelled
  thumbnails, and the schedule grid that could not be scrolled with the keyboard.
- **200% text:** resident screens were loaded at half width (the same as 200% zoom on a phone).
  Fixed: the Home status title, suggestion chips, status pills and text inputs now wrap or
  shrink instead of running off-screen.
- **Contrast:** the colour tokens are tested for WCAG AA contrast in `__tests__/theme.test.ts`.
- **Not done:** a TalkBack walkthrough on a phone, and a colour-blindness simulation.

To repeat the axe audit: copy `node_modules/axe-core/axe.min.js` into `public/` (do not commit
it), open the app in the browser, load each route and run
`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })`.

## Performance (Lighthouse 12, mobile, simulated slow 4G)

Measured on the production build (`npm run build:web`) served with compression
(`npx serve -s dist`).

| Page (first visit)     | Performance | First paint | Main content (LCP) | Speed Index | Page weight |
| ---------------------- | ----------- | ----------- | ------------------ | ----------- | ----------- |
| `/` → demo page        | 82          | 1.1 s       | 4.7 s              | 2.2 s       | 513 KB      |
| `/onboarding/language` | 84          | 0.9 s       | 4.5 s              | 1.8 s       | 514 KB      |

Accessibility, best practices and SEO score 100 on both.

What changed in Sprint S7 (the first measurement was performance 19, with a 4.7 MB page):

- Route-based code splitting (Expo async routes on web).
- maplibre-gl loads only on screens with a map, from `public/maplibre/`.
- Icon font cut from 1.3 MB to 27 KB (192 of 7,448 icons); Inter from 336 KB to 106 KB per
  weight; text shows before the fonts arrive.
- First-load JavaScript went from 1.04 MB to about 480 KB (compressed).

**Open:** the main content appears at about 4.5 s on Lighthouse's slow-4G phone, above the 3 s
target. Almost all of the remaining first-load code is the framework (expo-router,
react-native-web, react-dom). The next step would be static rendering (`web.output: "static"`),
which sends ready HTML before the JavaScript; it is possible now that the map library no longer
loads at startup, but it needs its own testing.

**Hosting must** compress responses (gzip or Brotli) and send unknown paths to `index.html`.
Without compression the same page weighs 4.7 MB.

## PWA

- `public/manifest.json`, icons (192, 512, maskable 512, Apple touch icon) and
  `public/index.html` with the theme colour and description.
- `npm run build:web` exports the site and generates the service worker (Workbox): 80 files,
  3.95 MB uncompressed, precached after the first visit; recently seen map tiles are kept for
  7 days.
- Checked: with the server stopped, the app still opens from the cache, including deep links.
- The service worker is registered only in production builds, and new versions take over on
  the next visit.

## Pilot database (Stage 2, 2 October 2026)

- **The app on the database:** with `.env.local`, the web app reads the shared clock, schedules,
  truck events, announcements and sample tickets from the pilot database through `pulse` (one
  request per tick; a set is read again only when its fingerprint changes). Checked in the
  browser: the demo page (server time, trucks computed from the stored schedule, the shared
  clock notice for non-admins), resident Home and alerts, "Aking mga report", the City ENRO
  sign-in screen.
- **Refusals are shown, not lost:** with anonymous sign-ins still off on the project, sending a
  report stays on the review step with a message (the guest identity could not be made); a
  refused pending report is kept with a "Remove" button instead of being retried forever.
- **First load:** 493 KB of compressed JavaScript (479 KB before): the client is written on
  `fetch` instead of adding `@supabase/supabase-js` (about 45 KB more).
- **Not yet checked end to end:** resident reports, text sign-up, truck sign-in and uploads
  (they need **Anonymous sign-ins** turned on in the Supabase dashboard), and the City ENRO
  dashboard signed in (needs the admin's password typed by a person). Their database side is
  covered by the SQL tests (04, 05, 06, 08) and their client side by unit tests with a fake
  server (`__tests__/supabaseClient.test.ts`). Photo upload from the Android app (file bytes
  through `expo-file-system`) has not run on a phone yet.

## Still open before the pilot

1. Usability test with 5–8 residents and the SUS score ([guide](USABILITY_TEST.md)).
2. TalkBack walkthrough and a colour-blindness check with real users or a simulator.
3. Real-phone field test of the driver app: screen off for 15 minutes, airplane-mode gaps.
4. Load time under 3 s on a slow connection (static rendering).
5. Screen recordings for the pitch (follow [DEMO.md](DEMO.md); screenshots are in
   `docs/screenshots/`).
