import { useFireStore } from '../store'
import { dayData } from '../data/sample'

// Burning Activity Calendar (demo's #calendar): daily heatmap for
// Jul / Aug / Sep 2023. Click a day → everything filters (dashboard,
// map, FIRA). Hotter = more detections; red outline = anomaly flag
// (robust z > 3.5) — a statistical deviation, not a prediction.
// Never adds the two sensors' raw counts together as unique fires.
export default function CalendarDock() {
  const currentMonth = useFireStore((s) => s.currentMonth)
  const setMonth = useFireStore((s) => s.setMonth)
  const selectedDate = useFireStore((s) => s.selectedDate)
  const selectDay = useFireStore((s) => s.selectDay)

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][currentMonth - 1]
  const days = Array.from({ length: daysInMonth }, (_, i) => dayData(currentMonth, i + 1))

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
