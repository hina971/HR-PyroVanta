# FireFusion AI — Data Audit Report (M2)

**Team #786, NASA Space Apps Challenge 2026 — "Harmonization of MODIS and VIIRS Hot Spots"**
**Case study:** California, 1 July – 30 September 2023
**Audited by:** M2 (Data and Export), from the harmonized dataset produced by M3's `harmonize.py` v1.2
**Machine-readable version:** `data/processed/export/audit.json`
**Date:** 14 November 2026

## 1. Inputs (all from NASA FIRMS)

| File | Sensor | Satellite | Rows |
|---|---|---|---|
| `fire_archive_M-C61_841863.csv` | MODIS C6.1 | Terra | 1,966 |
| `fire_archive_M-C61_841863.csv` | MODIS C6.1 | Aqua | 1,755 |
| `fire_archive_J1V-C2_841864.csv` | VIIRS 375 m C2 | NOAA-20 | 18,399 |
| `fire_archive_SV-C2_841865.csv` | VIIRS 375 m C2 | S-NPP | 17,779 |
| **Total** | | | **39,899** |

Raw files are kept untouched in `data/raw/`. The MODIS file was split into Terra and Aqua files. The VIIRS files were copied as they are into `data/processed/`. Raw and processed content are identical (39,899 rows each).

**Scope note:** the PRD covers VIIRS NOAA-20 only and lists extra VIIRS satellites as P2. S-NPP was added on the team's instruction (14 November 2026). It is a second VIIRS sensor, treated exactly like NOAA-20. The FIRA source line reads "MODIS C6.1 and VIIRS 375 m (NOAA-20, S-NPP)".

## 2. Validation (PRD §6.1 gate)

| Check | Result |
|---|---|
| Invalid coordinates | **0** |
| Invalid timestamps | **0** |
| Exact duplicates | **0** |
| Missing FRP | **0** |
| Low-confidence records excluded from primary matching (kept, not deleted) | **1,618** (MODIS 259, VIIRS 1,359) |
| FRP range | 0.0 to 3,343.1 MW |

Two real-data quirks are handled in code. FIRMS `acq_time` is not zero-padded (`554` means 05:54), and VIIRS confidence arrives as letters (`l`, `n`, `h`). Without these fixes, morning overpasses would fail to parse and every VIIRS row would be ineligible.

## 3. Coverage

- **92 days** with data (1 July to 30 September 2023).
- **Known gap:** VIIRS NOAA-20 has no rows on 30 September 2023 (its file ends 29 September). S-NPP has 36 rows that day, so the day has VIIRS coverage through S-NPP only. The overall VIIRS date range in `audit.json` ends on 30 September only because of S-NPP. Do not claim NOAA-20 coverage for that day.
- **Bounding box:** one VIIRS row sits at latitude 42.01, 0.01 degrees above the configured top edge (42.0). It is kept, not dropped.

## 4. Distributions

| | MODIS | VIIRS |
|---|---|---|
| Detections | 3,721 | 36,178 |
| Mean FRP | 76.7 MW | 10.4 MW |
| Day / night | 2,113 D / 1,608 N | 13,181 D / 22,997 N |
| Confidence | high 1,596 / nominal 1,866 / low 259 | high 1,651 / nominal 33,168 / low 1,359 |

A MODIS pixel covers about 1 km and a VIIRS pixel about 375 m, so FRP values are not directly comparable between the sensors. FRP is compared, never summed.

## 5. Matching (PRD §7.3, 1.0 km and 4 h defaults)

Match status of all 39,899 records: matched 196 (98 pairs), ambiguous 16,144 (954 groups), unmatched 23,559, duplicates 0. These add up to 39,899.

- **98 confirmed one-to-one pairs.** Each pair is 1 MODIS and 1 VIIRS record within 1.0 km and 4 hours (largest distance 0.989 km, largest time difference 4.0 h).
- **954 ambiguous groups.** 708 of them contain both NOAA-20 and S-NPP candidates. The second VIIRS sensor is the main reason confirmed pairs fell from 125 (NOAA-20 only) to 98.
- **23,559 unmatched.** Mostly VIIRS-only detections.

**Match coverage** (eligible records with at least one confirmed one-to-one match):

| Sensor | Confirmed matched | Eligible | Coverage | Ambiguous (separate) |
|---|---|---|---|---|
| MODIS | 98 | 3,462 | 2.83% | 2,698 (77.93%) |
| VIIRS | 98 | 34,819 | 0.28% | 13,446 (38.62%) |

**FRP correlation on matched pairs (n = 98):** Pearson 0.075, Spearman 0.352. By pair: Terra and NOAA-20 0.48 / 0.575 (n = 34), Aqua and NOAA-20 0.392 / 0.428 (n = 18), Terra and S-NPP -0.051 / 0.332 (n = 23), Aqua and S-NPP -0.040 / -0.015 (n = 23). The S-NPP pairs show almost no linear correlation. With only 23 pairs each and a second sensor competing for partners, the matched sample is small and noisy.

**Sensitivity** (MODIS match coverage at the 4 h window, by satellite pair):

| Radius | Terra and NOAA-20 | Terra and S-NPP | Aqua and NOAA-20 | Aqua and S-NPP |
|---|---|---|---|---|
| 0.5 km | 12.2% | 14.7% | 17.7% | 16.1% |
| 1.0 km | 4.6% | 4.5% | 5.8% | 5.8% |
| 2.0 km | 2.9% | 3.0% | 2.2% | 2.8% |

Coverage falls as the radius grows, because a wider radius pulls more candidates into each group and turns clean one-to-one pairs ambiguous. This is the PRD's strict rule working as designed. At a 1 h window, Terra and VIIRS coverage is much lower than Aqua and VIIRS, because Terra passes several hours before the VIIRS satellites. The full 36-row table is in `frontend_data/comparison.json`.

## 6. Anomalies (PRD §8.5, robust z-score above 3.5)

- **36 flagged days and 5 critical periods:** 29 to 30 July, 16 to 21 August, 23 to 31 August, 15 to 17 September, 20 to 23 September.
- **Peak day: 19 August 2023**, with 2,111 detections (MODIS 154, VIIRS 1,957).
- Flags are statistical deviations from the three-month window. They are not forecasts and do not represent long-term climatology.

## 7. Reproducibility and checks

- `harmonize.py` v1.2: 14 of 14 unit tests pass.
- The full real run reproduces the same counts every time: 39,899 rows, 98 pairs, 954 ambiguous groups, 23,559 unmatched, 0 duplicates.
- The export pipeline (`export.py`, `fira.py`, `to_contract.py`) was re-run from scratch on cached files only, with no FIRMS API call, and reproduced the delivered files.
- Daily detection counts in `frontend_data/daily.json` are checked against `daily_report.csv` for every day when the file is built.
- `frontend_data/provenance.json` records the retrieval date (10 November 2026), source file names, product versions, query area and dates, and row counts.

## 8. What the numbers are not

- Raw counts are **detections, not unique real-world fires**. Never label them as fires.
- Ambiguous groups are **not** confirmed matches. The closest partner in a group is a suggestion only.
- FRP is **never** added across sensors.
- No original record was deleted.
- A missing detection does not prove there was no fire, and detections are not ground-confirmed incidents.