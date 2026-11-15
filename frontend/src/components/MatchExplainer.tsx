// Match Explainer — "Why is the match rate only X%?" (feature 2, v25).
//
// A static, data-grounded explainer that needs NO key, NO network call
// beyond the static files the app already loads, and can never invent a
// number: every figure is computed from the loaded summary data for the
// current year (archive) or the live window (live mode). It is
// deliberately DIFFERENT from the Ask AI chip that answers the same
// question via Groq — this one works even if the Groq key is never added.
//
// Opened by the "Why so low?" button on the Match Coverage KPI card.
// Closes via the X button, the Escape key, or clicking outside the panel.
//
// THE NUMBERS (computed here, never hardcoded):
// - Site coverage = matched pairs / ALL MODIS detections (2023: 98/3721
//   = 2.6%; 2026: 64/3318 = 1.9%).
// - Eligible coverage = matched pairs / MODIS detections that could
//   possibly match (2023: 98/3462 = 2.83%; 2026: 64/3137 = 2.04%).
// - MODIS stacked bar: matched pairs + MODIS records in ambiguous
//   groups + the rest unmatched (2023: 98 + 2,698 + 925 = 3,721;
//   2026: 64 + 1,486 + 1,768 = 3,318). Season check: matched records
//   (pairs x 2) + all ambiguous records + all unmatched = season total.
// - Live mode has no per-sensor ambiguous split, so its bar is matched
//   vs not-matched; a zero-detection live window shows a short note.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFireStore } from '../store'
import { api, type Summary } from '../lib/api'
import { formatLiveWindow, type LiveResponse } from '../lib/liveData'

const fmt = (n: number) => n.toLocaleString()

export default function MatchExplainer({
  summary,
  live,
  liveLoading,
}: {
  summary: Summary | null
  live?: LiveResponse | null
  liveLoading?: boolean
}) {
  const year = useFireStore((s) => s.year)
  const [open, setOpen] = useState(false)

  // Matching-rule parameters (1 km / 4 h / MODIS >= 30) read from the
  // year's config.json via the same query key as everywhere else — the
  // reasons quote them instead of hardcoding them. Same for every year.
  const archiveYear = year === 'live' ? 2023 : year
  const { data: meta } = useQuery({
    queryKey: ['meta', archiveYear],
    queryFn: () => api.meta(archiveYear),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const spatialKm = meta?.matching.spatial_km
  const temporalH = meta?.matching.temporal_h
  const modisMinConf = meta?.matching.modis_min_confidence

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const isLive = year === 'live'

  // ---- Figures, all computed from the loaded data (or live window) ----
  const loading = isLive ? !live && !!liveLoading : !summary
  const liveEmpty = isLive && !!live && live.totals.total === 0
  const liveMissing = isLive && !live && !liveLoading

  const modis = isLive ? live?.totals.modis ?? 0 : summary?.modis ?? 0
  const viirs = isLive ? live?.totals.viirs ?? 0 : summary?.viirs ?? 0
  const matched = isLive ? live?.matched ?? 0 : summary?.matched ?? 0
  const groups = isLive ? live?.ambiguous ?? 0 : summary?.ambiguous ?? 0
  const unmatched = isLive ? live?.unmatched ?? 0 : summary?.unmatched ?? 0
  const ambRecords =
    isLive
      ? live?.ambiguous_records ?? 0
      : (summary?.ambiguous_records_modis ?? 0) + (summary?.ambiguous_records_viirs ?? 0)
  const ambModis = isLive ? null : summary?.ambiguous_records_modis ?? null
  const sitePct = modis > 0 ? (matched / modis) * 100 : 0
  const eligiblePct = isLive
    ? live?.coverage.modis_eligible_pct ?? 0
    : summary?.coverage_modis ?? 0
  const eligibleDenom = isLive
    ? live?.coverage.modis_eligible ?? 0
    : summary?.coverage_modis_denominator ?? 0

  // MODIS bar segments. Archive years have the per-sensor ambiguous
  // split; live mode does not, so it shows matched vs not-matched.
  const bar: Array<{ label: string; count: number; color: string }> =
    !isLive && ambModis != null
      ? [
          { label: 'Matched 1-to-1', count: matched, color: 'var(--match)' },
          { label: 'In ambiguous groups', count: ambModis, color: 'var(--amb)' },
          { label: 'Unmatched', count: Math.max(0, modis - matched - ambModis), color: '#3A3D55' },
        ]
      : [
          { label: 'Matched 1-to-1', count: matched, color: 'var(--match)' },
          { label: 'Not matched', count: Math.max(0, modis - matched), color: '#3A3D55' },
        ]

  const seasonLabel = isLive
    ? live
      ? `Live window · last ${live.window.days} days · ${formatLiveWindow(live)}`
      : 'Live window · NASA FIRMS near-real-time'
    : `Jul–Sep ${year} · California · NASA FIRMS`

  return (
    <>
      <button
        className="match-why"
        onClick={() => setOpen(true)}
        aria-label="Why is the match rate so low?"
      >
        Why so low?
      </button>

      {open && (
        <div
          className="match-explainer-overlay"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <section
            className="match-explainer"
            role="dialog"
            aria-label="Why is the match rate so low?"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="match-explainer-h">
              <div>
                <b className="display">
                  {loading || liveMissing
                    ? 'Why is the match rate so low?'
                    : `Why is the match rate only ${sitePct.toFixed(1)}%?`}
                </b>
                <span>{seasonLabel}</span>
              </div>
              <button
                className="match-explainer-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {loading ? (
              <p className="match-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                Loading the season numbers…
              </p>
            ) : liveMissing ? (
              <p className="match-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                Live data isn’t available right now — switch to the 2023 or 2026 season to see
                the match-rate breakdown.
              </p>
            ) : liveEmpty ? (
              <p className="match-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                No live detections to explain yet — the live window has zero fire detections in
                California right now, so there is no match rate to break down. Switch to the
                2023 or 2026 season to see why the match rate is low there.
              </p>
            ) : (
              <>
                {/* Two coverage figures, denominators explained. */}
                <div className="match-cov">
                  <div>
                    <strong style={{ color: 'var(--match)' }}>{sitePct.toFixed(1)}%</strong>
                    <span>
                      of all MODIS detections
                      <br />
                      <small>
                        {fmt(matched)} of {fmt(modis)} MODIS matched 1-to-1
                      </small>
                    </span>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--amber)' }}>{eligiblePct.toFixed(2)}%</strong>
                    <span>
                      of MODIS that could possibly match
                      <br />
                      <small>
                        {fmt(matched)} of {fmt(eligibleDenom)} eligible
                      </small>
                    </span>
                  </div>
                </div>
                <p className="match-note">
                  Site counts every MODIS detection. Eligible counts only MODIS detections that
                  had a VIIRS detection close enough in space and time to possibly be the same
                  fire — the rest never had a partner to match with.
                </p>

                {/* Where the MODIS detections went. */}
                <h3 className="match-sub">Where the {fmt(modis)} MODIS detections went</h3>
                <div className="match-bar" aria-label="MODIS detection breakdown">
                  {bar.map((s) => (
                    <div
                      key={s.label}
                      style={{ width: `${modis > 0 ? (s.count / modis) * 100 : 0}%`, background: s.color }}
                    />
                  ))}
                </div>
                <div className="match-bar-legend">
                  {bar.map((s) => (
                    <span key={s.label}>
                      <i style={{ background: s.color }} />
                      {s.label} — {fmt(s.count)}
                      {modis > 0 ? ` (${((s.count / modis) * 100).toFixed(1)}%)` : ''}
                    </span>
                  ))}
                </div>

                {/* Season-level figures. */}
                <div className="match-chips">
                  <span className="match-chip">
                    <b>{fmt(groups)}</b> ambiguous groups
                  </span>
                  <span className="match-chip">
                    <b>{fmt(ambRecords)}</b> records in ambiguous groups
                  </span>
                  <span className="match-chip">
                    <b>{fmt(unmatched)}</b> unmatched detections
                  </span>
                  <span className="match-chip">
                    <b>{fmt(viirs)}</b> VIIRS detections
                  </span>
                </div>

                {/* Four reasons, each with one fact from the data. */}
                <h3 className="match-sub">Four reasons — all four are the method working, not failing</h3>
                <ol className="match-reasons">
                  <li>
                    <b>Different eyes.</b> MODIS pixels are 1 km across; VIIRS pixels are
                    375&nbsp;m, so VIIRS sees small fires MODIS physically cannot resolve.
                    This season VIIRS recorded {fmt(viirs)} detections to MODIS’s {fmt(modis)}.
                  </li>
                  <li>
                    <b>Different overpass times.</b> Terra, Aqua, S-NPP and NOAA-20 pass
                    hours apart, and a fire can flare or die between passes. The matching
                    window is only {temporalH != null ? `${temporalH} hours` : 'a few hours'} —
                    anything further apart is never a pair.
                  </li>
                  <li>
                    <b>Clouds.</b> A cloudy 1 km MODIS pixel hides a fire completely, while
                    VIIRS’s smaller pixels can still catch it through a gap. The pipeline only
                    counts MODIS detections at confidence ≥{' '}
                    {modisMinConf != null ? modisMinConf : 'its threshold'} — cloud is the
                    usual reason a pixel fails that bar.
                  </li>
                  <li>
                    <b>A strict rule, on purpose.</b> A pair needs ≤
                    {spatialKm != null ? `${spatialKm} km` : 'a kilometre'} and ≤
                    {temporalH != null ? `${temporalH} h` : 'a few hours'} with no competing
                    candidate. {fmt(groups)} groups had two or more candidates, so they stay
                    ambiguous — never forced into a match.
                  </li>
                </ol>

                <p className="match-takeaway">
                  A low match rate is the honest result of a strict rule — it means we never
                  pretend two different fires are the same one.
                </p>
                <p className="match-note">
                  Every figure above comes from the loaded {isLive ? 'live window' : `${year} season`} data —
                  nothing here is estimated. Want the AI version? Ask FireFusion (bottom right)
                  answers follow-ups from the same data.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}
