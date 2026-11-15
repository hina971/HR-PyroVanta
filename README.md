<div align="center">

# 🔥 FireFusion AI

**Two satellites see fire differently. FireFusion AI shows how they differ, where they agree, and what it means.**

[![NASA Space Apps](https://img.shields.io/badge/NASA_Space_Apps-2026-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](#)
[![Team](https://img.shields.io/badge/Team-HR_Pyrovanta_(%23786)-FF0000?style=for-the-badge)](#)
[![Python](https://img.shields.io/badge/Python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)](#)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](#)

*Challenge: Harmonization of MODIS and VIIRS Hot Spots*

### 🚀 [Live Demo](https://hr-pyro-vanta-hwgq.vercel.app/)

</div>

---

## 📖 What it is

FireFusion AI is a web application that harmonizes NASA **MODIS** and **VIIRS** active-fire detections into one explorable, unified view. By selecting a specific area, users can interact with:

- 🗺️ **Interactive Map**
- 📅 **Burning Activity Calendar**
- 🔬 **Sensor Comparison Lab**
- 🤖 **FIRA:** A data-grounded storyteller and chat assistant

> **Note:** FireFusion AI does *not* claim to count real-world fires. It illustrates how the two sensors agree and differ, preserving every original observation.

**📍 Case Study:** California, USA, 1 July – 30 September 2023 *(Featured Month: August 2023)*

---

## 📊 Headline Results (Real NASA FIRMS Data)

| Metric | Details |
| :--- | :--- |
| **Total Records** | **39,899** (MODIS: 3,721 \| VIIRS: 36,178) |
| **Satellites Used** | Terra, Aqua (MODIS C6.1) · NOAA-20, S-NPP (VIIRS 375 m) |
| **Confirmed Matches** | **98** (One-to-one matched pairs) |
| **Ambiguous Groups** | **954** candidate groups |
| **Unmatched Records**| **23,559** |
| **Match Coverage** | MODIS: 98 of 3,462 eligible (2.83%) <br> VIIRS: 98 of 34,819 eligible (0.28%) |
| **Busiest Day** | 19 August 2023 *(2,111 detections)* |
| **Flagged/Critical** | 36 Flagged days / 5 Critical periods |

---

## ✨ Key Features

- 📈 **Dashboard & KPIs:** View detection counts by sensor, alongside matched, ambiguous, and unmatched records. Includes a **"Why is the match rate only 2.6%?" Explainer** button on the Match Coverage KPI that breaks down the reasons in plain English.
- 🗺️ **Interactive Fire Map:** Toggle layers by sensor and matching status. Click points to inspect and view the "How matching works" logic.
- 🗓️ **Activity Calendar:** Track daily MODIS and VIIRS activity with anomaly outlines. Click any day to filter platform-wide data.
- 🧪 **Comparison Lab & Anomalies:** Test sensitivity to distance and time windows across satellite pairs. Includes an **Anomaly Explainer** ("Anomalous days" button) that lists flagged days—clicking any specific day instantly jumps the map to that date.
- 🤖 **FIRA Storyteller & Chat:** FIRA (Fire Intelligence & Research Assistant) provides template-driven narration based on computed results. Now upgraded with **Ask FireFusion AI**, a Groq-powered chat panel embedded in the app that answers questions directly from your real data.
- 📥 **Export Ready:** Downloadable `harmonized.csv` and `comparison.csv` directly from the UI.

---

## ⚙️ Architecture & Data Flow

    NASA FIRMS Files ➔ Preprocessing ➔ Harmonization (Python) ➔ Exports ➔ React App

- **Data Science:** The Python pipeline handles standardization, spatial matching, anomaly scoring, and dynamic narration text generation.
- **Frontend App:** The UI reads precomputed files from `frontend/public/data/`. **Zero backend required.** No live calls to FIRMS—ensuring rapid load times and offline capability. (Groq API handles the FIRA chat).

### 📐 Matching Rules & Sensitivity

| Rule Parameter | Default Threshold |
| :--- | :--- |
| **Distance** | 1.0 km or less *(Haversine, BallTree)* |
| **Time** | 4 hours or less difference *(UTC)* |
| **Eligibility** | MODIS confidence 30 or higher · VIIRS nominal/high |
| **Confirmed Match** | Exactly **one** eligible partner |
| **Ambiguous Match** | Multiple possible partners *(never forced)* |
| **Unmatched** | No qualifying partner found |
| **Low-Confidence** | Kept & flagged *(excluded from primary matching)* |

> *Anomaly flags use a robust z-score (median and MAD of daily counts per sensor) above 3.5. These are statistical deviations from the three-month window, not predictive forecasts.*

---

## 📂 Repository Structure

    ├── data/raw/                   # Untouched NASA FIRMS files
    ├── data/processed/             # Standardized files, readiness gates, audit reports
    ├── export/                     # export.py, fira.py, to_contract.py
    ├── frontend_data/              # Data files consumed by the React app
    ├── frontend/                   # React + Vite application source code
    ├── FireFusion_M3_Deliverables/ # Harmonization scripts, config, results, testing
    └── docs/                       # Handover notes & documentation

---

## 💻 Getting Started

### Running the Web App

The application uses React and Vite. Ensure you have Node.js installed.

    cd frontend
    npm install
    npm run dev          # Start development server
    npm run build        # Build for production
    npm run preview      # Serve the production build locally (works offline)

*Note: Make sure data files from `frontend_data/` are copied into `frontend/public/data/`. The Groq API key is required in your environment variables for the "Ask FireFusion AI" feature to function.*

### Running the Data Pipeline
Refer to `docs/M2_DATA_EXPORT.md` for exports/narration and the `README` in `FireFusion_M3_Deliverables/` for harmonization tests. Runs entirely on cached files (No FIRMS API key required).

---

## ⚠️ Limitations & Disclaimers

- **Not Ground Truth:** Satellite detections are not ground-confirmed fires. A missing detection does not guarantee the absence of fire (affected by clouds, smoke, overpass gaps, and small fires).
- **Cluster Complexity:** Nearby detections are not assumed to be the same fire. A match group is not a unique real-world fire.
- **Metrics:** FRP is compared *between* sensors, never summed across them. Hotspots do not measure total burned area.
- **Data Extent:** NOAA-20 dataset ends on 29 Sept 2023; S-NPP covers 30 Sept. S-NPP was an extended scope addition.
- **Non-Predictive:** The anomaly baseline spans three months, not long-term climatology. This is **not** an early-warning or emergency prediction system.

---

## 📜 Data Attribution

**NASA FIRMS (Fire Information for Resource Management System):** MODIS Collection 6.1 and VIIRS 375 m active-fire data (NOAA-20 and Suomi NPP). 
🔗 [https://firms.modaps.eosdis.nasa.gov/](https://firms.modaps.eosdis.nasa.gov/)

---

## 👥 Team HR Pyrovanta (#786)

| Name | Role | Responsibilities |
| :--- | :--- | :--- |
| **[Hina Ramzan](https://www.linkedin.com/in/hina-ramzan/)** | 👑 Team Leader / Owner | Integration, deployment, README, demo video, submission |
| **[Muhammad Ihsan](https://www.linkedin.com/in/muhammad-ihsan-445350320/)** | 💾 Data Engineer | Data download, readiness gate, audit, provenance, exports, FIRA narration |
| **[Hasnain Ahmad](https://www.linkedin.com/in/hasnain-ahmad-047210349/)** | 🔬 Science Lead | Harmonization, sensitivity analysis, FRP correlation, anomaly detection, tests |
| **[Sharjeel Sarwar](https://www.linkedin.com/in/sharjeel-sarwar-a18414327/)** | 💻 Frontend Developer | App shell, dashboard, map, calendar, comparison lab, FIRA panel, downloads |
| **[Zukhraf Maryam](https://www.linkedin.com/in/zukhraf-maryam-275321293/)** | 🎨 Presentation | Slide deck creation, visual storytelling, pitch preparation, formatting |
<div align="center">
  <br>
  <i>Built for the NASA Space Apps Challenge</i>
</div>
