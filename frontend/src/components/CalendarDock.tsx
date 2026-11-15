import { useQuery } from '@tanstack/react-query'
import { useFireStore } from '../store'
import { dayData, type DayDatum } from '../data/sample'
import { api, type DailyRow } from '../lib/api'

// Burning Activity Calendar (demo's #calendar): daily heatmap for
// Jul / Aug / Sep (2023 or 2026). Click a day → everything filters (dashboard,
// map, FIRA). Hotter = more detections; red outline = anomaly flag
// (robust z > 3.5) — a statistical deviation, not a prediction.
// Never adds the two sensors' raw counts together as unique fires.
//
// Real data: the calendar now reads the precomputed daily rows
// (frontend/public/data/daily.json via api.daily(), which falls back
// to the static files when the backend is down) instead of the demo
// dayData formula. It only falls back to the demo formula if the real
// rows fail to load entirely.
function rowToDay(row: DailyRow, peakTotal = 2111): DayDatum {
  const total = row.modis + row.viirs
  return {
    modis: row.modis,
    viirs: row.viirs,
    matched: row.matched,
    anomaly: row.anomaly,
    heat: Math.min(1, total / peakTotal),
    date: row.date,
    label: new Date(`${row.date}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  }
}

export default function CalendarDock() {
  const year = useFireStore((s) => s.year)
  const currentMonth = useFireStore((s) => s.currentMonth)
  const setMonth = useFireStore((s) => s.setMonth)
  const selectedDate = useFireStore((s) => s.selectedDate)
  const selectDay = useFireStore((s) => s.selectDay)

  const { data: daily } = useQuery({
    queryKey: ['daily', year],
    queryFn: () => api.daily(year === 'live' ? 2023 : year, `${year === 'live' ? 2023 : year}-07-01`, `${year === 'live' ? 2023 : year}-09-30`),
    enabled: year !== 'live',
    retry: false,
    staleTime: 60_000,
  })

  // Peak-day total for the year, so the heat scale (0–1) is relative to
  // this season's busiest day, not hardcoded to the 2023 peak (2,111).
  const { data: seasonInfo } = useQuery({
    queryKey: ['seasonInfo', year],
    queryFn: () => api.seasonInfo(year === 'live' ? 2023 : year),
    enabled: year !== 'live',
    retry: false,
    staleTime: 60_000,
  })
  const peakTotal = seasonInfo?.peakTotal ?? 2111

  // LIVE MODE (v24): the calendar covers the archive seasons (Jul–Sep).
  // A 5-day live window has no season calendar — say so instead of
  // rendering the 2023 months as if they were live.
  if (year === 'live') {
    return (
      <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        The calendar covers the archive seasons (Jul–Sep 2023 and 2026).
        Live mode shows the last 5 days on the map above — there is no
        season calendar for a 5-day window. Switch to 2023 or 2026 to
        browse a full season day by day.
      </p>
    )
  }

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][currentMonth - 1]
  const days: DayDatum[] = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const date = `${year}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const row = daily?.find((r) => r.date === date)
    return row ? rowToDay(row, peakTotal) : dayData(currentMonth, d)
  })

  return (
    <>
      <div className="cal-months">
        <button className={currentMonth === 7 ? 'active' : ''} onClick={() => setMonth(7)}>
          July {year}
        </button>
        <button className={currentMonth === 8 ? 'active' : ''} onClick={() => setMonth(8)}>
          August {year} ★
        </button>
        <button className={currentMonth === 9 ? 'active' : ''} onClick={() => setMonth(9)}>
          September {year}
        </button>
      </div>
      <div className="cal" id="calendar">
        {days.map((dd) => (
          <div
            key={dd.date}
            className={`cal-day ${dd.anomaly ? 'anomaly' : ''} ${selectedDate === dd.date ? 'selected' : ''}`}
            style={{
              background: `rgba(255,${Math.round(107 - dd.heat * 40)},26,${0.12 + dd.heat * 0.65})`,
            }}
            onClick={() => selectDay(dd.date)}
            title={`${dd.label} — MODIS ${dd.modis}, VIIRS ${dd.viirs}`}
          >
            <b>{Number(dd.date.slice(-2))}</b>
            <small>{dd.modis + dd.viirs}</small>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>
        Darker / hotter = more detections that day.{' '}
        <span style={{ color: 'var(--danger)' }}>Red outline</span> = anomaly flag
        (robust z &gt; 3.5 vs. baseline) — a statistical deviation, not a prediction.
      </p>
    </>
  )
}
