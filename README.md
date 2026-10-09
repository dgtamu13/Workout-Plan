# Training Calendar

Personal lifting / core / cardio / body / meals tracker, shipped as an installable PWA.
Source of the app is a single page: [`docs/index.html`](docs/index.html).

## What's here

| Path | Purpose |
| --- | --- |
| `docs/index.html` | The app (HTML, CSS and JS in one file) |
| `docs/manifest.webmanifest` | PWA manifest (standalone, dark theme, icons) |
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

## Data

Workouts, drafts and settings are stored in the browser's `localStorage` on each device,
so they are not synced between devices. CSV export (History tab) downloads a file directly.

## Updating the service worker

Bump `CACHE` in `docs/sw.js` whenever you change cached files so installed copies refresh.
