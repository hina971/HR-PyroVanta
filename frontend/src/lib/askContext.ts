// Grounding-context builder for Ask FireFusion.
//
// Builds the small text block sent to /api/ask alongside the user's
// question. Every figure comes from the app's own data layer (api.summary /
// api.daily / api.comparison), which reads the precomputed real FIRMS
// files — the same numbers the KPIs, calendar and Comparison Lab show.
// Nothing here is hardcoded: the peak day, coverage, FRP correlation and
// busiest days are computed from that year's data, so switching 2023 ↔
// 2026 changes the context automatically.
//
// The context is deliberately small (a few KB): counts, both coverage
// figures (site KPI + eligible-based, so the model never contradicts the
// KPI strip), peak day, mean FRP, FRP correlation, the 1.0 km / 4 h
// sensitivity row, the 5 busiest days, flagged days and critical periods.
// Comparison questions get both years' blocks.
import { api, type Comparison, type DailyRow, type Summary } from './api'
import { formatLiveWindow, type LiveResponse } from './liveData'

export interface YearFacts {
  year: number
  summary: Summary
  daily: DailyRow[]
  comparison: Comparison
}

export async function loadYearFacts(year: number): Promise<YearFacts> {
  const [summary, daily, comparison] = await Promise.all([
    api.summary(year, `${year}-07-01`, `${year}-09-30`),
    api.daily(year, `${year}-07-01`, `${year}-09-30`),
    api.comparison(year),
  ])
  return { year, summary, daily, comparison }
}

function fmtDate(iso: string): string {
  // "2023-08-19" -> "19 Aug 2023"
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]} ${y}`
}

function formatYearContext(f: YearFacts): string {
  const s = f.summary
  const total = s.modis + s.viirs
  // Site KPI coverage (matched / all MODIS) — the number the KPI strip shows.
  const siteCoverage = ((s.matched / s.modis) * 100).toFixed(1)
  const lines: string[] = [
    `Fire season ${f.year} (California, Jul–Sep ${f.year}), NASA FIRMS harmonization (MODIS C6.1 + VIIRS 375 m).`,
    `Totals: ${total.toLocaleString()} detections — MODIS ${s.modis.toLocaleString()}, VIIRS ${s.viirs.toLocaleString()}.`,
    `Matched pairs: ${s.matched.toLocaleString()}. Ambiguous groups: ${s.ambiguous.toLocaleString()}. Unmatched records: ${s.unmatched.toLocaleString()}. Exact duplicates: ${s.exact_duplicates}.`,
    `Match coverage: ${siteCoverage}% of all MODIS (${s.matched} of ${s.modis.toLocaleString()}) — this is the figure shown on the site.`,
  ]
  if (s.coverage_modis_denominator) {
    lines.push(
      `Eligible-based coverage: ${s.coverage_modis.toFixed(2)}% of eligible MODIS (${s.matched} of ${s.coverage_modis_denominator.toLocaleString()}) and ${s.coverage_viirs.toFixed(2)}% of eligible VIIRS (${s.matched} of ${(s.coverage_viirs_denominator ?? 0).toLocaleString()}). Eligible means the detection passed the confidence / quality filters for matching.`,
    )
  }
  const peakRow = f.daily.find((d) => d.date === s.peak_day)
  lines.push(
    `Peak day: ${fmtDate(s.peak_day)} — ${peakRow ? `${(peakRow.modis + peakRow.viirs).toLocaleString()} detections (MODIS ${peakRow.modis}, VIIRS ${peakRow.viirs})` : 'see busiest-days list'}.`,
    `Mean FRP: MODIS ${s.mean_frp_modis} MW, VIIRS ${s.mean_frp_viirs} MW (FRP is never summed across sensors).`,
    `FRP correlation on ${s.matched} matched pairs: Pearson ${f.comparison.frp_correlation.pearson}, Spearman ${f.comparison.frp_correlation.spearman}.`,
    `Matching rule: a pair counts as matched only if the two detections are ≤1.0 km and ≤4 h apart, with no competing candidate. Groups with competing candidates stay ambiguous — counted separately, never hidden.`,
  )
  // Sensitivity at 1.0 km / 4 h is reported PER satellite pair (each pair
  // analysed separately — the four rows do not sum to the season total of
  // matched pairs, so they are listed as per-pair figures, never added).
  const sensRows = f.comparison.sensitivity.filter((r) => r.radius_km === 1 && r.window_h === 4)
  if (sensRows.length > 0) {
    lines.push(
      `Sensitivity at 1.0 km / 4 h, per satellite pair (each pair analysed separately): ${sensRows
        .map((r) => `${r.pair}: ${r.numerator} pairs, ${r.coverage_pct}% of ${r.denominator.toLocaleString()} eligible MODIS`)
        .join('; ')}.`,
    )
  }
  const byTotal = [...f.daily].sort((a, b) => b.modis + b.viirs - (a.modis + a.viirs)).slice(0, 5)
  lines.push(
    `Busiest days: ${byTotal
      .map((d) => `${fmtDate(d.date)} (${(d.modis + d.viirs).toLocaleString()}: MODIS ${d.modis}, VIIRS ${d.viirs})`)
      .join('; ')}.`,
  )
  const flagged = f.daily.filter((d) => d.anomaly)
  if (flagged.length > 0) {
    const dates = flagged.slice(0, 14).map((d) => fmtDate(d.date))
    lines.push(
      `Flagged (anomalous) days: ${flagged.length} — ${dates.join(', ')}${flagged.length > 14 ? `, and ${flagged.length - 14} more` : ''}.`,
    )
  } else {
    lines.push('Flagged (anomalous) days: none in this season’s daily table.')
  }
  if (s.critical_periods && s.critical_periods.length > 0) {
    lines.push(`Critical periods: ${s.critical_periods.join('; ')}.`)
  }
  return lines.join('\n')
}

// True when the question is a cross-season comparison (so both years'
// numbers are needed in the context).
export function isComparisonQuestion(q: string): boolean {
  const t = q.toLowerCase()
  return (
    t.includes('compar') ||
    t.includes('versus') ||
    t.includes(' vs ') ||
    t.includes('both years') ||
    t.includes('difference between') ||
    (t.includes('2023') && t.includes('2026'))
  )
}

export async function buildAskContext(year: number, question: string): Promise<string> {
  const current = await loadYearFacts(year)
  const parts = [formatYearContext(current)]
  if (isComparisonQuestion(question)) {
    const other = await loadYearFacts(year === 2023 ? 2026 : 2023)
    parts.push(formatYearContext(other))
    const c = current.summary
    const o = other.summary
    parts.push(
      `Cross-season comparison (2023 vs 2026): total detections ${(
        c.modis + c.viirs
      ).toLocaleString()} vs ${(o.modis + o.viirs).toLocaleString()}; matched pairs ${c.matched} vs ${o.matched}; ambiguous groups ${c.ambiguous} vs ${o.ambiguous}; FRP Pearson ${current.comparison.frp_correlation.pearson} vs ${other.comparison.frp_correlation.pearson}.`,
    )
  }
  return parts.join('\n\n')
}

// LIVE MODE (v24): grounding context from the live window's own numbers
// — never the archive facts. A comparison question also gets the 2023
// season block, with an explicit warning that the live window is only
// a few days, so rates (not raw totals) are what can be compared.
export async function buildLiveAskContext(live: LiveResponse, question: string): Promise<string> {
  const w = formatLiveWindow(live)
  const t = live.totals
  const siteCoverage = t.modis > 0 ? ((live.matched / t.modis) * 100).toFixed(1) : '0.0'
  const lines: string[] = [
    `Live window ${w} (California, last ${live.window.days} days), NASA FIRMS near-real-time (MODIS NRT + VIIRS 375 m NRT). Fetched ${live.fetchedAt}.`,
    `Totals: ${t.total.toLocaleString()} detections — MODIS ${t.modis.toLocaleString()}, VIIRS ${t.viirs.toLocaleString()}.`,
    `Matched pairs: ${live.matched}. Ambiguous groups: ${live.ambiguous} (${live.ambiguous_records.toLocaleString()} records). Unmatched records: ${live.unmatched.toLocaleString()}. Exact duplicates dropped: ${live.duplicates}.`,
    `Match coverage: ${siteCoverage}% of all MODIS (${live.matched} of ${t.modis.toLocaleString()}); eligible-based ${live.coverage.modis_eligible_pct.toFixed(2)}% of eligible MODIS (${live.matched} of ${live.coverage.modis_eligible.toLocaleString()}) and ${live.coverage.viirs_pct.toFixed(2)}% of eligible VIIRS.`,
  ]
  if (live.peakDay) {
    lines.push(
      `Peak day: ${fmtDate(live.peakDay.date)} — ${live.peakDay.total.toLocaleString()} detections (MODIS ${live.peakDay.modis}, VIIRS ${live.peakDay.viirs}).`,
    )
  } else {
    lines.push('Peak day: none — no detections in this window.')
  }
  const busiest = [...live.daily].sort((a, b) => b.total - a.total).slice(0, 5)
  lines.push(
    `Daily counts: ${busiest.map((d) => `${fmtDate(d.date)} (${d.total}: MODIS ${d.modis}, VIIRS ${d.viirs})`).join('; ')}.`,
  )
  lines.push(
    'Matching rule: a pair counts as matched only if the two detections are ≤1.0 km and ≤4 h apart, with no competing candidate. Groups with competing candidates stay ambiguous — counted separately, never hidden.',
  )
  if (live.capped) {
    lines.push(`Note: points were capped at 2,000 of ${t.total.toLocaleString()} for display; all counts above use the full total.`)
  }
  const parts = [lines.join('\n')]
  if (isComparisonQuestion(question)) {
    const y2023 = await loadYearFacts(2023)
    parts.push(formatYearContext(y2023))
    parts.push(
      `Cross-season comparison (live window vs 2023): total detections ${t.total.toLocaleString()} vs ${(y2023.summary.modis + y2023.summary.viirs).toLocaleString()}; matched pairs ${live.matched} vs ${y2023.summary.matched}. Note the live window is only ${live.window.days} days, not a full Jul–Sep season — compare rates, not raw totals.`,
    )
  }
  return parts.join('\n\n')
}
