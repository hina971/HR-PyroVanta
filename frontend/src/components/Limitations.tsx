// Limitations (M5, PRD §8.5/§8.6 + audit_report.md). A dedicated section
// listing what the numbers are NOT — every line comes from the verified
// data audit, nothing invented. New card only; no existing element is
// touched. Placed after "How matching works" in App.tsx.
const ITEMS: Array<{ title: string; text: string }> = [
  {
    title: 'Detections are not fires',
    text: 'Raw counts are satellite detections, never a count of unique real-world fires. One fire can be detected many times, by both sensors.',
  },
  {
    title: 'Ambiguous is never matched',
    text: 'A group with several possible partners stays ambiguous. The closest partner is a suggestion only — it is never presented as a confirmed match.',
  },
  {
    title: 'FRP is compared, never summed',
    text: 'Fire radiative power is correlated between sensors, never added across them. A MODIS 1 km pixel integrates far more burning area than a VIIRS 375 m pixel, so the scales differ by design.',
  },
  {
    title: '30 September VIIRS gap',
    text: 'VIIRS NOAA-20 has no rows on 30 September 2023 — its file ends 29 September. That day has VIIRS coverage through S-NPP only. Do not claim 30-Sep NOAA-20 coverage.',
  },
  {
    title: 'S-NPP is a scope extension',
    text: 'The PRD covers VIIRS NOAA-20 only; S-NPP was added on the team’s instruction (PRD P2). It is treated exactly like NOAA-20 — same 375 m resolution, same confidence system, same matching rules.',
  },
  {
    title: 'Anomaly flags are not forecasts',
    text: 'A flagged day is a deviation from the selected baseline (robust z-score above 3.5). It is not a prediction, an early warning, or a severity rating.',
  },
  {
    title: 'One row sits outside the box',
    text: 'A single VIIRS row sits at latitude 42.01, 0.01° above the configured bounding-box top edge (42.0). It was kept, not dropped.',
  },
  {
    title: 'Sample data when the backend is offline',
    text: 'When the API is unreachable this page shows labelled sample values for preview. Connect the backend to see the real harmonized dataset — 39,899 detections, 98 confirmed pairs, 954 ambiguous groups.',
  },
]

export default function Limitations() {
  return (
    <div className="card reveal" id="tour-limitations" style={{ marginTop: 12 }}>
      <div className="card-h">
        <b>Limitations — read before you quote a number</b>
        <span>From the data audit</span>
      </div>
      <div className="card-b">
        <div className="two-col">
          {ITEMS.map((item) => (
            <div
              key={item.title}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <b style={{ fontSize: 13 }}>{item.title}</b>
              <p
                style={{
                  color: 'var(--muted)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  margin: '6px 0 0',
                }}
              >
                {item.text}
              </p>
            </div>
          ))}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '12px 0 0' }}>
          Source: MODIS C6.1 and VIIRS 375 m (NOAA-20, S-NPP), NASA FIRMS,
          1 July – 30 September 2023.
        </p>
      </div>
    </div>
  )
}
