// Real-data loader — reads the precomputed M2/M3 contract files that ship
// as static assets in frontend/public/data/ (copied from the repo's
// frontend_data/) and reshapes them into the shapes the frontend's API
// client (src/lib/api.ts) already expects.
//
// Why this file exists: the contract files are nested / named differently
// from the API contract (summary.json nests counts under `counts`, the
// comparison uses window_hours / satellite_pair / pearson_r, detections
// only exist as per-day GeoJSON, daily.json is one row per sensor). The
// backend that was supposed to do this reshaping does not exist yet, so
// the frontend does it here, from static files — no backend needed.
// When a real backend is deployed and VITE_API_URL is set, api.ts tries
// it first and only falls back to these loaders.
//
// YEAR SELECTOR (2026-11-15): every loader takes a year. 2023 reads
// /data (the original season); 2026 reads /data/2026 (the second dataset,
// FIRMS archive + NRT, Jul–Sep 2026). The peak day and season total are
// NOT hardcoded — loadSeasonInfo() reads them from that year's
// summary.json, so the hero map and the real map always use the right
// peak day for the selected year.
import type {
  Comparison,
  DailyRow,
  Detection,
  DetectionsResponse,
  FiraResponse,
  Meta,
  Summary,
} from './api'

export function dataBase(year: number): string {
  return year === 2026 ? '/data/2026' : '/data'
}

async function fetchJson<T>(path: string, year: number): Promise<T> {
  // Fail LOUDLY for 'live': archive loaders only serve 2023 and 2026.
  // Silently returning the 2023 files for a live request would present
  // old numbers as live data — the worst possible bug for this app.
  if (year !== 2023 && year !== 2026) {
    throw new Error(`No static data for dataset "${year}" — archive loaders only serve 2023 and 2026`)
  }
  const res = await fetch(`${dataBase(year)}${path}`)
  if (!res.ok) throw new Error(`Missing static data file: ${path} (year ${year})`)
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// summary.json (nested) -> Summary (flat, what KpiStrip / Hero read)
// ---------------------------------------------------------------------------
interface RawSummary {
  counts: {
    modis: number
    viirs: number
    matched_pairs: number
    ambiguous_groups: number
    unmatched: number
    exact_duplicates: number
  }
  by_sensor: {
    MODIS: { mean_frp_mw: number }
    VIIRS: { mean_frp_mw: number }
  }
  peak_day: { date: string; modis: number; viirs: number; total: number }
  match_coverage: {
    MODIS: { match_coverage_pct: number; eligible_records: number; confirmed_matched_records: number; ambiguous_records: number }
    VIIRS: { match_coverage_pct: number; eligible_records: number; confirmed_matched_records: number; ambiguous_records: number }
  }
  // Critical periods (runs of flagged days) — used by the Ask AI context
  // so the model can name them instead of inventing dates.
  critical_periods: Array<{ start: string; end: string; days: string[] }>
}

export async function loadSummary(year: number): Promise<Summary> {
  const raw = await fetchJson<RawSummary>('/summary.json', year)
  const c = raw.counts
  return {
    modis: c.modis,
    viirs: c.viirs,
    matched: c.matched_pairs,
    ambiguous: c.ambiguous_groups,
    unmatched: c.unmatched,
    exact_duplicates: c.exact_duplicates,
    coverage_modis: raw.match_coverage.MODIS.match_coverage_pct,
    coverage_viirs: raw.match_coverage.VIIRS.match_coverage_pct,
    // Eligible denominators behind the coverage % (the KPI strip shows
    // matched/all-MODIS, e.g. 2.6%; the eligible figure is 2.83%).
    coverage_modis_denominator: raw.match_coverage.MODIS.eligible_records,
    coverage_viirs_denominator: raw.match_coverage.VIIRS.eligible_records,
    // Critical periods as "start → end" strings for the Ask AI context.
    critical_periods: (raw.critical_periods ?? []).map((p) => `${p.start} → ${p.end}`),
    mean_frp_modis: raw.by_sensor.MODIS.mean_frp_mw,
    mean_frp_viirs: raw.by_sensor.VIIRS.mean_frp_mw,
    peak_day: raw.peak_day.date,
    summary_line: `Across Jul–Sep ${year}, MODIS recorded ${c.modis.toLocaleString()} detections and VIIRS recorded ${c.viirs.toLocaleString()}. FireFusion confirmed ${c.matched_pairs.toLocaleString()} one-to-one matched pairs (${raw.match_coverage.MODIS.match_coverage_pct.toFixed(2)}% of MODIS) and kept ${c.ambiguous_groups.toLocaleString()} candidate groups ambiguous. Peak day ${raw.peak_day.date} (${raw.peak_day.total.toLocaleString()} detections).`,
  }
}

// Peak day + season total for a year, read from that year's summary.json.
// Used by loadDetections() and RealMap so neither hardcodes a 2023 date.
export async function loadSeasonInfo(year: number): Promise<{ peakDay: string; peakTotal: number; total: number }> {
  const raw = await fetchJson<RawSummary>('/summary.json', year)
  return {
    peakDay: raw.peak_day.date,
    peakTotal: raw.peak_day.total,
    total: raw.counts.modis + raw.counts.viirs,
  }
}

// ---------------------------------------------------------------------------
// daily.json (184 rows, one per sensor per day) -> DailyRow[] (92 rows,
// one per date with both sensors in it)
// ---------------------------------------------------------------------------
interface RawDailyRow {
  date: string
  sensor: 'MODIS' | 'VIIRS'
  detections: number
  matched_records: number
  ambiguous_records: number
  unmatched_records: number
  robust_z: number | null
  flagged: boolean
}

export async function loadDaily(year: number): Promise<DailyRow[]> {
  const raw = await fetchJson<RawDailyRow[]>('/daily.json', year)
  const byDate = new Map<string, DailyRow>()
  for (const r of raw) {
    let row = byDate.get(r.date)
    if (!row) {
      row = {
        date: r.date,
        modis: 0,
        viirs: 0,
        matched: 0,
        ambiguous: 0,
        unmatched: 0,
        robust_z_modis: 0,
        robust_z_viirs: 0,
        anomaly: false,
      }
      byDate.set(r.date, row)
    }
    if (r.sensor === 'MODIS') {
      row.modis = r.detections
      row.robust_z_modis = r.robust_z ?? 0
    } else {
      row.viirs = r.detections
      row.robust_z_viirs = r.robust_z ?? 0
    }
    // matched / ambiguous / unmatched are per-sensor records of the same
    // day's groups — take the larger of the two sensors' values so the
    // day total is not double-counted.
    row.matched = Math.max(row.matched, r.matched_records)
    row.ambiguous = Math.max(row.ambiguous, r.ambiguous_records)
    row.unmatched = Math.max(row.unmatched, r.unmatched_records)
    row.anomaly = row.anomaly || r.flagged
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1))
}

// ---------------------------------------------------------------------------
// comparison.json -> Comparison (exact API shape; renames every key)
// ---------------------------------------------------------------------------
interface RawComparison {
  sensitivity: Array<{
    radius_km: number
    window_hours: number
    satellite_pair: string
    match_coverage_pct: number
    matched_pairs: number
    denominator_modis: number
  }>
  frp_correlation: {
    pearson_r: number
    spearman_rho: number
    by_satellite_pair?: Record<string, { pearson_r: number; spearman_rho: number; n_matched_pairs: number }>
  }
  confidence_distribution: Record<string, number[]>
  day_night_split: Record<string, { day: number; night: number }>
}

export async function loadComparison(year: number): Promise<Comparison> {
  const raw = await fetchJson<RawComparison>('/comparison.json', year)
  return {
    sensitivity: raw.sensitivity.map((r) => ({
      radius_km: r.radius_km,
      window_h: r.window_hours,
      pair: r.satellite_pair.replace('-', '–'),
      coverage_pct: r.match_coverage_pct,
      numerator: r.matched_pairs,
      denominator: r.denominator_modis,
    })),
    frp_correlation: {
      pearson: raw.frp_correlation.pearson_r,
      spearman: raw.frp_correlation.spearman_rho,
    },
    confidence: raw.confidence_distribution,
    day_night: raw.day_night_split,
  }
}

// ---------------------------------------------------------------------------
// fira_narration.json -> FiraResponse { text, source }
// Season text when no date is selected, that day's text otherwise.
// ---------------------------------------------------------------------------
interface RawFira {
  season: string
  days: Record<string, string>
}

export async function loadFira(date: string | undefined, year: number): Promise<FiraResponse> {
  const raw = await fetchJson<RawFira>('/fira_narration.json', year)
  const text = (date && raw.days[date]) || raw.season
  return { text, source: 'NASA FIRMS harmonization (MODIS C6.1 / VIIRS 375 m)' }
}

// ---------------------------------------------------------------------------
// config.json -> Meta
// ---------------------------------------------------------------------------
interface RawConfig {
  region_name: string
  bbox: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }
  date_range: { from: string; to: string }
  products: string[]
  retrieval_date: string
  matching: { max_distance_km: number; max_time_diff_hours: number }
  attribution: string
}

export async function loadMeta(year: number): Promise<Meta> {
  const raw = await fetchJson<RawConfig>('/config.json', year)
  return {
    region: raw.region_name,
    bbox: raw.bbox,
    date_range: raw.date_range,
    products: raw.products,
    retrieval_date: raw.retrieval_date,
    matching: { spatial_km: raw.matching.max_distance_km, temporal_h: raw.matching.max_time_diff_hours },
    provenance: raw.attribution,
  }
}

// ---------------------------------------------------------------------------
// points/<date>.geojson -> DetectionsResponse
// The map is a season overview and the app asks for one season sample
// (limit 700), so we load the year's PEAK day (the most representative
// day) and take a strided sample across the whole state so the dots
// spread like the demo's clusters. Every dot is a real detection: real
// lat/lon, FRP, confidence, match status, and (for matched pairs) the
// real partner distance / time gap.
// ---------------------------------------------------------------------------
interface GeoFeature {
  type: string
  geometry: { type: string; coordinates: [number, number] }
  properties: {
    record_id: string
    sensor: 'MODIS' | 'VIIRS'
    satellite: string
    timestamp_utc: string
    frp_mw: number
    confidence_raw: string
    match_status: 'matched' | 'ambiguous' | 'unmatched'
    match_group_id: string | null
    distance_km: number | null
    time_diff_hours: number | null
  }
}

interface GeoCollection {
  type: string
  features: GeoFeature[]
}

function toDetection(f: GeoFeature): Detection {
  const p = f.properties
  return {
    id: p.record_id,
    sensor: p.sensor,
    satellite: p.satellite,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    timestamp: p.timestamp_utc,
    confidence: Number(p.confidence_raw) || 0,
    frp: p.frp_mw,
    match_status: p.match_status,
    match_group_id: p.match_group_id,
    // Real partner evidence for matched pairs (carried through to the
    // Inspector via apiPoint in App.tsx).
    distance_km: p.distance_km,
    time_diff_hours: p.time_diff_hours,
  } as Detection & { distance_km: number | null; time_diff_hours: number | null }
}

export async function loadDetections(limit = 200, year = 2023): Promise<DetectionsResponse> {
  const { peakDay, total } = await loadSeasonInfo(year)
  const geo = await fetchJson<GeoCollection>(`/points/${peakDay}.geojson`, year)
  const all = geo.features.map(toDetection)
  // Strided sample so the dots spread across California, not clumped.
  const step = Math.max(1, Math.floor(all.length / limit))
  const items: Detection[] = []
  for (let i = 0; i < all.length && items.length < limit; i += step) items.push(all[i])
  return { items, total, sampled: true, limit }
}
