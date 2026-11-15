<div align="center">

# 🔥 FireFusion AI

**Two satellites see fire differently. FireFusion AI shows how they differ, where they agree, and what it means.**

[![NASA Space Apps](https://img.shields.io/badge/NASA_Space_Apps-2026-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](#)
[![Team](https://img.shields.io/badge/Team-HR_Pyrovanta_(%23786)-FF0000?style=for-the-badge)](#)
[![Python](https://img.shields.io/badge/Python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)](#)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
[![Groq AI](https://img.shields.io/badge/Powered_by-Groq_AI-F55036?style=for-the-badge&logo=groq&logoColor=white)](#)

*Challenge: Harmonization of MODIS and VIIRS Hot Spots*

### 🚀 [Explore the Live Data Demo](https://hr-pyro-vanta-72yy.vercel.app/)

<br>
</div>

<details open>
  <summary><b>📋 Table of Contents</b></summary>
  
  - [📖 What is FireFusion AI?](#-what-is-firefusion-ai)
  - [📊 Headline Results](#-headline-results)
  - [🧠 AI-Powered Analytics (NEW)](#-ai-powered-analytics-new)
  - [✨ Core Platform Features](#-core-platform-features)
  - [⚙️ Architecture & Data Flow](#️-architecture--data-flow)
  - [🚀 The Future](#-the-future)
  - [💻 Getting Started](#-getting-started)
  - [👥 Team HR Pyrovanta](#-team-hr-pyrovanta-786)
</details>

---

## 📖 What is FireFusion AI?

Responders often get conflicting maps from different satellites. **FireFusion AI** is a web application that harmonizes NASA **MODIS** and **VIIRS** active-fire detections into one explorable, unified map. We solve the confusion by clearly showing which detections are the same fire and which are not.

> 💡 **Core Philosophy:** We do *not* claim to count real-world fires. We illustrate how the two sensors agree and differ, preserving every original observation without forcing false certainty.

### 📍 Selected Regions & Datasets (California, USA)
Users can instantly switch between three distinct datasets directly from the UI:
- 📅 **2023 Season:** 1 July – 30 September 2023 *(Featured case study)*
- 📅 **2026 Season:** Recent historical archive integration
- 🔴 **LIVE Mode:** The last 5 days of real-time FIRMS data

---

## 📊 Headline Results

*Comparing the 2023 vs 2026 California Fire Seasons based on real NASA FIRMS Data.*

| Metric | 2023 Season | 2026 Season |
| :--- | :--- | :--- |
| **Total Records** | **39,899** (MODIS: 3,721 \| VIIRS: 36,178) | **33,027** Records |
| **Confirmed Matches** | **98** (One-to-one matched pairs) | **64** Matched pairs |
| **Match Coverage** | **2.6%** | **1.9%** |
| **Ambiguous Groups** | **954** candidate groups | - |
| **Unmatched Records**| **23,559** detections | - |
| **Peak Busiest Day** | **19 Aug 2023** *(2,111 detections)* | **11 Aug 2026** *(1,414 detections)* |

---

## 🧠 AI-Powered Analytics (NEW)

FireFusion AI now integrates real-time, data-grounded AI analysis powered by **Groq (`openai/gpt-oss-120b`)**. *Note: The AI strictly quotes real FIRMS data and never invents numbers.*

* ⚖️ **Season Comparison (AI):** One click on <kbd>✦ Compare seasons</kbd> in the Comparison Lab prompts the AI to evaluate the 2023 and 2026 California fire seasons side-by-side. It breaks down total records, matched pairs, match coverage, ambiguous groups, peak days, and FRP correlation. *(Covers archive seasons only; Live mode displays a contextual note).*
* 📅 **Explain this Day (AI):** Every row in the Anomalous days panel features an <kbd>✦ Explain</kbd> button. Clicking it generates an inline, plain-English narration of that day using its real numbers: total detections, MODIS/VIIRS split, daily average multipliers, flagging sensor, robust-z score, and strongest FRP. Explanations are cached per day for instant re-opening.
* 🤖 **Ask FireFusion AI (FIRA):** A conversational chat panel embedded directly in the app, ready to answer custom questions from your real data.

> ⚠️ **Fallback Grace:** If the `GROQ_API_KEY` is not configured in Vercel, the panels gracefully display *"AI isn't connected yet"* without breaking the app.

---

## ✨ Core Platform Features

* 🗺️ **Guided Tour & Interactive Map:** A guided tour walks first-time users through the platform. The map lets you toggle layers by sensor and matching status. Click any dot to inspect its sensor, FRP, confidence, and match status.
* 📈 **Dashboard & Explainers:** View detection counts instantly. Includes a **"Why is the match rate only 2.6%?" Explainer** button on the Match Coverage KPI that breaks down the scientific reasons in plain English.
* 🗓️ **Activity Calendar:** Track daily MODIS and VIIRS activity with anomaly outlines. 
* 🧪 **Comparison Lab & Anomalies:** Test sensitivity to distance and time windows across satellite pairs. Includes an **Anomaly Explainer** that lists flagged days—clicking any specific day instantly jumps the map to that date.
* 📥 **Export Ready:** Downloadable harmonized datasets directly from the UI.

---

## ⚙️ Architecture & Data Flow

FireFusion AI is built for speed and reliability. There is **zero backend required** for the historical data viewer, ensuring rapid load times and full offline capability for cached datasets.

```mermaid
graph LR
    A[NASA FIRMS Raw Files] -->|Preprocessing| B(Data Cleaning & Standardization)
    B -->|Python Pandas/BallTree| C{Harmonization Engine}
    C -->|One-to-One Matches| D[Exported CSVs / JSONs]
    C -->|Ambiguous/Unmatched| D
    D -->|Static API via public/data| E((React + Vite Web App))
    E <-->|Groq gpt-oss-120b| F[AI Features & FIRA]
```

<details>
<summary><b>📐 Click to view Strict Matching Rules & Sensitivities</b></summary>
<br>

| Rule Parameter | Threshold |
| :--- | :--- |
| **Distance** | 1.0 km or less *(Haversine, BallTree)* |
| **Time** | 4 hours or less difference *(UTC)* |
| **Confirmed Match** | Exactly **one-to-one** only |
| **Ambiguous Match** | Multiple possible partners. *Honesty over false certainty: a match is never forced.* |

> *Anomaly flags use a robust z-score (median and MAD of daily counts per sensor) above 3.5. These are statistical deviations from the three-month window, not predictive forecasts.*
</details>

---

## 🚀 The Future

From California to the world: our method works for any region or sensor pair. 
**Next Step:** Mapping **Pakistan's own fire seasons** using this exact harmonization methodology to provide faster, trusted fire maps for local responders, moving towards near-real-time alerts.

---

## 💻 Getting Started

### Local Deployment
Ensure you have `Node.js` installed.

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev          

# 4. Build for production (Optional)
npm run build        
npm run preview      # Serve the production build locally
```
> 🔑 **Environment Variables:** Create a `.env` file and add your `VITE_GROQ_API_KEY` (or configure `GROQ_API_KEY` in Vercel) for the AI features to function.

<details>
<summary><b>⚠️ View Limitations & Disclaimers</b></summary>
<br>

- **Not Ground Truth:** Satellite detections are not ground-confirmed fires. A missing detection does not guarantee the absence of fire (affected by clouds, smoke, etc.).
- **Metrics:** FRP is compared *between* sensors, never summed across them. Hotspots do not measure total burned area.
- **Non-Predictive:** The anomaly baseline spans three months, not long-term climatology. This is **not** an early-warning predictive system.
</details>

---

## 📜 Data Attribution

- **Fire Data:** [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) (Fire Information for Resource Management System): MODIS Collection 6.1 and VIIRS 375 m active-fire data (NOAA-20 and Suomi NPP). *Without FIRMS open data, there is no project.*
- **Satellite Basemap:** Esri World Imagery (Esri, Maxar, Earthstar Geographics).

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
  <i>Built for the NASA Space Apps Challenge 2026</i>
</div>
