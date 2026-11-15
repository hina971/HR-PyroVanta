# FireFusion AI

**Two satellites see fire differently. FireFusion AI shows how they differ, where they agree, and what it means.**

NASA Space Apps Challenge 2026 · Team #786 · Challenge: *Harmonization of MODIS and VIIRS Hot Spots*

**Live demo:** https://hr-pyro-vanta.vercel.app

---

## What it is

FireFusion AI is a web app that harmonizes NASA **MODIS** and **VIIRS** active-fire detections into one explorable view for a selected area: an interactive map, a burning activity calendar, a sensor comparison lab, and a data-grounded storyteller called **FIRA**.

It does **not** claim to count real-world fires. It shows how the two sensors agree and differ, and it keeps every original observation.

**Case study:** California, USA, 1 July – 30 September 2023 (August 2023 is the featured month).

## Headline results (real NASA FIRMS data)

| | |
|---|---|
| Records | **39,899** (MODIS 3,721 · VIIRS 36,178) |
| Satellites | Terra, Aqua (MODIS C6.1) · NOAA-20, S-NPP (VIIRS 375 m) |
| Confirmed one-to-one matched pairs | **98** |
| Ambiguous candidate groups | **954** |
| Unmatched records | **23,559** |
| Match coverage | MODIS 98 of 3,462 eligible (2.83%) · VIIRS 98 of 34,819 eligible (0.28%) |
| Busiest day | 19 August 2023 (2,111 detections) |
| Flagged days / critical periods | 36 / 5 |

## Features

- **Dashboard:** detection counts by sensor, matched, ambiguous and unmatched records, match coverage with numerators and denominators.
- **Interactive fire map:** layers by sensor and matching status, click a point to inspect it, a "How matching works" explanation.
- **Burning activity calendar:** daily MODIS and VIIRS activity, anomaly days outlined, click a day to filter everything.
- **Sensor comparison lab:** sensitivity to distance (0.5 / 1 / 2 km) and time window (1 / 4 / 6 h) for each satellite pair, FRP correlation, confidence and day/night splits.
- **FIRA storyteller:** template-driven narration. Every number comes from computed results. It never invents causes, impacts or casualties.
- **Downloads:** `harmonized.csv` and `comparison.csv`.

## How it works

```
NASA FIRMS files → preprocessing → harmonization (Python) → exports → React app
```

- The Python pipeline does all the science: standardizing, matching, anomaly scores and narration text.
- The website only displays the precomputed files in `frontend/public/data/`. There is **no backend** and no live call to FIRMS, so the app also works offline.

### Matching rules (defaults, with sensitivity analysis)

| Rule | Default |
|---|---|
| Distance | 1.0 km or less (haversine, BallTree) |
| Time | 4 hours or less between UTC timestamps |
| Eligible records | MODIS confidence 30 or higher · VIIRS nominal or high |
| Confirmed match | Exactly one eligible partner |
| Ambiguous | Several possible partners: never forced into a match |
| Unmatched | No qualifying partner |
| Low-confidence records | Kept and flagged, excluded only from primary matching |

Anomaly flags use a robust z-score (median and MAD of daily counts per sensor) above 3.5. They are statistical deviations from the three-month window, not forecasts.

## Repository layout

| Folder | Contents |
|---|---|
| `data/raw/` | Untouched NASA FIRMS files |
| `data/processed/` | Standardized per-satellite files, data-readiness gate, audit report |
| `export/` | `export.py`, `fira.py`, `to_contract.py` |
| `frontend_data/` | The data files the website reads |
| `frontend/` | React + Vite app |
| `FireFusion_M3_Deliverables/` | Harmonization script, configuration, results and tests |
| `docs/` | Handover notes (data and export) |

## Run it

**The website**
```bash
cd frontend
npm install
npm run dev          # development
npm run build        # production build
npm run preview      # serve the build locally (works offline)
```
The data files must be in `frontend/public/data/` (copy them from `frontend_data/`).

**The data pipeline:** see `docs/M2_DATA_EXPORT.md` (exports and narration) and the README in `FireFusion_M3_Deliverables/` (harmonization and tests). No FIRMS key is needed; the pipeline runs from the cached files.

## Limitations

- Satellite detections are not ground-confirmed fires, and a missing detection does not prove there was no fire.
- Cloud, smoke, overpass gaps and small or short-lived fires affect detection.
- Nearby detections are not assumed to be the same fire. A match group is not a unique real-world fire.
- FRP is compared between sensors and never added across them. Hotspots do not measure burned area.
- NOAA-20 has no rows on 30 September 2023 (its file ends 29 September); S-NPP covers that day.
- S-NPP was added beyond the original NOAA-20-only plan (scope extension).
- The anomaly baseline is three months, not long-term climatology.
- This is not an early-warning or emergency system, and it does not predict wildfires.

## Data attribution

NASA FIRMS (Fire Information for Resource Management System): MODIS Collection 6.1 and VIIRS 375 m active-fire data (NOAA-20 and Suomi NPP), retrieved 10 November 2026. https://firms.modaps.eosdis.nasa.gov/

## Team

| Role | Responsibility |
|---|---|
| M1, Team Owner | Integration, deployment, README, demo video, submission |
| M2, Data Engineer | Data download, readiness gate, audit, provenance, exports, FIRA narration |
| M3, Science Lead | Harmonization, sensitivity analysis, FRP correlation, anomaly detection, tests |
| M4, Frontend A | App shell, dashboard, map |
| M5, Frontend B | Calendar, comparison lab, FIRA panel, downloads, limitations |
