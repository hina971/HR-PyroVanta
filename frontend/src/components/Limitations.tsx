// Limitations (M5, PRD §8.5/§8.6 + audit_report.md). A dedicated section
// listing what the numbers are NOT — every line comes from the verified
// data audit, nothing invented. Placed after "How matching works" in App.tsx.
//
// YEAR-AWARE (v29): the sample-data card shows the CURRENT view's numbers
// (the 2023 / 2026 archive summary, or the live window's counts), the
// footer covers both seasons plus Live, and the two 2023-only cards (30 Sep
// VIIRS gap, out-of-box row) are labelled with the year. Both were checked
// against the 2026 data files before labelling: 30 Sep 2026 HAS 150 VIIRS
// NOAA-20 rows, and the 2026 max latitude is 41.98686 (no row above 42.0) —
// so neither card applies to 2026.
import { useQuery } from '@tanstack/react-query'
import { useFireStore } from '../store'
import { api } from '../lib/api'
import { useLiveData } from '../lib/liveData'

// Generic cards — true for every mode, no numbers that change by year.
const STATIC_ITEMS: Array<{ title: string; text: string }> = [
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
    // 2023-only, verified: 30 Sep 2026 has 150 VIIRS NOAA-20 rows.
    title: '30 September 2023 VIIRS gap',
    text: 'VIIRS NOAA-20 has no rows on 30 September 2023 — its file ends 29 September. That day has VIIRS coverage through S-NPP only. Do not claim 30-Sep NOAA-20 coverage.',
  },
  {
    title: 'S-NPP is a scope extension',
    text: 'The PRD covers VIIRS NOAA-20 only; S-NPP was added on the team’s instruction (PRD P2). It is treated exactly like NOAA-20 — same 375 m resolution, same confidence system, same matching rules. This applies to both seasons — S-NPP is in the 2023 and 2026 datasets alike.',
  },
  {
    title: 'Anomaly flags are not forecasts',
    text: 'A flagged day is a deviation from the selected baseline (robust z-score above 3.5). It is not a prediction, an early warning, or a severity rating.',
  },
  {
    // 2023-only, verified: 2026 max latitude is 41.98686, no row above 42.0.
    title: 'One row sits outside the box (2023)',
    text: 'A single VIIRS row sits at latitude 42.01, 0.01° above the configured bounding-box top edge (42.0). It was kept, not dropped.',
  },
]

export default function Limitations() {
  const year = useFireStore((s) => s.year)

  // Same query key as App.tsx, so the summary is shared, not refetched.
  // Disabled in live mode — the live window has its own numbers.
  const { data: summary } = useQuery({
    queryKey: ['summary', year],
    queryFn: () => api.summary(year === 'live' ? 2023 : year, `${year === 'live' ? 2023 : year}-07-01`, `${year === 'live' ? 2023 : year}-09-30`),
    enabled: year !== 'live',
  })
  // Live window data (shared query — one fetch per selection).
  const live = useLiveData()

  // Sample-data card — the CURRENT view's numbers, never another year's.
  // Totals come from the loaded data (modis + viirs); while the data is
  // still loading the sentence is shown without numbers instead of
  // guessing or borrowing another mode's figures.
  let sampleText: string
  if (year === 'live') {
    sampleText = live.data
      ? `When the API is unreachable this page shows labelled sample values for preview. Connect the backend to see the real live window — ${live.data.totals.total.toLocaleString()} detections, ${live.data.matched} confirmed pairs, ${live.data.ambiguous} ambiguous groups in the last 5 days.`
      : 'When the API is unreachable this page shows labelled sample values for preview. Connect the backend to see the real live window for the last 5 days.'
  } else if (summary) {
    const total = summary.modis + summary.viirs
    sampleText = `When the API is unreachable this page shows labelled sample values for preview. Connect the backend to see the real harmonized dataset — ${total.toLocaleString()} detections, ${summary.matched} confirmed pairs, ${summary.ambiguous} ambiguous groups.`
  } else {
    sampleText = 'When the API is unreachable this page shows labelled sample values for preview. Connect the backend to see the real harmonized dataset for this season.'
  }

  const items = [
    ...STATIC_ITEMS,
    { title: 'Sample data when the backend is offline', text: sampleText },
  ]

  return (
    <div className="card reveal" id="tour-limitations" style={{ marginTop: 12 }}>
      <div className="card-h">
        <b>Limitations — read before you quote a number</b>
        <span>From the data audit</span>
      </div>
      <div className="card-b">
        <div className="two-col">
          {items.map((item) => (
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
          Source: MODIS C6.1 and VIIRS 375 m (NOAA-20, S-NPP), NASA FIRMS —
          July–September 2023 and 2026, plus live NRT data for the last 5 days.
        </p>
      </div>
    </div>
  )
}
