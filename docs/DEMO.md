# KolektaPH demo script (pitch slides 10–15 and 17)

A walk-through of the prototype that follows the pitch deck's solution slides and Aling Rosa's
morning. Everything shown is **sample data**: the app labels it ("Halimbawang datos"), and you
should say so too.

Screenshots of each step are in [`docs/screenshots/`](screenshots/). Record your own videos by
following the same steps (set the demo clock to ×10 to see the trucks move).

## Before you present (2 minutes)

1. Run the web app (`npx expo start --web`) and open `/demo`.
2. Tap **I-reset ang lahat ng demo data** (bottom of "Mga pangyayari"), so earlier tests don't show.
3. Open three browser tabs of the same browser. They share one mock server, like three devices:
   - **Resident**: `/demo` → _Residente_. First time only: choose Filipino, pick **Milagrosa**,
     and turn on text alerts (the demo code is shown on screen).
   - **Driver**: `/demo` → _Driver_. Sign in as **Truck 3** with PIN `1234` (don't start the
     shift yet).
   - **City ENRO**: `/demo` → _City ENRO_.
4. Keep the `/demo` page handy: its **Tumalon sa oras** buttons move every tab to a moment of
   the story.

| Demo clock button                 | Moment in the story                          |
| --------------------------------- | -------------------------------------------- |
| Lunes 6:00 PM · bisperas          | Night-before reminder goes out               |
| Martes 6:55 AM · bago umalis      | Trucks still at the depot                    |
| Martes 7:25 AM · papalapit        | "15 minutes away" text to Milagrosa          |
| Martes 7:55 AM · puno ang Truck 3 | Truck 3 is full with streets left in Mabuhay |
| Martes 11:30 AM · tapos na        | Routes finished; missed streets are final    |

## Slide 10 · Live truck tracker

Clock: **Martes 7:25 AM**. Resident tab → **Mapa**.

- Every active truck is on one Carmona map, with all 14 barangays.
- Tap **T2**: "Truck 2 · Nasa ruta · Darating sa Milagrosa mga 7:39 AM", with its load.
- Set the speed to ×10 on `/demo` for a few seconds to show the truck moving.
- Driver tab: the tracker is the driver's phone. Open **GPS at pagpapadala** to show that
  location is recorded only during a shift, and keeps working without signal.

Screenshot: `slide-10-live-map.jpg`

## Slide 11 · Route preview

Same map → **Ang barangay ko**.

- Solid green line = streets already collected; dashed line = streets still to come.
- Time labels on the upcoming streets show when the truck is expected.
- **Listahan** shows the same information as a list (for screen readers and small screens).

Screenshot: `slide-11-route-preview.jpg`

## Slide 12 · Barangay SMS alerts

Resident tab → bell icon (**Mga abiso**).

- 7:24 AM: "KolektaPH: Milagrosa, 15 min na lang bago dumating ang garbage truck (~7:40 AM).
  Ilabas na po ang basura. Salamat!" (word for word the pitch sample).
- Below it, Monday 6:00 PM: the night-before reminder.
- City ENRO tab → **SMS at anunsyo**: the outbox shows that only Milagrosa got that text, how
  many registered numbers, and that it fits one SMS. Other barangays get theirs when the truck
  approaches them.
- Home says **"Ilabas na ang basura!"** at the same moment.
- Delay alert: on `/demo`, tap **Masira ang Truck 2 ngayon** and show the delay text arriving
  (reset afterwards).

Screenshot: `slide-12-sms-alerts.jpg`

## Slide 13 · Ask Kolek

Resident tab → **Kolek**. Type the pitch's own questions (or tap the suggestion chips):

1. `Kailan po ang next na kolekta sa Milagrosa?` → the schedule from the same data as the
   Schedule screen, with a button to open it (and, when text alerts are off, an offer to turn
   them on).
2. `May nagtapon ng basura sa bakanteng lote.` → reporting steps and a button that opens the
   report with "Tambak o illegal na tapunan" already chosen.
3. `Ilang tons na ang nakolekta sa Milagrosa ngayong buwan?` → month-to-date tonnes and streets
   served for Milagrosa, labelled as sample data.
4. `Magkano ang multa?` → Kolek says it has no official information and gives the barangay and
   City ENRO contacts. It never invents fees, schedules or numbers.

Say plainly: this Kolek is rule-based. It already answers only from KolektaPH's data; the
language model described in the pitch plugs into the same interface later.

Screenshot: `slide-13-ask-kolek.jpg`

## Slide 14 · Truck load and missed-street monitor

Clock: **Martes 7:55 AM**. City ENRO tab → **Live Operations**.

- "Karga ng truck ngayon": load per truck; Truck 3 shows **Puno**.
- Alert: "Truck 3 ay PUNO na, may 3 kalye pang natitira sa Mabuhay. Mungkahi: ipadala ang
  Truck 1." Staff choose **Ipadala** or **Balewalain**: it is only a suggestion.
- "Mga kalyeng hindi nadaanan ngayon (GPS check)": the three Mabuhay streets, with the reason.
- Live version: reset, go to 7:25 AM, start Truck 3's shift in the Driver tab and tap **PUNO**.
  The alert appears in the City ENRO tab within a couple of seconds.
- Resident side: Home → **Hindi nadaanan ang kalye namin** checks a street against the truck's
  GPS and answers at once.

Screenshot: `slide-14-enro-live-ops.jpg`

## Slide 15 · Report and emergency pickup

Resident tab → **Report**.

- Four steps: what is the problem → photo → where → send. A first-time user finishes in under a
  minute and gets a ticket number (KPH-2026-…) with the response target.
- **Emergency** (hazardous waste, flood debris, burning) goes to the top of the queue.
- City ENRO tab → **Mga report**: sorted by priority, with the suggested handling. Dispatch it
  to a truck; in the Driver tab it appears under "Espesyal na koleksyon", and the crew closes
  it with before and after photos.
- Resident tab → **Aking mga report**: the timeline ends at "Nakolekta" with the crew's photo.
  A sample of the finished state: `/resident/reports/KPH-2026-000110`.

Screenshots: `slide-15-report-wizard.jpg`, `slide-15-ticket-collected.jpg`

## Slide 17 · Same Milagrosa, different morning

Run the clock buttons in order with the Resident tab on **Bahay**:

| Pitch moment                              | In the prototype                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| 6:00 PM · text: collection tomorrow       | Lunes 6:00 PM → Mga abiso shows the reminder                             |
| 7:25 AM · "15 minutes away"               | Martes 7:25 AM → text at 7:24, Home: "Ilabas na ang basura!"             |
| 7:41 AM · collected                       | ×10 from 7:25: by about 7:40 Home says "Nasa barangay mo na ang truck"   |
| Later · the reported pile shows Collected | Martes 11:30 AM → "Nadaanan na ang Milagrosa"; open the collected ticket |

Note: Home says "Nadaanan na" once the truck has finished the whole barangay (8:55 AM in the
sample route), not when it passes one house. Say "the truck reached Milagrosa at about 7:40".

## If something goes wrong

- A tab looks stale: reload it; the demo clock and data are shared.
- Start over: `/demo` → **I-reset ang lahat ng demo data**, then **Bumalik sa totoong oras**.
- No internet: the app still works (the data is in the app); only the map background needs it.
