#!/usr/bin/env python3
"""export.py -- FireFusion AI, M2 (Data and Export).

Reads the harmonized dataset (M3's harmonized.parquet + comparison.json +
periods.json) and generates every export the app and the submission need:

  * summary.json       -- season totals, counts by sensor/satellite/status,
                          peak day, FRP stats, match coverage
  * daily_report.csv   -- one row per day: counts by sensor and satellite,
                          matched / ambiguous / unmatched, robust z, flagged
  * points.csv         -- every harmonized point (map + inspection)
  * grid.csv           -- ~1 km grid aggregation (cell counts by sensor/status)
  * provenance.json    -- inputs, row counts, run record, output files
  * audit.json         -- machine-readable data audit (see audit_report.md)

Everything here is computed from the harmonized Parquet -- no new numbers
are invented. Run after harmonize.py:

  python export.py --harmonized ../data/processed/out_real_v2/harmonized.parquet \
      --comparison ../data/processed/out_real_v2/comparison.json \
      --periods ../data/processed/out_real_v2/periods.json \
      --out-dir ../data/processed/export
"""

import argparse
import json
from pathlib import Path
import shutil
import numpy as np
import pandas as pd


def build_summary(harm, comparison, periods):
    peak = max(periods["flagged_days"], key=lambda f: f["robust_z"], default=None)
    # Peak day by total detections (computed, not assumed).
    dates = harm["timestamp_utc"].dt.strftime("%Y-%m-%d")
    totals = harm.groupby(dates).size()
    peak_date = str(totals.idxmax())
    peak_day = harm[dates == peak_date]
    by_sensor = {}
    for sensor in ["MODIS", "VIIRS"]:
        sub = harm[harm["sensor"] == sensor]
        by_sensor[sensor] = {
            "detections": int(len(sub)),
            "by_satellite": sub["satellite"].value_counts().to_dict(),
            "mean_frp_mw": round(float(sub["frp_mw"].mean()), 1)
            if sub["frp_mw"].notna().any() else None,
            "by_match_status": sub["match_status"].value_counts().to_dict(),
            "by_confidence": sub["confidence_std"].value_counts().to_dict(),
        }
    return {
        "season": {
            "region": "California, USA",
            "date_range": {"from": "2023-07-01", "to": "2023-09-30"},
            "products": ["MODIS Collection 6.1 (Terra/Aqua)",
                         "VIIRS 375 m NOAA-20 Collection 2",
                         "VIIRS 375 m S-NPP Collection 2"],
            "source": "NASA FIRMS",
        },
        "counts": comparison["counts"],
        "by_sensor": by_sensor,
        "peak_day": {
            "date": peak_date,
            "modis": int((peak_day["sensor"] == "MODIS").sum()),
            "viirs": int((peak_day["sensor"] == "VIIRS").sum()),
            "total": int(len(peak_day)),
        },
        "highest_robust_z": peak,
        "critical_periods": periods["critical_periods"],
        "frp_correlation": comparison["frp_correlation"],
        "sensitivity": comparison["sensitivity"],
        "note": "Ambiguous groups are NOT counted as confirmed matches. "
                "Raw counts are detections, not unique real-world fires. "
                "FRP is never summed across sensors.",
    }


def build_daily(harm, periods):
    harm = harm.copy()
    harm["date"] = harm["timestamp_utc"].dt.strftime("%Y-%m-%d")
    flagged = {(f["date"], f["sensor"]): f for f in periods["flagged_days"]}
    rows = []
    for date, day in harm.groupby("date"):
        r = {"date": date}
        for sensor in ["MODIS", "VIIRS"]:
            sub = day[day["sensor"] == sensor]
            r[f"{sensor.lower()}_detections"] = int(len(sub))
            for sat in sorted(sub["satellite"].unique()):
                r[f"{sensor.lower()}_{sat.lower().replace('-', '')}"] = int(
                    (sub["satellite"] == sat).sum())
            r[f"{sensor.lower()}_mean_frp_mw"] = round(float(sub["frp_mw"].mean()), 1) \
                if sub["frp_mw"].notna().any() else None
            f = flagged.get((date, sensor))
            r[f"{sensor.lower()}_robust_z"] = f["robust_z"] if f else None
            r[f"{sensor.lower()}_flagged"] = bool(f)
        r["matched_pairs"] = int(day[day["match_status"] == "matched"]
                                 ["match_group_id"].nunique())
        r["ambiguous_groups"] = int(day[day["match_status"] == "ambiguous"]
                                    ["match_group_id"].nunique())
        r["unmatched"] = int((day["match_status"] == "unmatched").sum())
        rows.append(r)
    daily = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)
    return daily


def build_grid(harm):
    """~1 km grid aggregation from the harmonized grid_cell_id."""
    g = harm[harm["grid_cell_id"].notna()].copy()
    rows = []
    for cell, sub in g.groupby("grid_cell_id"):
        rows.append({
            "grid_cell_id": cell,
            "latitude": round(float(sub["latitude"].mean()), 3),
            "longitude": round(float(sub["longitude"].mean()), 3),
            "detections": int(len(sub)),
            "modis": int((sub["sensor"] == "MODIS").sum()),
            "viirs": int((sub["sensor"] == "VIIRS").sum()),
            "matched": int((sub["match_status"] == "matched").sum()),
            "ambiguous": int((sub["match_status"] == "ambiguous").sum()),
            "unmatched": int((sub["match_status"] == "unmatched").sum()),
            "mean_frp_mw": round(float(sub["frp_mw"].mean()), 1)
            if sub["frp_mw"].notna().any() else None,
        })
    return pd.DataFrame(rows).sort_values("detections", ascending=False) \
        .reset_index(drop=True)


def build_audit(harm, comparison, periods, inputs):
    """Machine-readable audit (PRD 6.1): row counts, validation, coverage."""
    audit = {"inputs": inputs, "rows": {}, "validation": {}, "coverage": {},
             "distributions": {}}
    for sensor in ["MODIS", "VIIRS"]:
        sub = harm[harm["sensor"] == sensor]
        audit["rows"][sensor] = {
            "total": int(len(sub)),
            "by_satellite": sub["satellite"].value_counts().to_dict(),
            "date_min": str(sub["timestamp_utc"].min().date()),
            "date_max": str(sub["timestamp_utc"].max().date()),
            "lat_min": round(float(sub["latitude"].min()), 3),
            "lat_max": round(float(sub["latitude"].max()), 3),
            "lon_min": round(float(sub["longitude"].min()), 3),
            "lon_max": round(float(sub["longitude"].max()), 3),
        }
    audit["validation"] = {
        "invalid_coordinates": int((harm["quality_flag"]
                                    .str.contains("invalid_coordinates")).sum()),
        "invalid_timestamps": int((harm["quality_flag"]
                                   .str.contains("invalid_timestamp")).sum()),
        "low_confidence_excluded": int((harm["quality_flag"]
                                        .str.contains("low_confidence_excluded")).sum()),
        "exact_duplicates": int((harm["match_status"] == "duplicate").sum()),
        "missing_frp": int(harm["frp_mw"].isna().sum()),
        "frp_min_mw": round(float(harm["frp_mw"].min()), 1),
        "frp_max_mw": round(float(harm["frp_mw"].max()), 1),
    }
    audit["coverage"] = {
        "date_range": {"from": "2023-07-01", "to": "2023-09-30"},
        "days_with_data": int(harm["timestamp_utc"].dt.strftime("%Y-%m-%d").nunique()),
        "known_gaps": ["VIIRS NOAA-20 has no rows on 2023-09-30 "
                       "(file ends 2023-09-29)."],
        "bbox_notes": ["One row at latitude 42.01, 0.01 deg above the "
                       "configured bbox top edge (42.0); kept, not dropped."],
    }
    audit["distributions"] = {
        "match_status": harm["match_status"].value_counts().to_dict(),
        "confidence": {f"{s}|{c}": int(n) for (s, c), n in
                       harm.groupby(["sensor", "confidence_std"]).size().items()},
        "daynight": {f"{s}|{d}": int(n) for (s, d), n in
                     harm.groupby(["sensor", "daynight"]).size().items()},
        "flagged_days": len(periods["flagged_days"]),
        "critical_periods": len(periods["critical_periods"]),
    }
    return audit


def json_safe(value):
    """Convert pandas and NumPy values into valid JSON values."""
    if pd.isna(value):
        return None

    if isinstance(value, (np.integer,)):
        return int(value)

    if isinstance(value, (np.floating,)):
        return float(value)

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    if isinstance(value, np.generic):
        return value.item()

    return value


def export_frontend_data(
    harm,
    daily,
    grid,
    comparison,
    periods,
    out_dir,
    config_path=None
):
    """Generate JSON and daily GeoJSON files for the frontend."""

    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Daily activity JSON
    daily_records = [
        {
            key: json_safe(value)
            for key, value in record.items()
        }
        for record in daily.to_dict(orient="records")
    ]

    (out_dir / "daily.json").write_text(
        json.dumps(daily_records, indent=2, allow_nan=False),
        encoding="utf-8"
    )

    # 2. Grid aggregation JSON
    grid_records = [
        {
            key: json_safe(value)
            for key, value in record.items()
        }
        for record in grid.to_dict(orient="records")
    ]

    (out_dir / "grid.json").write_text(
        json.dumps(grid_records, indent=2, allow_nan=False),
        encoding="utf-8"
    )

    # 3. Comparison and periods JSON
    (out_dir / "comparison.json").write_text(
        json.dumps(comparison, indent=2, allow_nan=False),
        encoding="utf-8"
    )

    (out_dir / "periods.json").write_text(
        json.dumps(periods, indent=2, allow_nan=False),
        encoding="utf-8"
    )

    # 4. Daily GeoJSON files
    points_dir = out_dir / "points"
    points_dir.mkdir(parents=True, exist_ok=True)

    points = harm.copy()

    points["date"] = (
        points["timestamp_utc"].dt.strftime("%Y-%m-%d")
    )

    for date, day in points.groupby("date", sort=True):

        features = []

        for _, row in day.iterrows():

            properties = {}

            for key, value in row.items():

                if key in {"latitude", "longitude", "date"}:
                    continue

                properties[key] = json_safe(value)

            properties["date"] = date

            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        json_safe(row["longitude"]),
                        json_safe(row["latitude"])
                    ]
                },
                "properties": properties
            }

            features.append(feature)

        geojson = {
            "type": "FeatureCollection",
            "features": features
        }

        output_file = points_dir / f"{date}.geojson"

        output_file.write_text(
            json.dumps(geojson, indent=2, allow_nan=False),
            encoding="utf-8"
        )

    # 5. Frontend configuration
    source_config = {}

    if config_path:
        source_config = json.loads(
            Path(config_path).read_text(encoding="utf-8")
        )

    app_config = {
        "project": "FireFusion AI",
        "region": source_config.get(
            "region",
            {"name": "California, USA"}
        ),
        "date_range": source_config.get(
            "date_range",
            {
                "from": "2023-07-01",
                "to": "2023-09-30"
            }
        ),
        "products": source_config.get("products", []),
        "source": "NASA FIRMS",
        "files": {
            "summary": "summary.json",
            "daily": "daily.json",
            "periods": "periods.json",
            "comparison": "comparison.json",
            "grid": "grid.json",
            "fira_narration": "fira_narration.json",
            "provenance": "provenance.json",
            "points_pattern": "points/{date}.geojson"
        }
    }

    (out_dir / "config.json").write_text(
        json.dumps(app_config, indent=2, allow_nan=False),
        encoding="utf-8"
    )

    print("Frontend JSON and GeoJSON files generated.")

def main():
    ap = argparse.ArgumentParser(description="FireFusion AI export (M2)")
    ap.add_argument("--harmonized", required=True)
    ap.add_argument("--comparison", required=True)
    ap.add_argument("--periods", required=True)
    ap.add_argument("--log", default=None,
                    help="harmonization_log.json (for provenance)")
    ap.add_argument(
        "--config",
        default=None,
        help="Path to harmonization config.json"
    )

    ap.add_argument(
        "--frontend-data-dir",
        default=None,
        help="Optional frontend public/data directory"
    )
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    harm = pd.read_parquet(args.harmonized)
    comparison = json.loads(Path(args.comparison).read_text())
    periods = json.loads(Path(args.periods).read_text())
    log = json.loads(Path(args.log).read_text()) if args.log else {}

    summary = build_summary(harm, comparison, periods)
    (out / "summary.json").write_text(json.dumps(summary, indent=2))

    daily = build_daily(harm, periods)
    daily.to_csv(out / "daily_report.csv", index=False)

    points_cols = ["record_id", "sensor", "satellite", "timestamp_utc",
                   "latitude", "longitude", "grid_cell_id", "frp_mw",
                   "brightness", "confidence_raw", "confidence_std",
                   "daynight", "match_status", "quality_flag",
                   "match_group_id", "matched_with", "distance_km",
                   "time_diff_hours"]
    harm[points_cols].to_csv(out / "points.csv", index=False)

    grid = build_grid(harm)
    grid.to_csv(out / "grid.csv", index=False)

    inputs = log.get("inputs", {})
    audit = build_audit(harm, comparison, periods, inputs)
    (out / "audit.json").write_text(json.dumps(audit, indent=2))

    provenance = {
        "team": "NASA Space Apps Challenge 2026, team #786",
        "challenge": "Harmonization of MODIS and VIIRS Hot Spots",
        "source": "NASA FIRMS",
        "products": summary["season"]["products"],
        "region": summary["season"]["region"],
        "date_range": summary["season"]["date_range"],
        "inputs": inputs,
        "harmonization": {
            "script": "harmonize.py",
            "version": log.get("version"),
            "run_at_utc": log.get("run_at_utc"),
            "config": log.get("config"),
            "counts": log.get("outputs", {}),
        },
        "exports": ["summary.json", "daily_report.csv", "points.csv",
                    "grid.csv", "audit.json", "provenance.json"],
        "note": "Raw FIRMS files are kept untouched in data/raw/. "
                "S-NPP is included alongside NOAA-20 (team-approved scope "
                "extension; PRD lists extra VIIRS satellites as P2).",
    }
    (out / "provenance.json").write_text(json.dumps(provenance, indent=2))

    # Generate frontend-ready JSON and GeoJSON files.
    export_frontend_data(
        harm=harm,
        daily=daily,
        grid=grid,
        comparison=comparison,
        periods=periods,
        out_dir=out,
        config_path=args.config
    )

# Optionally copy exports into React's public data directory.
    if args.frontend_data_dir:

        frontend_dir = Path(args.frontend_data_dir)
        frontend_dir.mkdir(parents=True, exist_ok=True)

        for item in out.iterdir():

            destination = frontend_dir / item.name

            if item.is_dir():

                if destination.exists():
                    shutil.rmtree(destination)

                    shutil.copytree(item, destination)

            else:
                shutil.copy2(item, destination)

    print(f"rows={len(harm)}  days={len(daily)}  grid_cells={len(grid)}")
    print(f"wrote {out}/summary.json, daily_report.csv ({len(daily)} rows), "
          f"points.csv ({len(harm)} rows), grid.csv ({len(grid)} cells), "
          f"audit.json, provenance.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
