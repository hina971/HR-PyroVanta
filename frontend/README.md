# FireFusion AI — Frontend

React + Vite + TypeScript + Tailwind CSS (v4) frontend for NASA Space Apps
Challenge 2026, team #786 — Challenge: Harmonization of MODIS and VIIRS Hot
Spots. A faithful port of the FINAL approved UI demo (round 20, rated 8/10,
"Perfect"): same layout, same Ember Dark colours, same fonts, same planets /
ISS / animations, same mission control, map, calendar, FIRA and Inspector.
No redesign, no new features, no invented data.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

## Backend (`VITE_API_URL`)

The app talks to the FastAPI backend's `/api/v1` endpoints (see
`src/lib/api.ts`: meta, summary, detections, detections/{id}, daily,
comparison, anomalies, fira, downloads, health).

```bash
# .env (copy .env.example) — default is the local backend:
VITE_API_URL=http://localhost:8000
# Deployed backend, e.g.:
# VITE_API_URL=https://firefusion-ai-api.onrender.com
```

With Vite, `VITE_API_URL` is read at **build** time, so rebuild (or restart
`npm run dev`) after changing it. In local dev, relative `/api` calls are
also proxied to `http://localhost:8000` (see `vite.config.ts`).

## Offline fallback (demo / sample data)

If the backend is unreachable, the app falls back to the embedded sample
data in `src/data/sample.ts` — the demo's exact numbers and points
(SEASON: MODIS 18,432 · VIIRS 42,891 · matched 11,928 · ambiguous 1,847;
110 procedurally generated map points + hero point id 999; August 2023
calendar with Aug 19 the hottest day, 1,431 detections) — and still renders
exactly like the approved demo. The sample labelling stays visible wherever
the demo labels it ("DEMO VALUES", "ALL NUMBERS BELOW ARE DEMO / SAMPLE
VALUES", "Demo sample data"). No live FIRMS calls, no API keys.

## Fonts (offline)

Fonts come from `@fontsource` packages (Unbounded 500/600/700/800, Inter
400/500/600/700, JetBrains Mono 500/600), imported in `src/main.tsx`. There
is deliberately **no Google Fonts `<link>`** anywhere — the demo must work
without internet.

## Photos

The 11 unique real NASA photographs from the demo live in
`public/assets/` (nebula, milkyway, galaxy-a, galaxy-b, saturn, moon,
earth, jupiter, mars, iss, hubble) and are referenced from `src/tokens.css`.
Footer photo credits are copied exactly from the demo.

## Structure

```
src/
  App.tsx                 shell: hero + mission control
  tokens.css              demo <style> ported verbatim (Ember Dark tokens)
  main.tsx                entry + @fontsource imports
  store.ts                Zustand: selected day, layers, view, selected point
  lib/api.ts              typed fetch client for /api/v1
  data/sample.ts          embedded fallback sample data (labelled demo data)
  hooks/useCountUp.ts     demo's cubic-out count-up
  components/
    SpaceBackdrop.tsx     starfield canvas, meteors, parallax, real photos
    Hero.tsx              Act 1: top bar, headline, hero stats, hero map
    LeftRail.tsx          region, layer toggles, matching rules, reset
    KpiStrip.tsx          count-up KPI cards
    FireMap.tsx           div-based dot map (no Leaflet, no tiles — as demoed)
    CalendarDock.tsx      burning-activity heatmap, Jul/Aug/Sep 2023
    ComparisonLab.tsx     sensitivity bars + why VIIRS sees more
    FiraPanel.tsx         streaming template narration
    Inspector.tsx         clicked point / matched-pair evidence
    Footer.tsx            attribution + photo credits (verbatim from demo)
```

## Hard rules (framework §11)

1. Raw detection counts are never labelled as counts of unique real fires.
2. Ambiguous groups are never shown or counted as confirmed matches.
3. Anomaly flags are statistical deviations — never "predictions".
4. FIRA never invents causes, impacts, burned area, or casualties.
5. FRP values are never added across sensors.
