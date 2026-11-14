# FireFusion AI — Member 2: Data and Export Handover (team #786)

**Case study:** California, USA, 1 July – 30 September 2023
**Leader:** Member 2 (Hina Ramzan) (M2), Data Engineer (Data and Export)
**Built and verified:** 14 November 2026
**Data source:** NASA FIRMS

---

## 1. What M2 is responsible for

1. **Data collection:** FIRMS archive files for MODIS Terra and Aqua (C6.1) and VIIRS 375 m NOAA-20. VIIRS S-NPP was added on the team's instruction (see section 7).
2. **Data-readiness gate (PRD §6.1):** checks on dates, columns, timestamps, coordinates and area bounds. Report: `data/processed/DATA_GATE.md`.
3. **Preprocessing:** the untouched raw files are split into one standardized CSV per satellite.
4. **Provenance and audit:** `provenance.json`, `audit.json` and `audit_report.md`.
5. **Export:** `export/export.py` and `export/to_contract.py` turn M3's harmonized results into the files the website reads.
6. **FIRA narration:** `export/fira.py` writes template-driven narration to `fira_narration.json`.


---

## 2. Folder contents

| Path | Description |
|---|---|
| `data/raw/` | Untouched NASA FIRMS archive files: `fire_archive_M-C61_841863.csv` (MODIS Terra + Aqua), `fire_archive_J1V-C2_841864.csv` (VIIRS NOAA-20), `fire_archive_SV-C2_841865.csv` (VIIRS S-NPP) |
| `data/processed/` | Standardized per-satellite files: `modis_terra.csv`, `modis_aqua.csv`, `viirs_noaa20.csv`, `viirs_snpp.csv` |
| `data/processed/DATA_GATE.md` | PRD §6.1 data-readiness gate report |
| `data/processed/audit_report.md` | Full human-readable data audit |
| `data/processed/export/` | Review exports: `summary.json`, `daily_report.csv`, `points.csv`, `grid.csv`, `audit.json`, `provenance.json`, `fira_narration.json` |
| `frontend_data/` | **The data contract the website reads (PRD §11.2).** Already copied to `frontend/public/data/` and live on the site — the app reads the real data from there, no backend needed. |
| `export/export.py` | Builds the summary, daily report, points, grid, audit and provenance |
| `export/to_contract.py` | Builds `frontend_data/` from the harmonized results |
| `export/fira.py` | FIRA narration generator |

### What is in `frontend_data/`

| File | Contents |
|---|---|
| `config.json` | Region, bounding box, date range, matching thresholds, products, retrieval date |
| `summary.json` | Counts by sensor, matched / ambiguous / unmatched, FRP, peak day, **match coverage with numerators and denominators** |
| `daily.json` | One row per day and sensor (184 rows): detections, matched / ambiguous / unmatched counts, mean and max FRP, robust z-score, anomaly flag |
| `periods.json` | Flagged days, critical periods, baseline statistics |
| `comparison.json` | Sensitivity (0.5 / 1 / 2 km and 1 / 4 / 6 h) for four satellite pairs, FRP correlations, confidence and day/night splits |
| `grid.json` | 4,143 grid cells of about 1 km for the wide-zoom map view |
| `points/YYYY-MM-DD.geojson` | One GeoJSON file of harmonized records per day (92 files), loaded on demand |
| `fira_narration.json` | 92 daily narrations, 5 critical-period narrations, welcome tour, sensor explainer, rules |
| `provenance.json` | Retrieval date, source files, versions, query parameters, row counts, audit summary |
| `harmonization_log.json` | M3's run record (counts, thresholds, input and output files) |

---

## 3. Headline numbers (real FIRMS data)

- **39,899 records:** MODIS 3,721 (Terra 1,966 / Aqua 1,755) and VIIRS 36,178 (NOAA-20 18,399 / S-NPP 17,779).
- **Validation:** 0 invalid coordinates, 0 invalid timestamps, 0 missing FRP, 0 exact duplicates.
- **Low-confidence records:** 1,618 (MODIS 259, VIIRS 1,359) are kept and flagged `low_confidence_excluded`; they are excluded only from primary matching.
- **Matching result (1.0 km, 4 h):** 98 confirmed one-to-one pairs (196 records), 954 ambiguous groups (16,144 records), 23,559 unmatched records. 196 + 16,144 + 23,559 = 39,899.
- **Match coverage:** MODIS 98 of 3,462 eligible records (2.83%). VIIRS 98 of 34,819 eligible records (0.28%). Ambiguous coverage is reported separately.
- **Peak day:** 19 August 2023, 2,111 detections (MODIS 154, VIIRS 1,957).
- **Coverage:** 92 days, 1 July to 30 September 2023.
- **Known gap:** NOAA-20 has no rows on 30 September 2023 (its file ends 29 September). S-NPP has 36 rows that day. Do not claim NOAA-20 coverage for 30 September.

---

## 4. How to run the M2 pipeline

M2's scripts need M3's outputs as input: `harmonized.parquet`, `comparison.json`, `periods.json` and `harmonization_log.json`. They are not part of this folder. In the commands below they sit in `data/processed/out_real_v2/`; if M3 gives you a different location, change `H`.

```bash
pip install pandas numpy pyarrow scikit-learn

H=data/processed/out_real_v2

# 1. Core exports, audit and provenance
python export/export.py --harmonized $H/harmonized.parquet --comparison $H/comparison.json \
    --periods $H/periods.json --log $H/harmonization_log.json \
    --out-dir data/processed/export

# 2. FIRA narration
python export/fira.py --harmonized $H/harmonized.parquet --comparison $H/comparison.json \
    --periods $H/periods.json --out data/processed/export/fira_narration.json

# 3. Frontend data contract
python export/to_contract.py --harmonized $H/harmonized.parquet --comparison $H/comparison.json \
    --periods $H/periods.json --log $H/harmonization_log.json \
    --export-dir data/processed/export --config harmonize/config.json \
    --processed-dir data/processed --out-dir frontend_data
```

Run them in this order. After step 3, copy `frontend_data/provenance.json` and `frontend_data/summary.json` over the files of the same name in `data/processed/export/`, so both folders agree.

Expected output of step 3: `daily rows=184  point files=92  grid cells=4143`.

The FIRMS MAP_KEY is not needed for any of this. The pipeline runs offline from the cached files.

---

## 5. How M2 work was checked

1. **Raw to processed:** raw files (39,899 rows) and processed files (39,899 rows) have identical content, with no row lost or changed.
2. **Gate parsing:** non-zero-padded FIRMS times (`554` is 05:54) and VIIRS letter confidences (`l`, `n`, `h`) are standardized with 0 parsing failures.
3. **Reproducibility:** the three export steps were re-run from scratch on a clean copy and gave the same counts as the delivered files.
4. **Daily counts:** every day's detection count in `daily.json` is checked against `daily_report.csv` when it is built.
5. **FIRA:** every narration ends with the source line below, and the counts in the daily narrations match `daily_report.csv`. No causes, impacts, burned area or casualties are stated.

> Source: MODIS C6.1 and VIIRS 375 m (NOAA-20, S-NPP), NASA FIRMS, 1 July - 30 September 2023.

---

## 6. Rules the numbers follow (PRD §7.3)

- Raw counts are **detections, not unique real-world fires**.
- Ambiguous groups are **not** confirmed matches. The closest partner in a group is a suggestion only.
- FRP is compared between sensors and **never added** across them.
- No original record was deleted. Excluded records are flagged, not removed.
- Anomaly flags are statistical deviations from the three-month window, not forecasts.

---

## 7. Notes for the team

- **S-NPP scope extension:** the PRD covers VIIRS NOAA-20 only and lists extra VIIRS satellites as P2. S-NPP was added on the team's instruction on 14 November 2026. It competes with NOAA-20 for MODIS partners, which moved confirmed pairs from 125 (NOAA-20 only) to 98. The PRD text, app footer and FIRA source line should say "NOAA-20, S-NPP".
- **Sample numbers in the demo are not real.** Do not quote MODIS 18,432, VIIRS 42,891 or matched 11,928. Use the numbers in this README or in `frontend_data/summary.json`.
- **Frontend:** read only from `frontend_data/`. Do not use the CSV files in `data/processed/export/` for the app.

---
