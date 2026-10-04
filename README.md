# Class schedule prototype

A responsive, Apple Calendar-inspired class timetable with day, week, and month views. Desktop opens in week view; mobile opens in day view. The app reads a normalized snapshot of the real [IDEIS plan 1000](https://harmonogram.krakow.ideis.pl/Plany/PlanyTokow/1000).

[Open the shared calendar](https://michaelsakhnenko.github.io/class-schedule-app/)

The dark theme is the default. The sun/moon button switches to a warm light theme and saves the choice in browser storage.

On desktop, the button at the top left hides or restores the sidebar. The calendar expands smoothly, and the sidebar choice is saved in browser storage.

## Run locally

```bash
npm install
npm run dev
```

## Data boundary

The UI loads `ClassEvent` objects through `getSchedule()` in `src/data/schedule.js`, which fetches `public/schedule.json`. The same file documents the normalized event shape. The browser refreshes the snapshot every ten minutes and when the tab becomes visible. It never substitutes fabricated classes when the snapshot cannot be loaded.

Dates and times are local to `Europe/Warsaw`. The verified source forms for the current semester are `Wyk`, `Cw`, and `Konw`, mapped to `lecture`, `exercise`, and `seminar`. Unmapped forms can use `other` while retaining their source label in `typeLabel`. The visual mapping lives in `CLASS_TYPES` and CSS `type-*` classes; class types appear in event details.

## Live data integration findings

On 3 October 2026, selecting **Cały semestr** and **Szukaj** on plan 1000 loaded 146 rows for 1 October 2026–21 February 2027. The site sends a DevExpress `POST` to `/Plany/PlanyTokowGridCustom/1000`; the rendered `#gridViewPlanyTokow_DXMainTable` contains the date groups and all fields needed by `ClassEvent`. The CSV link still targeted the current day after the full-semester search and its output omitted the class form and instructor. A direct iCal request returned an error page.

`npm run sync:schedule` runs the Playwright importer, validates the full-semester grid, and atomically updates `public/schedule.json` only when the timetable changes. It retains events outside the newly fetched semester and leaves the last valid file intact if the source fails. Install the browser once with `npx playwright install chromium`.

## GitHub Pages

The included [workflow](.github/workflows/sync-schedule.yml) checks the source every two hours, commits a changed snapshot, and publishes the same run to GitHub Pages. A code push or manual run also builds and publishes the app. Scheduled runs skip deployment when the timetable is unchanged. The build automatically uses `/` for a `USERNAME.github.io` repository or `/<repository>/` for a project repository, including the `schedule.json` request.

The public repository is [michaelsakhnenko/class-schedule-app](https://github.com/michaelsakhnenko/class-schedule-app), with Pages set to **GitHub Actions**. A successful first sync and deployment ran on GitHub's runner. Later code pushes and changed timetable snapshots publish through the same workflow. If the source website becomes unavailable, the sync job fails and leaves the last published snapshot in place.

The plan contains common `W/3/ZS`, `cw/3/ZS`, and `konw/3/ZS` rows, plus four parallel English groups (`1 angPrad B1/3/ZS`, `2 angPrad B1+/3/ZS`, `4 angNow B2+/3/ZS`, and `5 angNow C1/3/ZS`). Each visitor selects their English group; it is saved in their browser. Until then, the app shows the common classes and leaves out parallel English classes.
