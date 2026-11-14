import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LAB } from '../data/sample'
import { api, type Comparison } from '../lib/api'

// Sensor Comparison Lab (demo's #view-lab): match coverage vs. spatial
// radius, and why VIIRS sees more. FRP is never summed across sensors.
//
// Interactive (M5): the time-window and satellite-pair selectors read
// the backend's /api/v1/comparison (the full 36-row sensitivity table)
// and recompute the bars. When the backend is down the lab keeps the
// exact demo rendering (static bars, demo values) and the selectors stay
// disabled — nothing invents data. Sharjeel wires the backend; the lab
// becomes real the moment /comparison answers.
//
// The reader is tolerant of both field-name shapes: the API contract
// (window_h / pair / coverage_pct / numerator / denominator,
// pearson / spearman) and the raw comparison.json shape (window_hours /
// satellite_pair / match_coverage_pct / matched_pairs / denominator_modis,
// pearson_r / spearman_rho, by_satellite_pair).

const RADII = [
  { km: 0.5, label: '0.5 km', color: 'var(--amber)' },
  { km: 1.0, label: '1.0 km ★ default', color: 'var(--match)' },
  { km: 2.0, label: '2.0 km', color: 'var(--cyan)' },
]
const WINDOWS = [1, 4, 6]
const DEFAULT_PAIR = 'Terra–NOAA-20'

interface SensRow {
  radius_km: number
  window_h: number
  pair: string
  coverage_pct: number
  denominator: number
  placeholder: boolean
}

function normalize(comp: Comparison): SensRow[] {
  const raw = comp.sensitivity as unknown as Array<Record<string, unknown>>
  return raw
    .map((r) => ({
      radius_km: Number(r.radius_km),
      window_h: Number(r.window_h ?? r.window_hours),
      pair: String(r.pair ?? r.satellite_pair),
      coverage_pct: Number(r.coverage_pct ?? r.match_coverage_pct),
      denominator: Number(r.denominator ?? r.denominator_modis ?? 0),
      // The sample backend marks every row sample_placeholder: true.
      // Those are demo values, not measurements — never present them
      // as live. Only rows without the flag count as real data.
      placeholder: r.sample_placeholder === true,
    }))
    .filter((r) => Number.isFinite(r.coverage_pct))
}

function frpNumbers(comp: Comparison): {
  pearson: number | null
  spearman: number | null
  byPair: Record<string, { pearson_r?: number; spearman_rho?: number; n_matched_pairs?: number }>
} {
  const f = comp.frp_correlation as unknown as Record<string, unknown>
  return {
    pearson: typeof f.pearson === 'number' ? f.pearson : typeof f.pearson_r === 'number' ? f.pearson_r : null,
    spearman: typeof f.spearman === 'number' ? f.spearman : typeof f.spearman_rho === 'number' ? f.spearman_rho : null,
    byPair: (f.by_satellite_pair as Record<string, { pearson_r?: number; spearman_rho?: number; n_matched_pairs?: number }>) ?? {},
  }
}

export default function ComparisonLab() {
  const [windowH, setWindowH] = useState(4)
  const [pair, setPair] = useState(DEFAULT_PAIR)

  const { data: comparison } = useQuery({
    queryKey: ['comparison'],
    queryFn: () => api.comparison(),
    retry: false,
    staleTime: 60_000,
  })
  const { data: summary } = useQuery({
    queryKey: ['summary'],
    queryFn: () => api.summary('2023-07-01', '2023-09-30'),
    retry: false,
    staleTime: 60_000,
  })

  const live = useMemo(() => {
    if (!comparison) return null
    const rows = normalize(comparison)
    // Live only when at least one row is a real measurement. The sample
    // backend marks every row sample_placeholder — that stays demo mode
    // until Sharjeel wires in the real comparison.json.
    if (rows.length === 0 || rows.every((r) => r.placeholder)) return null
    return { rows: rows.filter((r) => !r.placeholder), frp: frpNumbers(comparison) }
  }, [comparison])

  const pairs = useMemo(
    () => (live ? Array.from(new Set(live.rows.map((r) => r.pair))).sort() : []),
    [live],
  )
  const activePair = pairs.includes(pair) ? pair : pairs[0] ?? DEFAULT_PAIR

  const bars = useMemo(() => {
    if (!live) return null
    return RADII.map((r) => {
      const row = live.rows.find(
        (x) => x.radius_km === r.km && x.window_h === windowH && x.pair === activePair,
      )
      return { ...r, pct: row ? row.coverage_pct : null, denominator: row?.denominator ?? null }
    })
  }, [live, windowH, activePair])

  const pairFrp = live?.frp.byPair[activePair]
  const ratio = summary && summary.modis > 0 ? (summary.viirs / summary.modis).toFixed(1) : null
  const denom = bars?.find((b) => b.denominator != null)?.denominator ?? null

  // Live bars, or the exact demo bars when the backend is down.
  const displayBars: Array<{ label: string; color: string; pct: number | null }> =
    bars ??
    LAB.radius.map((row) => ({ label: row.label, color: row.color, pct: row.pct }))

  return (
    <div className="card">
      <div className="card-h">
        <b>Sensor Comparison Lab</b>
        <span>Does the result survive different thresholds?</span>
      </div>
      <div className="card-b">
        <h4 style={{ margin: '0 0 4px', fontSize: 13 }}>
          Match coverage vs. spatial radius
        </h4>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
          {live
            ? `${activePair} pair, ${windowH} h window${
                denom ? ` • ${denom.toLocaleString()} eligible MODIS` : ''
              } • real data from the API.`
            : 'Terra–VIIRS and Aqua–VIIRS pairs, 4 h window. Every % shows its denominator in the full app.'}
        </p>

        {/* Selectors — new elements, existing .tabs/.tab styles only.
            Disabled until the backend answers, so nothing is faked. */}
        <div className="tabs" style={{ marginTop: 12 }} role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              className={`tab ${windowH === w ? 'active' : ''}`}
              disabled={!live}
              title={live ? `${w} hour time window` : 'Connect the backend to explore real thresholds'}
              onClick={() => setWindowH(w)}
            >
              {w} h
            </button>
          ))}
        </div>
        <div className="tabs" style={{ marginTop: 8 }} role="group" aria-label="Satellite pair">
          {(live ? pairs : ['Terra–NOAA-20', 'Terra–S-NPP', 'Aqua–NOAA-20', 'Aqua–S-NPP']).map((p) => (
            <button
              key={p}
              className={`tab ${activePair === p ? 'active' : ''}`}
              disabled={!live}
              title={live ? `${p} satellite pair` : 'Connect the backend to explore real thresholds'}
              onClick={() => setPair(p)}
            >
              {p}
            </button>
          ))}
        </div>
        {!live && (
          <p style={{ color: 'var(--muted)', fontSize: 11, margin: '8px 0 0' }}>
            Selectors unlock when the backend serves /api/v1/comparison — the bars below are demo values until then.
          </p>
        )}

        {displayBars.map((row) => (
          <div className="bar-row" key={row.label}>
            <span>{row.label}</span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${row.pct ?? 0}%`, background: row.color }}
              ></div>
            </div>
            <b className="mono">{row.pct == null ? '—' : `${row.pct.toFixed(1)}%`}</b>
          </div>
        ))}

        <h4 style={{ margin: '18px 0 4px', fontSize: 13 }}>Why VIIRS sees more</h4>
        <div className="two-col" style={{ marginTop: 10 }}>
          <div
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 14,
            }}
          >
            <b style={{ color: 'var(--amber)' }}>MODIS — 1 km</b>
            <p
              style={{
                color: 'var(--muted)',
                fontSize: 13,
                lineHeight: 1.6,
                margin: '6px 0 0',
              }}
            >
              Coarser pixels. Misses small, cool fires. Terra (morning) + Aqua
              (afternoon) overpasses.
            </p>
          </div>
          <div
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 14,
            }}
          >
            <b style={{ color: 'var(--cyan)' }}>VIIRS — 375 m</b>
            <p
              style={{
                color: 'var(--muted)',
                fontSize: 13,
                lineHeight: 1.6,
                margin: '6px 0 0',
              }}
            >
              Finer pixels. Detects smaller fires MODIS misses — hence ~{ratio ?? LAB.viirsRatio}
              × more detections in this {live ? 'real' : 'demo'} season.
            </p>
          </div>
        </div>
        <div className="info-box" style={{ marginTop: 12 }}>
          <b>FRP correlation on matched pairs:</b>{' '}
          {live && live.frp.pearson != null && live.frp.spearman != null ? (
            <>
              Pearson r = {live.frp.pearson.toFixed(2)} • Spearman ρ ={' '}
              {live.frp.spearman.toFixed(2)} (real data)
              {pairFrp && pairFrp.n_matched_pairs != null && pairFrp.n_matched_pairs >= 3
                ? ` • ${activePair}: r = ${(pairFrp.pearson_r ?? 0).toFixed(2)}, ρ = ${(pairFrp.spearman_rho ?? 0).toFixed(2)} (n = ${pairFrp.n_matched_pairs})`
                : ''}
              . FRP is never summed across sensors.
            </>
          ) : (
            <>
              Pearson r = {LAB.pearson.toFixed(2)} • Spearman ρ ={' '}
              {LAB.spearman.toFixed(2)} (demo values). FRP is never summed
              across sensors.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
