// Live FIRMS mode — client for the /api/firms-live Vercel function.
//
// The function fetches NASA FIRMS near-real-time detections for the
// California bbox (last 1–5 days), applies the same M2 filters and M3
// matching rules as the archive pipeline, and returns harmonized live
// data. This module is the frontend's only way to reach it: one shared
// TanStack Query key (['live', 5]) so every component that needs live
// data shares a single fetch per selection — the endpoint is NOT called
// on every render.
//
// HONEST LIMIT: the live window is only the last 5 days, and outside
// fire season it is often EMPTY (zero detections). That is expected, not
// a bug — every consumer must handle zero counts and show the empty
// state, never fall back to archive/sample data as if it were live.
import { useQuery } from '@tanstack/react-query'
import { useFireStore } from '../store'
import type { Detection } from './api'

export interface LivePoint {
  id: string
  lat: number
  lon: number
  sensor: 'MODIS' | 'VIIRS'
  satellite: string
  frp: number | null
  confidence: number | null
  confidence_raw: string
  acq_date: string
  acq_time: string
  timestamp_utc: string
  match: 'matched' | 'ambiguous' | 'unmatched'
  match_group_id: string | null
  distance_km: number | null
  time_diff_hours: number | null
  daynight: string
}

export interface LiveResponse {
  mode: 'live'
  window: { from: string; to: string; days: number }
  fetchedAt: string
  totals: { modis: number; viirs: number; total: number }
  matched: number
  ambiguous: number
  ambiguous_records: number
  unmatched: number
  duplicates: number
  coverage: {
    modis_site_pct: number
    modis_eligible_pct: number
    modis_eligible: number
    viirs_pct: number
    viirs_eligible: number
  }
  peakDay: { date: string; total: number; modis: number; viirs: number } | null
  daily: Array<{ date: string; modis: number; viirs: number; total: number }>
  points: LivePoint[]
  capped: boolean
  sources: Record<string, string>
  note: string
}

export type LiveError = Error & { code?: string; status?: number }

export async function fetchLive(days = 5): Promise<LiveResponse> {
  const res = await fetch(`/api/firms-live?days=${days}`)
  const data = await res.json().catch(() => null)
  if (res.ok && data && data.mode === 'live') return data as LiveResponse
  const err = new Error(
    (data && typeof data.error === 'string' && data.error) ||
      'Live FIRMS request failed — please try again.',
  ) as LiveError
  err.code = data?.code
  err.status = res.status
  throw err
}

// Shared live query — one fetch per selection, cached 5 minutes.
// Disabled unless the Live dataset is selected.
export function useLiveData() {
  const year = useFireStore((s) => s.year)
  return useQuery({
    queryKey: ['live', 5],
    queryFn: () => fetchLive(5),
    enabled: year === 'live',
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

// Plain-English error for the live endpoint (same wording as the
// function's own messages, so the UI never shows a raw code).
export function liveErrorMessage(error: unknown): string {
  const code = (error as LiveError | null)?.code
  if (code === 'not_configured') {
    return 'Live data isn’t connected yet — the FIRMS_API_KEY still needs adding in the Vercel project settings. The 2023 and 2026 archive seasons still work.'
  }
  if (code === 'invalid_key') {
    return 'FIRMS rejected the API key — it may have expired or been typed wrong. Check FIRMS_API_KEY in the Vercel project settings.'
  }
  return 'Could not reach NASA FIRMS just now — please try again in a moment.'
}

// "2026-11-11" -> "11 Nov 2026"; a window -> "11–15 Nov 2026".
export function fmtLiveDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]} ${y}`
}

export function formatLiveWindow(live: LiveResponse): string {
  const { from, to } = live.window
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (fy === ty && fm === tm) return `${fd}–${td} ${months[tm - 1]} ${ty}`
  return `${fmtLiveDate(from)} – ${fmtLiveDate(to)}`
}

// Live points -> the API Detection shape App.tsx's apiPoint() already
// maps (hero dots + Inspector). Confidence: MODIS numeric, VIIRS letter
// -> 0 here, exactly like the archive path (Number('n') -> 0), so the
// Inspector shows the same "Confidence 0%" quirk for VIIRS dots.
export function liveToDetections(live: LiveResponse): Detection[] {
  return live.points.map((p) => ({
    id: p.id,
    sensor: p.sensor,
    satellite: p.satellite,
    lat: p.lat,
    lon: p.lon,
    timestamp: p.timestamp_utc,
    confidence: p.confidence ?? 0,
    frp: p.frp ?? 0,
    match_status: p.match,
    match_group_id: p.match_group_id,
    distance_km: p.distance_km,
    time_diff_hours: p.time_diff_hours,
  }))
}

// FIRA-style narration for the live window (plain facts, no invention).
export function liveSummaryText(live: LiveResponse): string {
  const w = formatLiveWindow(live)
  const t = live.totals
  if (t.total === 0) {
    return `Live window ${w}: no active fire detections in California in the last ${live.window.days} days. Fire season is over — the satellites see nothing burning right now. Switch to the 2023 or 2026 season to explore an archive fire season.`
  }
  const peak = live.peakDay
    ? ` Peak day ${fmtLiveDate(live.peakDay.date)} with ${live.peakDay.total.toLocaleString()} detections.`
    : ''
  return (
    `Live window ${w}: ${t.modis.toLocaleString()} MODIS and ${t.viirs.toLocaleString()} VIIRS detections across California in the last ${live.window.days} days. ` +
    `FireFusion confirmed ${live.matched.toLocaleString()} one-to-one matched pairs (${live.coverage.modis_site_pct.toFixed(1)}% of MODIS) and kept ${live.ambiguous.toLocaleString()} candidate groups ambiguous. ` +
    `${live.unmatched.toLocaleString()} detections had no cross-sensor partner.${peak} ` +
    `Source: NASA FIRMS near-real-time (MODIS NRT + VIIRS 375 m NRT).`
  )
}
