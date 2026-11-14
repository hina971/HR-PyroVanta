"""FireFusion AI - M2: build the PRD 11.2 static data contract (JSON) for the frontend.

Reads the pipeline outputs, writes frontend_data/ (copy into frontend/public/data/).
every number comes from harmonized.parquet or the
existing JSON/CSV exports, and daily counts are cross-checked against daily_report.csv.
"""
import argparse, json, os, shutil
import numpy as np
import pandas as pd

RETRIEVAL_DATE = "2026-11-10"   # FIRMS archive download date (DATA_GATE.md)
RAW_FILES = {
    "modis_terra": "fire_archive_M-C61_841863.csv (Terra rows)",
    "modis_aqua": "fire_archive_M-C61_841863.csv (Aqua rows)",
    "viirs_noaa20": "fire_archive_J1V-C2_841864.csv",
    "viirs_snpp": "fire_archive_SV-C2_841865.csv",
}


def jdump(obj, path):
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), allow_nan=False)


def clean(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return None if np.isnan(v) else float(v)
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--harmonized", default="out/harmonized.parquet")
    ap.add_argument("--comparison", default="out/comparison.json")
    ap.add_argument("--periods", default="out/periods.json")
    ap.add_argument("--log", default="out/harmonization_log.json")
    ap.add_argument("--export-dir", default="data/processed/export")
    ap.add_argument("--config", default="harmonize/config.json")
    ap.add_argument("--processed-dir", default="data/processed")
    ap.add_argument("--out-dir", default="frontend_data")
    a = ap.parse_args()

    os.makedirs(os.path.join(a.out_dir, "points"), exist_ok=True)
    df = pd.read_parquet(a.harmonized)
    df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"], utc=True)
    df["date"] = df["timestamp_utc"].dt.strftime("%Y-%m-%d")
    cfg = json.load(open(a.config))
    periods = json.load(open(a.periods))
    comparison = json.load(open(a.comparison))
    summary = json.load(open(os.path.join(a.export_dir, "summary.json")))
    audit = json.load(open(os.path.join(a.export_dir, "audit.json")))
    daily_rep = pd.read_csv(os.path.join(a.export_dir, "daily_report.csv")).set_index("date")

    # ---- config.json
    jdump({
        "region_name": cfg["region"]["name"],
        "bbox": cfg["region"]["bbox"],
        "date_range": cfg["date_range"],
        "matching": cfg["matching"],
        "anomaly": cfg["anomaly"],
        "grid_km": cfg["grid_km"],
        "products": cfg["products"],
        "retrieval_date": RETRIEVAL_DATE,
        "satellites": ["Terra", "Aqua", "NOAA-20", "S-NPP"],
        "attribution": "NASA FIRMS (MODIS C6.1 and VIIRS 375 m active fire), retrieved " + RETRIEVAL_DATE,
    }, os.path.join(a.out_dir, "config.json"))

    # ---- daily.json: one row per day and sensor
    all_dates = sorted(df["date"].unique())
    flagged = {(f["date"], f["sensor"]) for f in periods["flagged_days"]}
    rows = []
    for d in all_dates:
        for sensor, pre in (("MODIS", "modis"), ("VIIRS", "viirs")):
            s = df[(df["date"] == d) & (df["sensor"] == sensor)]
            n = len(s)
            # cross-check against the M2 daily report
            assert n == int(daily_rep.loc[d, f"{pre}_detections"]), (d, sensor)
            amb = s[s["match_status"] == "ambiguous"]
            z = daily_rep.loc[d, f"{pre}_robust_z"]
            rows.append({
                "date": d, "sensor": sensor, "detections": n,
                "by_satellite": {k: int(v) for k, v in s["satellite"].value_counts().items()},
                "matched_records": int((s["match_status"] == "matched").sum()),
                "ambiguous_records": int(len(amb)),
                "ambiguous_groups": int(amb["match_group_id"].nunique()),
                "unmatched_records": int((s["match_status"] == "unmatched").sum()),
                "exact_duplicates": int((s["match_status"] == "duplicate").sum()),
                "mean_frp_mw": clean(round(float(s["frp_mw"].mean()), 1)) if n else None,
                "max_frp_mw": clean(round(float(s["frp_mw"].max()), 1)) if n else None,
                "robust_z": clean(z),
                "flagged": (d, sensor) in flagged,
            })
    jdump(rows, os.path.join(a.out_dir, "daily.json"))

    # ---- points/YYYY-MM-DD.geojson
    prop_cols = ["record_id", "sensor", "satellite", "timestamp_utc", "frp_mw", "brightness",
                 "confidence_raw", "confidence_std", "daynight", "match_status", "quality_flag",
                 "match_group_id", "matched_with", "distance_km", "time_diff_hours", "grid_cell_id"]
    for d, g in df.groupby("date"):
        feats = []
        for r in g.sort_values("record_id").itertuples(index=False):
            props = {}
            for c in prop_cols:
                v = getattr(r, c)
                if c == "timestamp_utc":
                    v = v.strftime("%Y-%m-%dT%H:%M:%SZ")
                elif c in ("distance_km", "time_diff_hours") and v is not None and not pd.isna(v):
                    v = round(float(v), 3)
                elif c in ("frp_mw", "brightness") and v is not None and not pd.isna(v):
                    v = round(float(v), 1)
                props[c] = None if (v is None or (not isinstance(v, str) and pd.isna(v))) else clean(v)
            feats.append({"type": "Feature",
                          "geometry": {"type": "Point",
                                       "coordinates": [round(float(r.longitude), 5), round(float(r.latitude), 5)]},
                          "properties": props})
        jdump({"type": "FeatureCollection", "features": feats},
              os.path.join(a.out_dir, "points", f"{d}.geojson"))

    # ---- grid.json
    grid = pd.read_csv(os.path.join(a.export_dir, "grid.csv")).sort_values("grid_cell_id")
    jdump([{k: clean(v) for k, v in r.items()} for r in grid.to_dict("records")],
          os.path.join(a.out_dir, "grid.json"))

    # ---- summary.json: add match coverage with numerators and denominators (PRD 8.1 / 8.3)
    not_dup = df["match_status"] != "duplicate"
    cov = {}
    for sensor, elig_mask in (("MODIS", df["confidence_std"] != "low"),
                              ("VIIRS", df["confidence_std"].isin(["nominal", "high"]))):
        e = df[(df["sensor"] == sensor) & elig_mask & not_dup]
        m, am = int((e["match_status"] == "matched").sum()), int((e["match_status"] == "ambiguous").sum())
        cov[sensor] = {
            "eligible_records": int(len(e)),
            "confirmed_matched_records": m,
            "match_coverage_pct": round(100 * m / len(e), 2),
            "ambiguous_records": am,
            "ambiguous_coverage_pct": round(100 * am / len(e), 2),
        }
    summary["match_coverage"] = cov
    summary["counting_note"] = ("Raw detection counts are not unique real-world fires. "
                                "Ambiguous groups are not confirmed matches.")
    jdump(summary, os.path.join(a.out_dir, "summary.json"))

    # ---- copies of existing pipeline outputs
    jdump(periods, os.path.join(a.out_dir, "periods.json"))
    jdump(comparison, os.path.join(a.out_dir, "comparison.json"))
    shutil.copy(os.path.join(a.export_dir, "fira_narration.json"),
                os.path.join(a.out_dir, "fira_narration.json"))

    # ---- provenance.json (PRD section 6)
    prov = json.load(open(os.path.join(a.export_dir, "provenance.json")))
    versions = {}
    files = {}
    for key in RAW_FILES:
        p = pd.read_csv(os.path.join(a.processed_dir, key + ".csv"))
        versions[key] = sorted(p["version"].astype(str).unique().tolist())
        files[key] = {"source_file": RAW_FILES[key], "processed_file": f"data/processed/{key}.csv",
                      "rows": int(len(p)), "version_field_values": versions[key],
                      "date_min": str(p["acq_date"].min()), "date_max": str(p["acq_date"].max())}
    prov["retrieval_date"] = RETRIEVAL_DATE
    prov["retrieved_from"] = "NASA FIRMS Archive Download (https://firms.modaps.eosdis.nasa.gov/download/)"
    prov["query_parameters"] = {"region_bbox": cfg["region"]["bbox"], "date_range": cfg["date_range"],
                                "products": cfg["products"]}
    prov["source_files"] = files
    prov["audit_summary"] = {"validation": audit["validation"], "coverage": audit["coverage"]}
    prov["harmonization_log"] = os.path.basename(a.log)
    prov["contract_files"] = sorted(["config.json", "daily.json", "grid.json", "summary.json", "periods.json",
                                     "comparison.json", "fira_narration.json", "provenance.json", "points/"])
    jdump(prov, os.path.join(a.out_dir, "provenance.json"))
    shutil.copy(a.log, os.path.join(a.out_dir, "harmonization_log.json"))

    n_pts = len(os.listdir(os.path.join(a.out_dir, "points")))
    print(f"daily rows={len(rows)}  point files={n_pts}  grid cells={len(grid)}")
    print("coverage:", json.dumps(cov))
    print("wrote", a.out_dir)


if __name__ == "__main__":
    main()