// Anomaly Explainer — "Anomalous days" (feature 3, v25).
//
// A static, data-grounded explainer: NO AI, NO key, NO network call
// beyond the daily rows the app already loads. Every figure is computed
// from the loaded data for the current year — never hardcoded.
//
// WHAT "ANOMALOUS" MEANS HERE: a day whose detections sit far above the
// season's normal. harmonize.py scores every sensor-day with a robust-z
// (how far it sits from the season's typical day, measured by median and
// MAD); a day is flagged when its robust-z passes 3.5. A flag means
// "far outside normal" — not a prediction, and not a judgement about how
// bad the fires were.
//
// THE DATA (read from the real files, 2026-11-15):
// - daily.json has 184 rows (92 days x 2 sensors) with detections,
//   robust_z, flagged, max_frp_mw, mean_frp_mw per sensor-day.
// - periods.json flagged_days are per-sensor rows; distinct flagged
//   DATES are 24 in 2023 and 9 in 2026 — the list is built per DATE,
//   severity = the day's highest robust-z across sensors.
// - Season daily average = season total / 92 days (2023: 39,899/92 =
//   433.7; 2026: 33,027/92 = 359.0). Every row's multiple is computed
//   from that average, never from a stored constant.
// - Live mode has no robust-z (a 5-day window is too short for one), so
//   it shows the busiest live days instead, labelled as such — never
//   presented as statistical anomalies. An empty live window shows a
//   short note.
//
// THE PAYOFF: clicking a day jumps the app to that date — selectDay +
// setMonth + setView('dashboard') — so RealMap, the calendar, the KPI
// day card and FIRA all show that day's fires.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFireStore } from '../store'
import { api, type DailyRow } from '../lib/api'
import { useLiveData } from '../lib/liveData'

const fmt = (n: number) => n.toLocaleString()

function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]} ${y}`
}

interface AnomDay {
  date: string
  total: number
  modis: number
  viirs: number
  maxZ: number
  maxZSensor: 'MODIS' | 'VIIRS'
  maxFrp: number
  mult: number
}

export default function AnomalyExplainer() {
  const year = useFireStore((s) => s.year)
  const selectDay = useFireStore((s) => s.selectDay)
  const setMonth = useFireStore((s) => s.setMonth)
  const setView = useFireStore((s) => s.setView)
  const [open, setOpen] = useState(false)

  // Same query key as KpiStrip / CalendarDock — shared, not refetched.
  // Disabled in live mode (archive loaders throw for 'live').
  const { data: daily, isLoading: dailyLoading } = useQuery({
    queryKey: ['daily', year],
    queryFn: () =>
      api.daily(
        year === 'live' ? 2023 : year,
        `${year === 'live' ? 2023 : year}-07-01`,
        `${year === 'live' ? 2023 : year}-09-30`,
      ),
    enabled: year !== 'live',
    retry: false,
    staleTime: 60_000,
  })
  const live = useLiveData()
  const isLive = year === 'live'

  // Flag threshold (robust-z) from the year's config.json — quoted in
  // the definition below instead of hardcoded. Same query key as the
  // Match Explainer, so it is shared, not refetched.
  const archiveYear = year === 'live' ? 2023 : year
  const { data: meta } = useQuery({
    queryKey: ['meta', archiveYear],
    queryFn: () => api.meta(archiveYear),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const zThresh = meta?.anomaly?.robust_z_threshold

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // ---- Archive: flagged days, one row per date, most severe first ----
  const rows: DailyRow[] = daily ?? []
  const seasonTotal = rows.reduce((s, r) => s + r.modis + r.viirs, 0)
  const seasonAvg = rows.length > 0 ? seasonTotal / rows.length : 0
  const anomDays: AnomDay[] = rows
    .filter((r) => r.anomaly)
    .map((r) => {
      const total = r.modis + r.viirs
      const viirsWorse = r.robust_z_viirs >= r.robust_z_modis
      return {
        date: r.date,
        total,
        modis: r.modis,
        viirs: r.viirs,
        maxZ: Math.max(r.robust_z_modis, r.robust_z_viirs),
        maxZSensor: (viirsWorse ? 'VIIRS' : 'MODIS') as 'MODIS' | 'VIIRS',
        maxFrp: r.max_frp,
        mult: seasonAvg > 0 ? total / seasonAvg : 0,
      }
    })
    .sort((a, b) => b.maxZ - a.maxZ)

  // ---- Live: busiest days of the window (no robust-z in 5 days) ----
  const liveDays = (live.data?.daily ?? []).slice().sort((a, b) => b.total - a.total)
  const liveAvg =
    liveDays.length > 0
      ? liveDays.reduce((s, d) => s + d.total, 0) / liveDays.length
      : 0
  const liveEmpty = isLive && !!live.data && live.data.totals.total === 0

  const jumpToDay = (date: string) => {
    const m = Number(date.slice(5, 7))
    setMonth(m)
    selectDay(date)
    setView('dashboard')
    setOpen(false)
    // Let the view switch render, then bring the map into view.
    window.setTimeout(
      () => document.getElementById('mainMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      80,
    )
  }

  const seasonLabel = isLive
    ? live.data
      ? `Live window · last ${live.data.window.days} days`
      : 'Live window · NASA FIRMS near-real-time'
    : `Jul–Sep ${year} · California · NASA FIRMS`

  return (
    <>
      <button
        className="anom-btn"
        onClick={() => setOpen(true)}
        aria-label="Show anomalous days"
      >
        ⚠ Anomalous days
      </button>

      {open && (
        <div
          className="anom-overlay"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <section
            className="anom-panel"
            role="dialog"
            aria-label="Anomalous days"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="anom-h">
              <div>
                <b className="display">Anomalous days</b>
                <span>{seasonLabel}</span>
              </div>
              <button
                className="anom-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="anom-def">
              “Anomalous” means a day whose detections sit far above the season’s normal.
              Each sensor-day gets a robust-z score — how far it sits from the season’s
              typical day (median and spread). A day is flagged when its robust-z{' '}
              {zThresh != null ? `passes ${zThresh}` : 'passes the flag threshold'}: far
              outside normal, not a prediction, and not a judgement about how
              bad the fires were.
            </p>

            {isLive ? (
              live.isLoading || live.isPending ? (
                <p className="anom-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  Loading live data…
                </p>
              ) : liveEmpty || !live.data ? (
                <p className="anom-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  No anomalous days in the live window yet — there are no live detections to
                  flag right now. Switch to the 2023 or 2026 season to see flagged days.
                </p>
              ) : (
                <>
                  <p className="anom-note">
                    A {live.data.window.days}-day window is too short for a robust-z flag, so
                    these are the <b>busiest days</b> in the live window — not statistical
                    anomalies.
                  </p>
                  <ul className="anom-list">
                    {liveDays.map((d) => (
                      <li key={d.date} className="anom-row">
                        <div className="anom-row-main">
                          <b>{fmtDateShort(d.date)}</b>
                          <span>
                            {fmt(d.total)} detections — {liveAvg > 0 ? (d.total / liveAvg).toFixed(1) : '—'}×
                            the window average of {fmt(Math.round(liveAvg))}
                          </span>
                        </div>
                        <span className="anom-row-sub">
                          MODIS {fmt(d.modis)} · VIIRS {fmt(d.viirs)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="anom-note">
                    The live map shows the whole window — pick a day in the 2023 or 2026
                    season to jump the map to it.
                  </p>
                </>
              )
            ) : dailyLoading || !daily ? (
              <p className="anom-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                Loading the season numbers…
              </p>
            ) : anomDays.length === 0 ? (
              <p className="anom-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                No anomalous days in this season.
              </p>
            ) : (
              <>
                <p className="anom-note">
                  <b>{anomDays.length} anomalous days</b> in {year} · season daily average{' '}
                  <b>{fmt(Math.round(seasonAvg))} detections</b> · click a day to jump the map
                  to it.
                </p>
                <ul className="anom-list">
                  {anomDays.map((d) => (
                    <li key={d.date}>
                      <button
                        className="anom-row"
                        onClick={() => jumpToDay(d.date)}
                        title={`Jump the map to ${fmtDateShort(d.date)}`}
                      >
                        <div className="anom-row-main">
                          <b>{fmtDateShort(d.date)}</b>
                          <span>
                            {fmt(d.total)} detections — {d.mult.toFixed(1)}× the daily average
                          </span>
                        </div>
                        <span className="anom-row-sub">
                          Flagged on {d.maxZSensor} (robust-z {d.maxZ.toFixed(1)}) · strongest
                          single detection {fmt(Math.round(d.maxFrp))} MW · MODIS {fmt(d.modis)} · VIIRS{' '}
                          {fmt(d.viirs)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="anom-note">
                  Every figure above comes from the loaded {year} season data — nothing here
                  is estimated. A flag says “far outside normal”, nothing about cause.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}
