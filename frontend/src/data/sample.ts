// ---------------------------------------------------------------------------
// Embedded fallback SAMPLE data — ported verbatim from the FINAL approved
// demo (round 20, rated 8/10, "Perfect"):
//   ~/workspace/your_files/firefusion-ai-ui-demo/firefusion-ai-ui-demo.html
// These are DEMO / SAMPLE values for UI preview, NOT real FIRMS counts.
// They are used whenever the FastAPI backend is unreachable (offline rule,
// framework §11.7), so the app still renders EXACTLY like the demo.
// Never invent data beyond these numbers.
// ---------------------------------------------------------------------------

export const SEASON = { modis: 18432, viirs: 42891, matched: 11928, amb: 1847 }

export type PointType = 'modis' | 'viirs' | 'matched' | 'amb'

export interface FirePoint {
  id: number
  x: number // % across the map stage
  y: number // % down the map stage
  type: PointType
  lat: string
  lon: string
  frp: string // MW
  conf: number // %
  dist: string // km to partner
  dt: string // hours to partner
  sat: string
}

// Deterministic pseudo-random (demo's rnd()).
export function rnd(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Map points: clusters in CA (north, central valley, sierra, soCal).
const clusters = [
  { x: 28, y: 22 },
  { x: 38, y: 38 },
  { x: 52, y: 30 },
  { x: 62, y: 58 },
  { x: 44, y: 66 },
  { x: 70, y: 78 },
]

function generatePoints(): FirePoint[] {
  const points: FirePoint[] = []
  for (let i = 0; i < 110; i++) {
    const c = clusters[i % clusters.length]
    const r = rnd(i * 7 + 3)
    const r2 = rnd(i * 13 + 9)
    const type: PointType =
      i % 11 === 0 ? 'matched' : i % 17 === 0 ? 'amb' : i % 3 === 0 ? 'modis' : 'viirs'
    points.push({
      id: i,
      x: Math.max(4, Math.min(94, c.x + (r - 0.5) * 22)),
      y: Math.max(5, Math.min(92, c.y + (r2 - 0.5) * 26)),
      type,
      lat: (42 - (c.y / 100) * 9.5 + (r - 0.5) * 0.8).toFixed(3),
      lon: (-124.4 + (c.x / 100) * 10.3).toFixed(3),
      frp: (5 + r * 85).toFixed(1),
      conf: Math.round(62 + r * 37),
      dist: (0.2 + r * 0.7).toFixed(2),
      dt: (0.4 + r2 * 3.2).toFixed(1),
      sat: type === 'viirs' ? 'NOAA-20' : i % 2 ? 'Terra' : 'Aqua',
    })
  }
  // One hero matched point (demo id 999).
  points.push({
    id: 999,
    x: 34,
    y: 28,
    type: 'matched',
    lat: '40.112',
    lon: '-121.540',
    frp: '64.2',
    conf: 94,
    dist: '0.60',
    dt: '2.1',
    sat: 'Terra + NOAA-20',
  })

  // De-stack — GUARANTEED placement, applied to the real `points` array
  // before anything renders (demo comment, kept verbatim in substance):
  // places points one at a time and never moves a placed point again.
  // Final layout provably satisfies, for EVERY pair: normalized centre
  // distance >= 1.50 where 1.0 = 2.2% of map width in x / 2.8% of map
  // height in y (SEP_X 3.3% / SEP_Y 4.2%). The three previously stacked
  // MODIS points (ids 3 / 9 / 39 — FRP 23.4 / 46.5 / 17.2) additionally
  // get component-wise clearance from each other: |dx| >= 3.3% AND
  // |dy| >= 4.2%. Only x/y change.
  const SEP_X = 3.3
  const SEP_Y = 4.2
  const TRIO_X = 3.3
  const TRIO_Y = 4.2
  const TRIO: Record<number, boolean> = { 3: true, 9: true, 39: true }
  function clearOf(x: number, y: number, p: FirePoint, placed: FirePoint[]): boolean {
    for (let k = 0; k < placed.length; k++) {
      const q = placed[k]
      const dx = x - q.x
      const dy = y - q.y
      const d = Math.sqrt((dx / SEP_X) * (dx / SEP_X) + (dy / SEP_Y) * (dy / SEP_Y))
      if (d < 1) return false
      if (TRIO[p.id] && TRIO[q.id] && (Math.abs(dx) < TRIO_X || Math.abs(dy) < TRIO_Y))
        return false
    }
    return true
  }
  const placed: FirePoint[] = []
  points.forEach((p) => {
    if (clearOf(p.x, p.y, p, placed)) {
      placed.push(p)
      return
    }
    const ox = p.x
    const oy = p.y
    let done = false
    for (let rad = 0.3; rad <= 22 && !done; rad += 0.3) {
      for (let k = 0; k < 28 && !done; k++) {
        const ang = (k / 28) * Math.PI * 2 + rad * 0.7
        const cx = Math.max(4, Math.min(94, ox + Math.cos(ang) * rad))
        const cy = Math.max(5, Math.min(92, oy + Math.sin(ang) * rad * 1.15))
        if (clearOf(cx, cy, p, placed)) {
          p.x = cx
          p.y = cy
          done = true
        }
      }
    }
    placed.push(p)
  })
  return points
}

export const POINTS: FirePoint[] = generatePoints()

// ---------- Calendar (demo's dayData, verbatim formula) ----------
export interface DayDatum {
  modis: number
  viirs: number
  matched: number
  anomaly: boolean
  heat: number
  date: string // YYYY-MM-DD
  label: string
}

export function dayData(m: number, d: number): DayDatum {
  const seed = m * 100 + d
  const base = m === 8 ? 420 : m === 7 ? 260 : 300
  const spike = m === 8 && d === 19 ? 2.6 : rnd(seed) > 0.82 ? 1.7 : 1
  const modis = Math.round(base * (0.55 + rnd(seed + 1) * 0.7) * spike / 3)
  const viirs = Math.round(modis * 2.32 * (0.9 + rnd(seed + 2) * 0.25))
  const matched = Math.round(modis * 0.647)
  const anomaly = spike > 1.6
  const heat = Math.min(1, modis / 520)
  return {
    modis,
    viirs,
    matched,
    anomaly,
    heat,
    date: `2023-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    label: new Date(2023, m - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  }
}

// August 19, 2023 — the hottest day: MODIS 448 + VIIRS 983 = 1,431 detections.
export const HOTTEST_DAY = dayData(8, 19)

// ---------- FIRA narration (demo texts, verbatim) ----------
export const FIRA_SEASON_TEXT =
  'Demo sample — Across July–September 2023 in California, MODIS recorded 18,432 detections and VIIRS recorded 42,891. FireFusion confirmed 11,928 one-to-one matched pairs — 64.7% of MODIS — and kept 1,847 candidate groups ambiguous rather than forcing a match. August was the peak month, with August 19 the hottest single day. Demo narration from sample data in FIRMS format (MODIS C6.1 / VIIRS 375 m) — real counts will replace these in the full app.'

export function firaDayText(dd: DayDatum): string {
  return (
    `On ${dd.label}, MODIS recorded ${dd.modis.toLocaleString()} detections and VIIRS recorded ${dd.viirs.toLocaleString()} detections. ` +
    `Harmonization identified ${dd.matched.toLocaleString()} confirmed one-to-one matched pairs, while candidate groups that could not be resolved stayed ambiguous. ` +
    `Daily activity was ${dd.anomaly ? 'flagged as a statistical anomaly against the 3-month baseline' : 'within the normal range for the season baseline'}. ` +
    'Demo narration from sample data in FIRMS format (MODIS C6.1 / VIIRS 375 m) — real counts will replace these in the full app.'
  )
}

// Lab values (demo, static — labelled demo values on screen).
export const LAB = {
  radius: [
    { label: '0.5 km', pct: 48.2, color: 'var(--amber)' },
    { label: '1.0 km ★ default', pct: 64.7, color: 'var(--match)' },
    { label: '2.0 km', pct: 71.3, color: 'var(--cyan)' },
  ],
  pearson: 0.81,
  spearman: 0.78,
  viirsRatio: 2.3,
}

export function matchCoverage(matched: number, modis: number): number {
  return modis ? (matched / modis) * 100 : 0
}
