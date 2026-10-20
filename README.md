# Training Calendar

Personal lifting / core / cardio / body / meals tracker, shipped as an installable PWA.
Source of the app is a single page: [`docs/index.html`](docs/index.html).

## What's here

| Path | Purpose |
| --- | --- |
| `docs/index.html` | The app (HTML, CSS and JS in one file) |
| `docs/manifest.webmanifest` | PWA manifest (standalone, dark theme, icons) |
| `docs/drive-sync.js` | Syncs your data to a private file in your own Google Drive |
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
Everything derives from the single `START` constant in `docs/index.html`.

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

The training agent writes `next-week-plan.json` to the same folder. The app checks for it on open and when you return to the tab; a **New** badge appears on History when its `generatedAt` is newer than the last plan you applied. The review screen shows each change by lifting, core, cardio and meals with the old value, new value and the agent's reason, and you accept or reject each one. Changes tagged `auto` start accepted, `approval` ones start unaccepted. Applying writes `config/program` and `config/plan` and records what was accepted and rejected in `applied-plans`. The file is validated first (unknown fields, HIIT rounds over 16, Zone 2 over 60 minutes, protein changes and calorie changes over 150 kcal are rejected). The format is in [PLAN_SCHEMA.md](PLAN_SCHEMA.md); `scripts/verify-proposal.js` tests it.

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
