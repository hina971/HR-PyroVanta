import { useQuery } from '@tanstack/react-query'
import { useFireStore } from '../store'
import { dayData, type DayDatum } from '../data/sample'
import { api, type DailyRow } from '../lib/api'

// Burning Activity Calendar (demo's #calendar): daily heatmap for
// Jul / Aug / Sep 2023. Click a day → everything filters (dashboard,
// map, FIRA). Hotter = more detections; red outline = anomaly flag
// (robust z > 3.5) — a statistical deviation, not a prediction.
// Never adds the two sensors' raw counts together as unique fires.
//
// Real data: the calendar now reads the precomputed daily rows
// (frontend/public/data/daily.json via api.daily(), which falls back
// to the static files when the backend is down) instead of the demo
// dayData formula. It only falls back to the demo formula if the real
// rows fail to load entirely.
function rowToDay(row: DailyRow): DayDatum {
  const total = row.modis + row.viirs
  return {
    modis: row.modis,
    viirs: row.viirs,
    matched: row.matched,
    anomaly: row.anomaly,
    heat: Math.min(1, total / 2111),
    date: row.date,
    label: new Date(`${row.date}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  }
}

export default function CalendarDock() {
  const currentMonth = useFireStore((s) => s.currentMonth)
  const setMonth = useFireStore((s) => s.setMonth)
  const selectedDate = useFireStore((s) => s.selectedDate)
  const selectDay = useFireStore((s) => s.selectDay)

  const { data: daily } = useQuery({
    queryKey: ['daily'],
    queryFn: () => api.daily('2023-07-01', '2023-09-30'),
    retry: false,
    staleTime: 60_000,
  })

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][currentMonth - 1]
  const days: DayDatum[] = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const date = `2023-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const row = daily?.find((r) => r.date === date)
    return row ? rowToDay(row) : dayData(currentMonth, d)
  })

  return (
    <>
      <div className="cal-months">
        <button className={currentMonth === 7 ? 'active' : ''} onClick={() => setMonth(7)}>
          July 2023
        </button>
        <button className={currentMonth === 8 ? 'active' : ''} onClick={() => setMonth(8)}>
          August 2023 ★
        </button>
        <button className={currentMonth === 9 ? 'active' : ''} onClick={() => setMonth(9)}>
          September 2023
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
