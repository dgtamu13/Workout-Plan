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

## Data

Everything is saved on the device first (browser `localStorage`), so the app works offline.
To use it on more than one device, open **History → Data & sync → Connect Google Drive**.
Data then syncs to one JSON file in this app's hidden Drive folder (`appDataFolder`), which only this app can see.
Merging is per record, newest edit wins. Use **Export backup / Import backup** to move data by hand
(for example to load your meal plan on a new device).

Google sign-in uses an OAuth client ID with the `drive.appdata` scope, authorized for `https://dgtamu13.github.io`.
The client ID in `docs/drive-sync.js` is public by design. While the Google app is in Testing mode, only listed test users can sign in.

## Updating the service worker

Bump `CACHE` in `docs/sw.js` whenever you change cached files so installed copies refresh.
