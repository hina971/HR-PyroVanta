import { useFireStore } from '../store'
import { SEASON, dayData, matchCoverage } from '../data/sample'
import { useCountUp } from '../hooks/useCountUp'
import type { SeasonNumbers } from './Hero'

// KPI strip (demo ids kModis/kViirs/kCoverage/kDay + subs).
// Full season → SEASON numbers (or the API summary when the backend is
// up); a selected day → that day's demo dayData numbers. Count-up on
// load and on every date change, exactly like the demo.
export default function KpiStrip({ season }: { season: SeasonNumbers }) {
  const selectedDate = useFireStore((s) => s.selectedDate)

  let modis = season.modis
  let viirs = season.viirs
  let matched = season.matched
  let dayLabel = 'All season'
  let daySub = 'Jul 1 – Sep 30, 2023'
  let dayAnomaly = false
  if (selectedDate) {
    const [, m, d] = selectedDate.split('-').map(Number)
    const dd = dayData(m, d)
    modis = dd.modis
    viirs = dd.viirs
    matched = dd.matched
    dayLabel = dd.label
    daySub = dd.anomaly
      ? '⚠ Anomaly flagged (robust z > 3.5)'
      : 'Single-day filter active'
    dayAnomaly = dd.anomaly
  }

  const kModis = useCountUp(modis, 700)
  const kViirs = useCountUp(viirs, 700)
  const coverage = matchCoverage(matched, modis)

  return (
    <div className="kpis reveal" id="kpis">
      <div className="kpi">
        <label>
          <i className="dot" style={{ background: 'var(--amber)' }}></i> MODIS
          detections
        </label>
        <strong id="kModis">{kModis.toLocaleString()}</strong>
        <small id="kModisSub">Terra + Aqua</small>
      </div>
      <div className="kpi">
        <label>
          <i className="dot" style={{ background: 'var(--cyan)' }}></i> VIIRS
          detections
        </label>
        <strong id="kViirs">{kViirs.toLocaleString()}</strong>
        <small>NOAA-20 • 375 m</small>
      </div>
      <div className="kpi highlight">
        <label>
          <i className="dot" style={{ background: 'var(--match)' }}></i> Match
          coverage
        </label>
        <strong id="kCoverage" style={{ color: 'var(--match)' }}>
          {coverage.toFixed(1)}%
        </strong>
        <small id="kCoverageSub">
          {matched.toLocaleString()} / {modis.toLocaleString()} MODIS matched 1-to-1
        </small>
      </div>
      <div className="kpi">
        <label>Selected day</label>
        <strong id="kDay" style={{ fontSize: 20, paddingTop: 4 }}>
          {dayLabel}
        </strong>
        <small
          id="kDaySub"
          style={dayAnomaly ? { color: '#EF4444' } : undefined}
        >
          {daySub}
        </small>
      </div>
    </div>
  )
}

// Re-exported so App can pass the API summary through unchanged.
export { SEASON }
