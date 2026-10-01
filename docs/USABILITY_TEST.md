# Usability test guide (Sprint S7)

**Goal:** check that ordinary Carmona residents can use KolektaPH without help, and measure it
with the System Usability Scale (SUS). **Target: an average SUS score of 70 or higher.**

This test has not been run yet. The prototype is ready for it; the numbers must come from real
residents.

## Who

- **5 to 8 residents of Carmona**, not people who helped build the app.
- Include at least **two seniors** and at least **one person who rarely uses a smartphone**.
- Mix barangays if you can (a Poblacion barangay and a larger one such as Milagrosa or Lantic).

## What you need

- An Android phone with the app, or a phone browser open at the web app. Use the participant's
  own phone if they prefer.
- The facilitator's own phone or laptop open at **`/sus`** (Demo page → "Usability test (SUS)")
  to record the SUS answers. Answers stay on that device under a code (P1, P2…), not a name.
- This guide, a timer, and a notebook. One person facilitates; a second person takes notes.
- Before each session: `/demo` → **I-reset ang lahat ng demo data**, then set the demo clock to
  **Martes 7:25 AM** so a truck is on its way, and delete the previous participant's settings
  (Resident → Settings → "Burahin ang data ko").

## Consent (read aloud)

> "Sinusubukan po namin ang app na KolektaPH, hindi kayo. Walang tama o maling sagot. Kung may
> mahirap gawin, problema iyon ng app, hindi ninyo. Hindi namin isusulat ang pangalan ninyo, at
> puwede kayong huminto anumang oras. Mga 20 minuto po ito. Puwede po ba kaming magsulat ng
> mga napansin namin habang ginagamit ninyo ang app?"

Do not record video or audio unless the participant clearly agrees. Do not collect names,
addresses or real mobile numbers (for the SMS task, the participant may type any number; the
prototype sends nothing).

## Tasks

Read each task as written. Do not point at the screen or explain. If the participant is stuck
for more than a minute, note it, help them move on, and mark the task as "needed help".

| #   | Say to the participant                                                                  | Success means                                               | Target                 |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| 1   | "Buksan ang app at ihanda ito para sa barangay ninyo."                                  | Finishes onboarding with a barangay chosen                  | under 2 minutes        |
| 2   | "Kailan darating ang truck ng basura sa inyo?"                                          | Says the time or status shown on Home                       | **10 seconds or less** |
| 3   | "Gusto ninyong ma-text kapag malapit na ang truck. I-on ito."                           | Text alerts turned on (during onboarding or in Settings)    | under 2 minutes        |
| 4   | "May tambak ng basura sa bakanteng lote malapit sa inyo. I-report ito."                 | Report sent; participant sees the ticket number             | **60 seconds or less** |
| 5   | "Hindi dinaanan ng truck ang kalye ninyo kaninang umaga. Ano ang gagawin ninyo sa app?" | Opens "Hindi nadaanan ang kalye namin" and reads the result | under 2 minutes        |
| 6   | "Tanungin si Kolek kung saan itatapon ang lumang baterya."                              | Asks in their own words and reads the answer                | under 2 minutes        |
| 7   | "Tingnan kung ano na ang nangyari sa report na ginawa ninyo."                           | Opens the report and finds its status                       | under 1 minute         |

For each task, note: **done alone / needed help / gave up**, the **time**, where they hesitated,
and what they said. Write their words, not your interpretation.

## After the tasks

1. Open `/sus` on the facilitator's device and enter the participant's code (P1, P2…).
2. Read each of the 10 statements aloud (the page shows them in Filipino or English). The
   participant answers from 1 (lubos na hindi sang-ayon) to 5 (lubos na sang-ayon). Do not
   explain or rephrase the statements; if one is unclear, repeat it.
3. Save. The page shows the participant's score and the running average.
4. Ask two open questions and write the answers down:
   - "Ano ang pinakamahirap o pinakanakalilito?"
   - "Ano ang pinakanagustuhan ninyo?"

## Scoring

- The `/sus` page computes each score (0–100) and the average, and exports a CSV.
- **70 or higher on average with at least 5 participants** meets the Sprint S7 target. 68 is the
  usual average across products; below 50 means serious problems.
- SUS alone is not enough. Also report, per task: how many finished alone, the median time, and
  whether tasks 2 and 4 met their targets (10 seconds and 60 seconds).

## What to do with the results

- Fix anything two or more participants stumbled on before the pilot.
- Problems only seniors or the infrequent user had are still problems: they are the people the
  app is for.
- Have barangay staff review the Filipino wording wherever participants misread something.
- Keep the notes and the CSV with the project documents; they contain no names.

The Filipino SUS statements in the app are our own translation of the standard English ones.
If the City or a partner university has a validated Filipino SUS, use that wording instead.
