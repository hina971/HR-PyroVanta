# FireFusion AI — Data-Readiness Gate (PRD §6.1)

**Team #786, NASA Space Apps Challenge 2026 — "Harmonization of MODIS and VIIRS Hot Spots"**
**Case study:** California, USA, 1 July – 30 September 2023
**Gate owner:** M2 (Data and Export). Matching run by M3 with `harmonize.py` v1.2.
**Date:** 14 November 2026

## 1. Source files


| File | Product | Satellite | Rows | Dates | Area (from the data) |
|---|---|---|---|---|---|
| `fire_archive_M-C61_841863.csv` | MODIS Collection 6.1 | Terra 1,966 / Aqua 1,755 | 3,721 | 2023-07-01 to 2023-09-30 | lat 32.6 to 42.0, lon -124.27 to -114.69 |
| `fire_archive_J1V-C2_841864.csv` | VIIRS 375 m Collection 2 | NOAA-20 | 18,399 | 2023-07-01 to 2023-09-29 | lat 32.6 to 42.01, lon -124.27 to -114.52 |
| `fire_archive_SV-C2_841865.csv` | VIIRS 375 m Collection 2 | Suomi NPP (S-NPP) | 17,779 | 2023-07-01 to 2023-09-30 | lat 32.6 to 42.0, lon -124.27 to -114.52 |

Version values in the files: MODIS `61.03`, both VIIRS files `2`. None carries a near-real-time marker, which is consistent with standard archive data. The retrieval date, query area and versions are recorded in `frontend_data/provenance.json`.

## 2. Gate checks

| # | Check | Result |
|---|---|---|
| 1 | Full study-area and time-window files downloaded for MODIS Terra, MODIS Aqua and VIIRS NOAA-20 | **PASS** (plus S-NPP, see section 3) |
| 2 | Records fall inside 1 July to 30 September 2023; rows per product and satellite documented | **PASS** for MODIS and S-NPP. **PARTIAL for NOAA-20**: the file ends 2023-09-29 |
| 3 | Required columns present (latitude, longitude, acquisition date and time, confidence, FRP, day/night) | **PASS** in all three files |
| 4 | Timestamp parsing and UTC conversion; invalid timestamps and coordinates recorded, not silently dropped | **PASS**: 0 invalid timestamps, 0 invalid coordinates |
| 5 | Geographic bounds checked against the configured California area (lat 32.5 to 42.0, lon -124.4 to -114.1) | **PASS** with one note: one VIIRS row sits at latitude 42.01, 0.01 degrees above the top edge. It is kept, not dropped |
| 6 | Untouched raw files, processed files, provenance manifest and audit report saved | **PASS**: `data/raw/`, `data/processed/`, `frontend_data/provenance.json`, `audit_report.md`, `audit.json` |
| 7 | Pipeline runs offline from the cached files and produces the static export files without a FIRMS API call | **PASS**: the full pipeline was re-run on cached files only (see README section 4) |

Row-level reconciliation: raw files hold 39,899 rows and the processed files hold 39,899 rows with identical content. No row was removed or changed.

Two real-data quirks are handled in code: FIRMS `acq_time` is not zero-padded (`554` means 05:54), and VIIRS confidence arrives as letters (`l`, `n`, `h`). Without these fixes, morning overpasses would fail to parse and every VIIRS row would be ineligible.

## 3. Dataset status

| Dataset | Role | Status |
|---|---|---|
| MODIS Terra C6.1 | Morning-orbit MODIS observations | **Ready** (1,966 rows) |
| MODIS Aqua C6.1 | Afternoon-orbit MODIS observations | **Ready** (1,755 rows) |
| VIIRS NOAA-20 375 m | VIIRS comparison observations | **Ready with one documented gap**: no rows on 30 September 2023 |
| VIIRS S-NPP 375 m (extension) | Second VIIRS sensor | **Ready** (17,779 rows) |

**Known gap:** NOAA-20 has no data on 30 September 2023. S-NPP has 36 rows that day, so the day has VIIRS coverage through S-NPP only. Do not claim NOAA-20 coverage for 30 September.

**Scope note:** the PRD covers VIIRS NOAA-20 only and lists extra VIIRS satellites as P2. On the team's instruction (14 November 2026) S-NPP was added as a second VIIRS sensor, with the same 375 m resolution, confidence system and matching rules as NOAA-20. The FIRA source line now reads "MODIS C6.1 and VIIRS 375 m (NOAA-20, S-NPP)". The earlier NOAA-20-only run (22,120 rows, 125 pairs) was kept for comparison and is not part of this delivery.

## 4. Real-data run (1.0 km, 4 h, PRD defaults)

- Total rows: **39,899** (MODIS 3,721; VIIRS 36,178).
- Eligible for primary matching: MODIS 3,462 (259 low-confidence excluded), VIIRS 34,819 (1,359 low-confidence excluded).
- **Matched pairs: 98** (196 records), confirmed one-to-one only.
- **Ambiguous groups: 954** (16,144 records), not counted as matches.
- **Unmatched: 23,559**, mostly VIIRS-only detections.
- Exact duplicates: 0.

Adding S-NPP moved 27 clean pairs to ambiguous (125 to 98). 708 ambiguous groups now contain both NOAA-20 and S-NPP candidates. This is the second VIIRS sensor competing for partners, not an error.

These are the real counts. The sample numbers in the demo (MODIS 18,432 / VIIRS 42,891 / matched 11,928) were illustrative and must not be quoted as data.

## 5. Outputs handed to M1 and the frontend

- `frontend_data/` holds the files the website reads (see README section 2).
- `data/processed/export/` holds the review CSVs, `audit.json`, `provenance.json`, `summary.json` and `fira_narration.json`.
- `data/processed/audit_report.md` is the full audit.