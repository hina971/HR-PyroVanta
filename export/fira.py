#!/usr/bin/env python3
"""fira.py -- FireFusion AI, M2 (Data and Export): FIRA narration generator.

PRD v3.3 section 8.6. FIRA (Fire Intelligence & Research Assistant) is
TEMPLATE-DRIVEN narration: every numerical statement comes from computed
results. It never invents causes, impacts, casualties or unverified details
about fire events. Raw counts are detections, never "fires".

Every narration ends with the source line:
  "Source: MODIS C6.1 and VIIRS 375 m (NOAA-20, S-NPP), NASA FIRMS,
   1 July - 30 September 2023."
(S-NPP added alongside NOAA-20 per the team-approved scope extension.)

Generates fira_narration.json with:
  * welcome            -- guided tour of dashboard, map, calendar, lab
  * sensor_explainer   -- MODIS vs VIIRS differences (PRD 2 / 7.2)
  * season             -- whole-season narration
  * days               -- one narration per day (92 days)
  * critical_periods   -- one narration per critical period
  * groups             -- example group narrations (largest ambiguous group,
                          first matched pair, highest-FRP group) + the
                          narrate_group() function for any group on demand

Usage:
  python fira.py --harmonized ../data/processed/out_real_v2/harmonized.parquet \
      --comparison ../data/processed/out_real_v2/comparison.json \
      --periods ../data/processed/out_real_v2/periods.json \
      --out ../data/processed/export/fira_narration.json
"""

import argparse
import json
from pathlib import Path

import pandas as pd

SOURCE_LINE = ("Source: MODIS C6.1 and VIIRS 375 m (NOAA-20, S-NPP), "
               "NASA FIRMS, 1 July - 30 September 2023.")
DATE_RANGE = "1 July - 30 September 2023"


def _fmt_date(date_str):
    return pd.to_datetime(date_str).strftime("%d %B %Y")


def day_narration(date, day, flagged):
    """PRD 8.6 example template, filled only with computed values."""
    modis = int((day["sensor"] == "MODIS").sum())
    viirs = int((day["sensor"] == "VIIRS").sum())
    matched = int(day[day["match_status"] == "matched"]["match_group_id"].nunique())
    amb = int(day[day["match_status"] == "ambiguous"]["match_group_id"].nunique())
    unmatched = int((day["match_status"] == "unmatched").sum())
    flag_txt = "flagged" if flagged else "not flagged"
    parts = [
        f"On {_fmt_date(date)}, MODIS recorded {modis} detections and VIIRS "
        f"recorded {viirs} detections.",
        f"The harmonization process identified {matched} confirmed one-to-one "
        f"matched pairs, while {amb} candidate groups remained ambiguous. "
        f"{unmatched} detections had no cross-sensor partner.",
    ]
    mean_frp = {}
    for sensor in ["MODIS", "VIIRS"]:
        sub = day[day["sensor"] == sensor]
        if sub["frp_mw"].notna().any():
            mean_frp[sensor] = round(float(sub["frp_mw"].mean()), 1)
    if mean_frp:
        parts.append(
            "Mean fire radiative power was "
            + " and ".join(f"{v} MW ({s})" for s, v in mean_frp.items())
            + ". Fire radiative power is compared between sensors, never "
              "added together.")
    parts.append(
        f"The daily activity was {flag_txt} relative to the selected "
        f"baseline (robust z-score above 3.5 counts as flagged).")
    parts.append(SOURCE_LINE)
    return " ".join(parts)


def season_narration(harm, comparison, periods):
    c = comparison["counts"]
    peak = None
    dates = harm["timestamp_utc"].dt.strftime("%Y-%m-%d")
    totals = harm.groupby(dates).size()
    peak_date = str(totals.idxmax())
    peak_total = int(totals.max())
    return (
        f"Across {DATE_RANGE}, FireFusion AI harmonized {c['modis']} MODIS "
        f"detections and {c['viirs']} VIIRS detections from California. "
        f"The harmonization found {c['matched_pairs']} confirmed one-to-one "
        f"matched pairs and {c['ambiguous_groups']} ambiguous candidate "
        f"groups; {c['unmatched']} detections had no cross-sensor partner. "
        f"The busiest day was {_fmt_date(peak_date)} with {peak_total} "
        f"detections. {len(periods['critical_periods'])} critical periods "
        f"were identified, when daily activity stayed above the baseline "
        f"for two or more consecutive days. "
        f"These are satellite detections, not a count of unique real-world "
        f"fires. {SOURCE_LINE}"
    )


def period_narration(period, harm):
    dates = harm["timestamp_utc"].dt.strftime("%Y-%m-%d")
    sub = harm[(dates >= period["start"]) & (dates <= period["end"])]
    modis = int((sub["sensor"] == "MODIS").sum())
    viirs = int((sub["sensor"] == "VIIRS").sum())
    days = len(period["days"])
    return (
        f"From {_fmt_date(period['start'])} to {_fmt_date(period['end'])} "
        f"({days} days), daily fire activity stayed above the baseline. "
        f"MODIS recorded {modis} detections and VIIRS recorded {viirs} "
        f"detections in this period. Anomaly flags mark a deviation from "
        f"the selected baseline; they are not a forecast or an early "
        f"warning. {SOURCE_LINE}"
    )


def group_narration(gid, harm):
    """Narrate one match/ambiguous group from its computed evidence."""
    g = harm[harm["match_group_id"] == gid]
    if len(g) == 0:
        return None
    status = g["match_status"].iloc[0]
    sensors = ", ".join(sorted(
        f"{r['sensor']} ({r['satellite']})" for _, r in g.iterrows()))
    frps = g["frp_mw"].dropna()
    frp_txt = (f" Fire radiative power in this group ranges from "
               f"{round(float(frps.min()), 1)} to {round(float(frps.max()), 1)} MW."
               if len(frps) else "")
    dists = g["distance_km"].dropna()
    dist_txt = (f" The closest cross-sensor distance in this group is "
                f"{round(float(dists.min()), 2)} km."
                if len(dists) else "")
    if status == "matched":
        head = (f"This is a confirmed one-to-one matched pair: one MODIS "
                f"detection and one VIIRS detection that agree in space "
                f"(within 1.0 km) and time (within 4 hours).")
    else:
        head = (f"This is an ambiguous candidate group of {len(g)} "
                f"detections. More than one cross-sensor partner is "
                f"possible, so no single match is confirmed.")
    return (f"{head} It contains {sensors}.{frp_txt}{dist_txt} "
            f"{SOURCE_LINE}")


WELCOME = (
    "Welcome to FireFusion AI. This dashboard harmonizes NASA MODIS and "
    "VIIRS fire detections for California, July to September 2023. The map "
    "shows every detection, coloured by sensor and matching status. The "
    "calendar shows daily activity and flags unusual days. The Comparison "
    "Lab shows how the matching changes when the distance and time rules "
    "change, and how fire radiative power compares between the sensors. "
    "Select any day or group and I will describe what the data actually "
    "shows. " + SOURCE_LINE
)

SENSOR_EXPLAINER = (
    "MODIS and VIIRS see fire differently. MODIS observes at about 1 km "
    "resolution from two satellites, Terra in the morning and Aqua in the "
    "afternoon, and reports confidence as a number from 0 to 100. VIIRS "
    "observes at 375 m from NOAA-20 and S-NPP, and reports confidence as "
    "low, nominal or high. Because VIIRS pixels are smaller, it detects "
    "more, smaller fires than MODIS, and its fire radiative power values "
    "are lower for the same fire -- a 1 km MODIS pixel integrates more "
    "burning area than a 375 m VIIRS pixel. That is why the two sensors "
    "are compared, never added together. " + SOURCE_LINE
)


def main():
    ap = argparse.ArgumentParser(description="FireFusion AI FIRA narration (M2)")
    ap.add_argument("--harmonized", required=True)
    ap.add_argument("--comparison", required=True)
    ap.add_argument("--periods", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    harm = pd.read_parquet(args.harmonized)
    comparison = json.loads(Path(args.comparison).read_text())
    periods = json.loads(Path(args.periods).read_text())

    harm["date"] = harm["timestamp_utc"].dt.strftime("%Y-%m-%d")
    flagged_dates = {f["date"] for f in periods["flagged_days"]}

    days = {}
    for date, day in harm.groupby("date"):
        days[date] = day_narration(date, day, date in flagged_dates)

    crit = [period_narration(p, harm) for p in periods["critical_periods"]]

    # Example group narrations: largest ambiguous group, first matched pair,
    # highest-FRP group.
    groups = {}
    amb = harm[harm["match_status"] == "ambiguous"]
    if len(amb):
        largest = amb["match_group_id"].value_counts().idxmax()
        groups["largest_ambiguous_group"] = {
            "match_group_id": largest,
            "narration": group_narration(largest, harm),
        }
    matched = harm[harm["match_status"] == "matched"]
    if len(matched):
        first = sorted(matched["match_group_id"].unique())[0]
        groups["first_matched_pair"] = {
            "match_group_id": first,
            "narration": group_narration(first, harm),
        }
    if harm["frp_mw"].notna().any():
        top = harm.loc[harm["frp_mw"].idxmax()]
        gid = top["match_group_id"]
        if isinstance(gid, str):
            groups["highest_frp_group"] = {
                "match_group_id": gid,
                "narration": group_narration(gid, harm),
            }

    out = {
        "welcome": WELCOME,
        "sensor_explainer": SENSOR_EXPLAINER,
        "season": season_narration(harm, comparison, periods),
        "days": days,
        "critical_periods": [
            {"start": p["start"], "end": p["end"], "narration": n}
            for p, n in zip(periods["critical_periods"], crit)
        ],
        "groups": groups,
        "rules": [
            "Every number comes from computed results; nothing is invented.",
            "No causes, impacts or casualties are stated.",
            "Raw counts are detections, not unique real-world fires.",
            "Ambiguous groups are never presented as confirmed matches.",
            "Fire radiative power is compared, never added across sensors.",
            "Anomaly flags are deviations from the baseline, not forecasts.",
        ],
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, indent=2))
    print(f"narrations: {len(days)} days, {len(crit)} critical periods, "
          f"{len(groups)} example groups")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
