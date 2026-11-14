// Typed fetch client for the FastAPI backend (framework §7).
// Base: /api/v1. All counts carry their denominators.
// API base URL from VITE_API_URL, default http://localhost:8000.
// No API keys, no live FIRMS calls at runtime — the backend serves
// precomputed outputs only. If the backend is unreachable, callers
// fall back to the embedded sample data in src/data/sample.ts.

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'

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

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}/api/v1${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`)
  return (await res.json()) as T
}

export const api = {
  meta: () => get<Meta>('/meta'),
  summary: (from?: string, to?: string) =>
    get<Summary>('/summary', { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
  detections: (params?: Record<string, string>) => get<DetectionsResponse>('/detections', params),
  detection: (id: string | number) => get<DetectionDetail>(`/detections/${id}`),
  daily: (from?: string, to?: string) =>
    get<DailyRow[]>('/daily', { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
  comparison: () => get<Comparison>('/comparison'),
  anomalies: () => get<Anomaly[]>('/anomalies'),
  fira: (date?: string, groupId?: string) =>
    get<FiraResponse>('/fira', { ...(date ? { date } : {}), ...(groupId ? { group_id: groupId } : {}) }),
  health: () => get<Health>('/health'),
  downloadUrl: (file: 'harmonized.csv' | 'comparison.csv') =>
    `${API_BASE}/api/v1/download/${file}`,
}
