// Typed fetch client for the FastAPI backend (framework §7).
// Base: /api/v1. All counts carry their denominators.
// API base URL from VITE_API_URL, default http://localhost:8000.
// No API keys, no live FIRMS calls at runtime — the backend serves
// precomputed outputs only. If the backend is unreachable, callers
// fall back to the embedded sample data in src/data/sample.ts.
//
// CONSOLE FIX — when the site is deployed (Vercel) and no VITE_API_URL is
// set, there is no backend to call: localhost:8000 would mean the viewer's
// own computer, which has no backend running, so every fetch fails with
// ERR_CONNECTION_REFUSED and the browser logs it. In that case get()
// rejects WITHOUT fetching, and callers fall back to sample data silently
// — no failed requests, no red console lines. As soon as VITE_API_URL is
// set (Render backend), fetches resume normally. Local dev (page on
// localhost) still defaults to http://localhost:8000.
const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const isLocalPage =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

export const API_BASE: string = envUrl || 'http://localhost:8000'

// True when there is a real backend URL to call.
const hasBackend = Boolean(envUrl) || isLocalPage

export interface Meta {
  region: string
  bbox: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }
  date_range: { from: string; to: string }
  products: string[]
  retrieval_date: string
  matching: { spatial_km: number; temporal_h: number }
  provenance: string
}

export interface Summary {
  modis: number
  viirs: number
  matched: number
  ambiguous: number
  unmatched: number
  exact_duplicates: number
  coverage_modis: number // % of MODIS matched 1-to-1
  coverage_viirs: number // % of VIIRS matched 1-to-1
  // Eligible denominators behind the coverage % (static-data path only;
  // the FastAPI backend does not return these yet). The KPI strip shows
  // matched / all MODIS (2.6% in 2023); the eligible figure is 2.83%.
  coverage_modis_denominator?: number
  coverage_viirs_denominator?: number
  // Critical periods as "start → end" strings (static-data path only).
  critical_periods?: string[]
  mean_frp_modis: number
  mean_frp_viirs: number
  peak_day: string
  summary_line: string
}

export interface Detection {
  id: string | number
  sensor: 'MODIS' | 'VIIRS'
  satellite: string
  lat: number
  lon: number
  timestamp: string
  confidence: number
  frp: number
  match_status: 'matched' | 'ambiguous' | 'unmatched'
  match_group_id?: string | null
  // Real partner evidence (from the static GeoJSON; absent from the API).
  distance_km?: number | null
  time_diff_hours?: number | null
}

export interface DetectionsResponse {
  items: Detection[]
  total: number
  sampled: boolean
  limit: number
}

export interface DetectionDetail extends Detection {
  partner?: Detection | null
  distance_km?: number | null
  time_diff_hours?: number | null
}

export interface DailyRow {
  date: string
  modis: number
  viirs: number
  matched: number
  ambiguous: number
  unmatched: number
  robust_z_modis: number
  robust_z_viirs: number
  anomaly: boolean
}

export interface Comparison {
  sensitivity: Array<{
    radius_km: number
    window_h: number
    pair: string
    coverage_pct: number
    numerator: number
    denominator: number
  }>
  frp_correlation: { pearson: number; spearman: number }
  confidence: Record<string, number[]>
  day_night: Record<string, { day: number; night: number }>
}

export interface Anomaly {
  date: string
  sensor: string
  count: number
  median: number
  mad: number
  robust_z: number
}

export interface FiraResponse {
  text: string
  source: string
}

export interface Health {
  status: string
  data_ready: boolean
}

import { dataBase, loadComparison, loadDaily, loadDetections, loadFira, loadMeta, loadSeasonInfo, loadSummary } from './realData'

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  // No backend configured on a deployed site — do not fire a request at
  // localhost:8000 (it would fail with ERR_CONNECTION_REFUSED and log in
  // the console). Reject immediately; callers fall back to sample data.
  if (!hasBackend) throw new Error('No backend configured — using sample data')
  const url = new URL(`${API_BASE}/api/v1${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`)
  return (await res.json()) as T
}

// Every method tries the FastAPI backend first; when it is unreachable
// (no backend yet — the placeholder Backendapp has no /api/v1 endpoints)
// it falls back to the precomputed real data in frontend/public/data/
// via src/lib/realData.ts. So the app shows REAL FIRMS numbers, not the
// embedded demo sample, with no backend deployed. When VITE_API_URL is
// set to a real backend, the backend wins and the static files are only
// a fallback.
//
// YEAR SELECTOR (2026-11-15): every method takes the dataset year first
// (2023 = /data, 2026 = /data/2026). The backend path ignores the year
// (it serves its own data); the static fallback uses it.
export const api = {
  meta: async (year = 2023) => {
    try {
      return await get<Meta>('/meta')
    } catch {
      return loadMeta(year)
    }
  },
  summary: async (year = 2023, from?: string, to?: string) => {
    try {
      return await get<Summary>('/summary', { ...(from ? { from } : {}), ...(to ? { to } : {}) })
    } catch {
      return loadSummary(year)
    }
  },
  detections: async (year = 2023, params?: Record<string, string>) => {
    try {
      return await get<DetectionsResponse>('/detections', params)
    } catch {
      return loadDetections(Number(params?.limit ?? 200), year)
    }
  },
  detection: (id: string | number) => get<DetectionDetail>(`/detections/${id}`),
  daily: async (year = 2023, from?: string, to?: string) => {
    try {
      return await get<DailyRow[]>('/daily', { ...(from ? { from } : {}), ...(to ? { to } : {}) })
    } catch {
      return loadDaily(year)
    }
  },
  comparison: async (year = 2023) => {
    try {
      return await get<Comparison>('/comparison')
    } catch {
      return loadComparison(year)
    }
  },
  anomalies: () => get<Anomaly[]>('/anomalies'),
  fira: async (year = 2023, date?: string, groupId?: string) => {
    try {
      return await get<FiraResponse>('/fira', { ...(date ? { date } : {}), ...(groupId ? { group_id: groupId } : {}) })
    } catch {
      return loadFira(date, year)
    }
  },
  health: () => get<Health>('/health'),
  downloadUrl: (year: number, file: 'harmonized.csv' | 'comparison.csv') =>
    `${import.meta.env.BASE_URL}data${year === 2026 ? '/2026' : ''}/${file}`,
  // Peak day + season total for a year (from that year's summary.json).
  seasonInfo: (year = 2023) => loadSeasonInfo(year),
}
