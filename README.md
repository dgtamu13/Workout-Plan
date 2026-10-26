# Training Calendar

Personal lifting / core / cardio / body / meals tracker, shipped as an installable PWA.
Source of the app is a single page: [`docs/index.html`](docs/index.html).

## What's here

| Path | Purpose |
| --- | --- |
| `docs/index.html` | The app (HTML, CSS and JS in one file) |
| `docs/manifest.webmanifest` | PWA manifest (standalone, dark theme, icons) |
| `docs/drive-sync.js` | Syncs your data to a private file in your own Google Drive |
| `docs/program.js` | The built-in lifting program, its validation, and conversion to the rows the app renders |
| `docs/machines.js` | Machine registry, units (lb, kg, plate numbers) and the calibration that converts loads between machines |
| `docs/sheets-sync.js` | Publishes to a Google Sheet and reads the training agent's plan |
| `docs/plan-proposal.js` | Validates, diffs and applies the agent's `next-week-plan.json` |
| `PROGRAM_SCHEMA.md`, `PLAN_SCHEMA.md` | The `config/program` and `next-week-plan.json` formats, with full examples |
| `training-agent-spec.md` | The rules the training agent follows (v0.2) |
| `scripts/` | Node tests (`npm test`) and their fixtures |
| `docs/sw.js` | Service worker: precaches the app shell, works offline |
| `docs/vendor/chart.umd.js` | Chart.js 4.4.1, bundled so charts work offline |
| `docs/icons/` | App icons (SVG source plus PNGs) |
| `.github/workflows/pages.yml` | Deploys `docs/` to GitHub Pages on push to `main` |

## Deploy

1. Merge to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions** (one-time).
3. The workflow publishes to `https://<user>.github.io/Workout-Plan/`.

## Install

Open the site on your phone, then **Share → Add to Home Screen** (iOS Safari) or **Install app** (Chrome/Android).

## Program

A 28-week plan that repeats a 7-day cycle counted from Day 1 (not tied to weekdays): PUSH A, PULL A, LEGS A (hypertrophy), PUSH B, PULL B, LEGS B (strength), then REST.
Everything derives from the single `START` constant in `docs/index.html`. Day 1 (PUSH A) is Sat 2026-10-24, so program weeks run Saturday to Friday and the Friday of each week is a rest day.

When you take an unplanned rest day, add its date to the `REST_DAYS` constant next to `START`: that day shows as REST and the whole schedule after it moves a day later (weeks, deloads and the end date included). Sun 2026-10-25 is the first one, so Mon 2026-10-26 is PULL A (Day 2).

| Phase | Weeks |
| --- | --- |
| 1 Reclaim | 1–6 |
| 2 Build | 7–14 |
| 3 Lean | 15–22 |
| 4 Peak | 23–28 |

Deloads follow the training agent spec: every 5th working week (weeks 5, 10, 15, 20 and 25). A deload week cuts lifting sets, HIIT rounds and Zone 2 time by 40% at the same weights. A pull-forward deload (`deloadWeeks` in `config/program`) is also a deload week and restarts the 5-week count.

`scripts/verify-plan.js` (`npm test`) checks dates, phases, deloads, the plan tables and the progression rules.

### Program document

The exercises, core circuits and cardio prescriptions are data, not code. The app renders from the `config/program` document in the sync store when it exists and is valid, and falls back to the built-in program in `docs/program.js` (which also seeds the document). The phase and deload rules apply on top of it. The backup export includes `config/program` and import restores it. See [PROGRAM_SCHEMA.md](PROGRAM_SCHEMA.md) for the schema and a full example. `scripts/verify-program.js` checks validation and that the built-in program renders exactly as before.


### Google Sheet and weekly plan proposals

**Data & sync → Google Sheet** (History tab) publishes workouts, body, meals and check-ins, plus the current program and meal plan (Program and Meal Plan tabs), to a Sheet in a Drive folder called "Training Calendar Data" after every submit. It needs the Google Sheets API turned on for the Cloud project and the `drive.file` and `spreadsheets` scopes on the consent screen, then tap Connect.

The training agent writes the plan JSON into the Sheet's `Plan` tab (or `next-week-plan.json` in the folder). The app checks for it on open and when you return to the tab; a **New** badge appears on History when its `generatedAt` is newer than the last plan you applied. The review screen shows each change by lifting, core, cardio and meals with the old value, new value and the agent's reason, and you accept or reject each one. Changes tagged `auto` start accepted, `approval` ones start unaccepted. Applying writes `config/program` and `config/plan` and records what was accepted and rejected in `applied-plans`. The file is validated first: unknown fields, HIIT rounds over 16 or more than 4 HIIT sessions, Zone 2 over 60 minutes, protein changes, calorie changes over 150 kcal or inside the 14-day lockout, and stall swaps that are not backed by 3 logged stalled sessions or that change muscle group or movement pattern are all rejected. Stall swaps start accepted; the newest applied plan can be undone. The format is in [PLAN_SCHEMA.md](PLAN_SCHEMA.md); `scripts/verify-proposal.js` tests it.

## Workout days

On Lifting, Core and Cardio, every section collapses: the phase banner, the overload plan, and each exercise (its header keeps the name, plan and sets logged, for example "Incline DB Press · 4 × 10–15 · 2/4 sets"). Tap a header to fold it, or use **Collapse all / Expand all**.

The **Skip today's lifting / core / cardio** switch at the top of the day logs the whole workout as skipped, with an optional reason (rest, sick or injured, travel, no time, no equipment, other). It shows in History with a Skipped badge and in the Sheet and CSV as `Workout Skipped` = Yes plus the reason; it does not count toward the streak, consistency or progression. Turning the switch off removes the skip so you can do the workout after all.

Each lift has a **Machine** picker under its plan. Machines are shared across exercises (add one with **+ Add a machine…**: name, whether the stack shows pounds, kilograms or plate numbers, optionally the weight of one plate and the smallest jump). The weight you type is the number on that machine. The first machine an exercise is logged on (or its earlier unlabeled sessions) is its reference; the first session on a different machine is a calibration session (targets show "? lb", you pick a working weight at the planned RIR), and from then on targets, last-session numbers, e1RM and PRs are converted between machines, so a switch never looks like a PR or a stall. The factor is worked out from the sessions either side of each switch (median of the last five), and **Adjust** lets you type your own ("1 lb here ≈ 0.8 lb on Precor"), go back to auto, make a machine the reference, or say which machine earlier unlabeled sessions were on. The registry syncs as `config/machines`, and the Sheet gets a `Machines` tab plus `Machine`, `Unit`, `Ref Weight (lb)` and `Ref Machine` on every lift row. Folds do not re-render the page, so typing and scroll position are left alone, and the closed ones are remembered on the device.

## Data

Everything is saved on the device first (browser `localStorage`), so the app works offline.
To use it on more than one device, open **History → Data & sync → Connect Google Drive**.
Data then syncs to one JSON file in this app's hidden Drive folder (`appDataFolder`), which only this app can see.
Merging is per record, newest edit wins. Use **Export backup / Import backup** to move data by hand
(for example to load your meal plan on a new device).

Google sign-in uses an OAuth client ID with the `drive.appdata` scope, authorized for `https://dgtamu13.github.io`.
The client ID in `docs/drive-sync.js` is public by design. While the Google app is in Testing mode, only listed test users can sign in.

## Cardio records

A cardio record is one exercise: `planned` (HIIT or Zone 2), `machine`, `duration`, `hr`, `maxhr`, `distance`, `rounds`, `level`.
HIIT records can also carry four optional numbers: `workSec`, `restSec`, `avgWatts` and `hrRec60` (heart-rate drop in the first 60 seconds after the last round).
Older records without them stay valid. They appear in the workout CSV as **Work (s)**, **Rest (s)**, **Avg Watts** and **HR Recovery 60s** (the last four columns).
The Progress tab charts average watts per session, compared only within the same machine and work:rest protocol, with a baseline reset wherever either changes.
The app warns when HIIT rounds exceed 16 or a Zone 2 session passes 60 minutes.

## Updating the service worker

Bump `CACHE` in `docs/sw.js` whenever you change cached files so installed copies refresh.

Pages and the app's own scripts load network-first (revalidated each time), so a phone never runs new HTML against scripts from an older release; the cached copies are only the offline fallback. Icons and the bundled chart library are cache-first. When a new version takes over while the app is open, a bar offers **Reload**. If the app's own code throws, a red bar at the bottom shows the error with **Reload** and **Reset app files** (clears the cached files and service worker, keeps your data); **History → Data & sync** shows which build is running.
