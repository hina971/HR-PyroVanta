// Live FIRMS mode — Vercel serverless function (FIRMS NRT proxy).
//
// GET /api/firms-live?days=5  ->  live harmonized detections for California
// or { error, code } on failure.
//
// WHAT IT DOES: calls NASA FIRMS' free area API for the California bbox
// (MODIS_NRT + VIIRS_NOAA20_NRT + VIIRS_SNPP_NRT), parses the CSVs,
// applies the SAME M2 filters and M3 matching rules as the archive
// pipeline (harmonize.py v1.2): MODIS confidence >= 30, VIIRS nominal/high
// only; 1.0 km / 4 h window; connected-component groups — exactly 1 MODIS
// + 1 VIIRS = matched pair, anything bigger = ambiguous group, the rest
// unmatched. Exact duplicates (same observation twice) are dropped and
// counted, never matched.
//
// WHERE IT LIVES: this file must sit in the Vercel project's `api/`
// directory. The Vercel project's Root Directory is `frontend/` (the Vite
// app), so this file goes to `frontend/api/firms-live.js` in the repo.
// Vercel auto-detects it — no vercel.json needed.
//
// SECURITY: the FIRMS key is read ONLY from the FIRMS_API_KEY environment
// variable, set in the Vercel dashboard (Project → Settings → Environment
// Variables). It NEVER appears in this file, in the repo, or in the
// frontend bundle. Without the env var the endpoint answers 503 with a
// friendly message instead of crashing.
//
// HONEST LIMITS (do not promise more than this):
// - The FIRMS area API serves near-real-time data only, day_range 1–5.
//   It cannot pull a whole past season on demand — archive seasons
//   (2023 / 2026) stay as static datasets; this endpoint adds a LIVE
//   window (default 5 days) on top of them.
// - Mid-November, California fire season is over: the live window will
//   often return ZERO detections. That is expected, not a bug — the
//   endpoint returns 200 with zero counts and a 'no detections' note,
//   and the frontend shows a clear empty state, never a broken map.
// - One source failing must not kill the whole response: the working
//   sources are returned with a note naming the failed one.

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'
// California bbox (west,south,east,north) — the app's fixed region.
const BBOX = '-124.4,32.5,-114.1,42.0'
const SOURCES = ['MODIS_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_SNPP_NRT']
const FETCH_TIMEOUT_MS = 20_000
const MAX_POINTS = 2000
const MAX_DISTANCE_KM = 1.0
const MAX_TIME_HOURS = 4
const EARTH_RADIUS_KM = 6371.0088

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json')
  res.json(body)
}

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return isoDate(d)
}

// FIRMS acq_time is HHMM without zero-padding (554 = 05:54, 919 = 09:19).
function parseFirmsTime(dateStr, timeVal) {
  if (!dateStr) return null
  const t = String(timeVal ?? '').trim().replace(':', '').padStart(4, '0')
  const hh = parseInt(t.slice(0, 2), 10)
  const mm = parseInt(t.slice(2, 4), 10)
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh > 23 || mm > 59) return null
  const d = new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180
  const dLat = (lat2 - lat1) * r
  const dLon = (lon2 - lon1) * r
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Minimal CSV parser: handles quoted fields, \r\n, and a trailing newline.
// FIRMS CSVs are simple, but never assume a row has no quotes.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const obj = {}
    header.forEach((h, i) => {
      obj[h] = (r[i] ?? '').trim()
    })
    return obj
  })
}

function sensorOf(source) {
  return source.startsWith('MODIS') ? 'MODIS' : 'VIIRS'
}

function satelliteOf(source, row) {
  // NRT rows carry the satellite name (Terra / Aqua / N20 / SNPP).
  const s = (row.satellite || '').trim()
  if (s === 'N20') return 'NOAA-20'
  if (s === 'SNPP') return 'S-NPP'
  if (s) return s
  return source === 'MODIS_NRT' ? 'Terra' : 'NOAA-20'
}

// Confidence standardisation (harmonize.py standardize): MODIS numeric
// -> eligible at >= 30; VIIRS letter l/n/h -> eligible at nominal/high.
function confidenceInfo(sensor, raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  if (sensor === 'MODIS') {
    const n = parseFloat(v)
    return { num: Number.isFinite(n) ? n : null, raw: String(raw ?? ''), eligible: Number.isFinite(n) && n >= 30 }
  }
  const std = v === 'l' ? 'low' : v === 'n' ? 'nominal' : v === 'h' ? 'high' : v
  return { num: null, raw: String(raw ?? ''), eligible: std === 'nominal' || std === 'high' }
}

function fingerprint(r) {
  return [
    r.sensor,
    r.satellite,
    r.lat.toFixed(6),
    r.lon.toFixed(6),
    r.time.toISOString(),
    r.frp == null ? '' : r.frp.toFixed(2),
    r.brightness == null ? '' : r.brightness.toFixed(2),
    r.confidence_raw,
  ].join('|')
}

// Matching — a faithful port of harmonize.py classify():
// candidate edges (<= 1.0 km and <= 4 h), union-find connected
// components, exactly 1 MODIS + 1 VIIRS = matched pair, anything bigger
// = ambiguous group (closest partner recorded as a suggestion only),
// no candidates = unmatched. Records never eligible for matching keep
// their default (unmatched) status.
function matchRecords(modis, viirs) {
  // Grid-bucket the VIIRS rows so candidate search stays fast even with
  // thousands of records: cell 0.02 deg (~2.2 km), 3x3 neighbourhood.
  const CELL = 0.02
  const buckets = new Map()
  viirs.forEach((v, j) => {
    const key = `${Math.floor(v.lat / CELL)},${Math.floor(v.lon / CELL)}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(j)
  })

  // edges: modis index -> [{viirs, dist, dt}] sorted by (dist, dt).
  const edges = new Map()
  const viirsPartners = new Map() // viirs index -> [{modis, dist, dt}]
  modis.forEach((m, i) => {
    const cx = Math.floor(m.lat / CELL)
    const cy = Math.floor(m.lon / CELL)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = buckets.get(`${cx + dx},${cy + dy}`)
        if (!list) continue
        for (const j of list) {
          const v = viirs[j]
          const dist = haversineKm(m.lat, m.lon, v.lat, v.lon)
          if (dist > MAX_DISTANCE_KM) continue
          const dt = Math.abs(m.time - v.time) / 3600000
          if (dt > MAX_TIME_HOURS) continue
          if (!edges.has(i)) edges.set(i, [])
          edges.get(i).push({ viirs: j, dist, dt })
          if (!viirsPartners.has(j)) viirsPartners.set(j, [])
          viirsPartners.get(j).push({ modis: i, dist, dt })
        }
      }
    }
  })
  for (const list of edges.values()) list.sort((a, b) => a.dist - b.dist || a.dt - b.dt)

  // Union-find over the candidate graph.
  const parent = new Map()
  const keyOf = (type, idx) => `${type}:${idx}`
  const find = (x) => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)
    while (parent.get(x) !== root) {
      const next = parent.get(x)
      parent.set(x, root)
      x = next
    }
    return root
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }
  for (const [i, cands] of edges) {
    const mk = keyOf('M', i)
    if (!parent.has(mk)) parent.set(mk, mk)
    for (const c of cands) {
      const vk = keyOf('V', c.viirs)
      if (!parent.has(vk)) parent.set(vk, vk)
      union(mk, vk)
    }
  }

  const comps = new Map() // root -> {modis: [], viirs: []}
  for (const node of parent.keys()) {
    const root = find(node)
    if (!comps.has(root)) comps.set(root, { modis: [], viirs: [] })
    const [type, idx] = node.split(':')
    comps.get(root)[type === 'M' ? 'modis' : 'viirs'].push(Number(idx))
  }

  // Deterministic group ids: sort components by their first member
  // (harmonize.py: min of ("M", m) / ("V", v) — "M" sorts before "V").
  const sorted = [...comps.values()].sort((a, b) => {
    const firstA = a.modis.length ? `M:${String(Math.min(...a.modis)).padStart(6, '0')}` : `V:${String(Math.min(...a.viirs)).padStart(6, '0')}`
    const firstB = b.modis.length ? `M:${String(Math.min(...b.modis)).padStart(6, '0')}` : `V:${String(Math.min(...b.viirs)).padStart(6, '0')}`
    return firstA < firstB ? -1 : firstA > firstB ? 1 : 0
  })

  const modisRes = new Map()
  const viirsRes = new Map()
  let nMatched = 0
  let nAmbGroups = 0
  for (const c of sorted) {
    if (c.modis.length === 1 && c.viirs.length === 1) {
      nMatched++
      const gid = `MG-${String(nMatched).padStart(5, '0')}`
      const i = c.modis[0]
      const j = c.viirs[0]
      const e = edges.get(i).find((x) => x.viirs === j)
      modisRes.set(i, { status: 'matched', group: gid, partner: j, dist: e.dist, dt: e.dt })
      viirsRes.set(j, { status: 'matched', group: gid, partner: i, dist: e.dist, dt: e.dt })
    } else {
      nAmbGroups++
      const gid = `AG-${String(nAmbGroups).padStart(5, '0')}`
      for (const i of c.modis) {
        const best = edges.get(i)[0] // closest partner = suggestion only
        modisRes.set(i, { status: 'ambiguous', group: gid, partner: best.viirs, dist: best.dist, dt: best.dt })
      }
      for (const j of c.viirs) {
        const cands = (viirsPartners.get(j) || []).slice().sort((a, b) => a.dist - b.dist || a.dt - b.dt)
        const best = cands[0]
        viirsRes.set(j, { status: 'ambiguous', group: gid, partner: best.modis, dist: best.dist, dt: best.dt })
      }
    }
  }
  for (let i = 0; i < modis.length; i++) {
    if (!modisRes.has(i)) modisRes.set(i, { status: 'unmatched', group: null, partner: null, dist: null, dt: null })
  }
  for (let j = 0; j < viirs.length; j++) {
    if (!viirsRes.has(j)) viirsRes.set(j, { status: 'unmatched', group: null, partner: null, dist: null, dt: null })
  }
  return { modisRes, viirsRes, nMatched, nAmbGroups }
}

async function fetchSource(key, source, days) {
  const url = `${FIRMS_BASE}/${key}/${source}/${BBOX}/${days}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const text = await res.text()
    if (!res.ok) {
      if (text.includes('Invalid MAP_KEY')) return { ok: false, reason: 'invalid_key' }
      return { ok: false, reason: `FIRMS HTTP ${res.status}` }
    }
    if (text.includes('Invalid MAP_KEY')) return { ok: false, reason: 'invalid_key' }
    return { ok: true, rows: parseCsv(text) }
  } catch (err) {
    return { ok: false, reason: err && err.name === 'AbortError' ? 'timeout' : 'fetch failed' }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { error: 'Method not allowed — use GET.', code: 'method_not_allowed' })
  }

  // days= 1–5 (the FIRMS area API caps day_range at 5), default 5.
  const rawDays = Array.isArray(req.query.days) ? req.query.days[0] : req.query.days
  let days = 5
  if (rawDays !== undefined) {
    const n = parseInt(String(rawDays), 10)
    if (Number.isNaN(n) || n < 1 || n > 5) {
      return json(res, 400, { error: 'days must be a whole number from 1 to 5.', code: 'bad_days' })
    }
    days = n
  }

  const apiKey = process.env.FIRMS_API_KEY
  if (!apiKey) {
    return json(res, 503, {
      error:
        'Live FIRMS data isn’t connected yet — the FIRMS_API_KEY still needs adding in the Vercel project settings.',
      code: 'not_configured',
    })
  }

  const today = isoDate(new Date())
  const from = addDays(today, -(days - 1))

  // The three sources in parallel; one failing must not kill the others.
  const results = await Promise.all(SOURCES.map((s) => fetchSource(apiKey, s, days)))
  const sources = {}
  const failed = []
  let invalidKey = false
  results.forEach((r, i) => {
    if (r.ok) {
      sources[SOURCES[i]] = 'ok'
    } else {
      sources[SOURCES[i]] = `failed: ${r.reason}`
      failed.push(SOURCES[i])
      if (r.reason === 'invalid_key') invalidKey = true
    }
  })
  if (failed.length === SOURCES.length) {
    if (invalidKey) {
      return json(res, 502, {
        error: 'FIRMS rejected the API key — check that FIRMS_API_KEY in the Vercel project settings is the current MAP_KEY from firms.modaps.eosdis.nasa.gov.',
        code: 'invalid_key',
      })
    }
    return json(res, 502, {
      error: 'Could not reach NASA FIRMS just now — please try again in a moment.',
      code: 'upstream_error',
    })
  }

  // Standardize every row into the common schema (harmonize.py
  // standardize): bbox filter, confidence eligibility, timestamps.
  // NRT CSVs have NO `type` column — nothing to default there.
  const all = []
  results.forEach((r, i) => {
    if (!r.ok) return
    const sensor = sensorOf(SOURCES[i])
    for (const row of r.rows) {
      const lat = parseFloat(row.latitude)
      const lon = parseFloat(row.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      if (lat < 32.5 || lat > 42.0 || lon < -124.4 || lon > -114.1) continue
      const time = parseFirmsTime(row.acq_date, row.acq_time)
      if (!time) continue
      const frp = parseFloat(row.frp)
      const brightness = parseFloat(row.brightness)
      const conf = confidenceInfo(sensor, row.confidence)
      all.push({
        sensor,
        satellite: satelliteOf(SOURCES[i], row),
        lat,
        lon,
        time,
        acq_date: String(row.acq_date || '').trim(),
        acq_time: String(row.acq_time || '').trim().padStart(4, '0'),
        frp: Number.isFinite(frp) ? frp : null,
        brightness: Number.isFinite(brightness) ? brightness : null,
        confidence_raw: conf.raw,
        confidence_num: conf.num,
        eligible: conf.eligible,
        daynight: String(row.daynight || '').trim(),
      })
    }
  })

  // Exact duplicates: same source observation twice (harmonize.py
  // fingerprint). Dropped before counting, and counted, never matched.
  const seen = new Set()
  let duplicates = 0
  const deduped = []
  for (const r of all) {
    const fp = fingerprint(r)
    if (seen.has(fp)) {
      duplicates++
    } else {
      seen.add(fp)
      deduped.push(r)
    }
  }

  // Deterministic order (harmonize.py): timestamp, sensor, satellite,
  // latitude, longitude — then stable LIVE- ids.
  deduped.sort((a, b) =>
    a.time - b.time ||
    (a.sensor < b.sensor ? -1 : a.sensor > b.sensor ? 1 : 0) ||
    (a.satellite < b.satellite ? -1 : a.satellite > b.satellite ? 1 : 0) ||
    a.lat - b.lat || a.lon - b.lon,
  )
  deduped.forEach((r, i) => {
    r.id = `LIVE-${String(i + 1).padStart(6, '0')}`
  })

  // Matching runs on ELIGIBLE records only; ineligible records stay
  // unmatched (same as the archive pipeline).
  const modisE = deduped.filter((r) => r.sensor === 'MODIS' && r.eligible)
  const viirsE = deduped.filter((r) => r.sensor === 'VIIRS' && r.eligible)
  const { modisRes, viirsRes, nMatched, nAmbGroups } = matchRecords(modisE, viirsE)

  // Merge results back: eligible records take their group result,
  // everything else is unmatched.
  const modisIdx = new Map(modisE.map((r, i) => [r.id, i]))
  const viirsIdx = new Map(viirsE.map((r, i) => [r.id, i]))
  let ambiguousRecords = 0
  for (const r of deduped) {
    if (r.sensor === 'MODIS' && modisIdx.has(r.id)) {
      const res = modisRes.get(modisIdx.get(r.id))
      r.match = res.status
      r.match_group_id = res.group
      r.distance_km = res.dist
      r.time_diff_hours = res.dt
    } else if (r.sensor === 'VIIRS' && viirsIdx.has(r.id)) {
      const res = viirsRes.get(viirsIdx.get(r.id))
      r.match = res.status
      r.match_group_id = res.group
      r.distance_km = res.dist
      r.time_diff_hours = res.dt
    } else {
      r.match = 'unmatched'
      r.match_group_id = null
      r.distance_km = null
      r.time_diff_hours = null
    }
    if (r.match === 'ambiguous') ambiguousRecords++
  }

  const modisTotal = deduped.filter((r) => r.sensor === 'MODIS').length
  const viirsTotal = deduped.filter((r) => r.sensor === 'VIIRS').length
  const total = deduped.length
  const unmatched = total - nMatched * 2 - ambiguousRecords
  const modisEligible = modisE.length
  const viirsEligible = viirsE.length

  // Per-day counts across the whole window (zero days included).
  const daily = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    const rows = deduped.filter((r) => r.acq_date === date)
    daily.push({
      date,
      modis: rows.filter((r) => r.sensor === 'MODIS').length,
      viirs: rows.filter((r) => r.sensor === 'VIIRS').length,
      total: rows.length,
    })
  }
  const peakDay = daily.reduce(
    (best, d) => (d.total > (best ? best.total : 0) ? d : best),
    null,
  )

  // Points, capped at 2,000 (the map samples down to 1,000 itself).
  const capped = deduped.length > MAX_POINTS
  const points = deduped.slice(0, MAX_POINTS).map((r) => ({
    id: r.id,
    lat: r.lat,
    lon: r.lon,
    sensor: r.sensor,
    satellite: r.satellite,
    frp: r.frp,
    confidence: r.confidence_num,
    confidence_raw: r.confidence_raw,
    acq_date: r.acq_date,
    acq_time: r.acq_time,
    timestamp_utc: r.time.toISOString(),
    match: r.match,
    match_group_id: r.match_group_id,
    distance_km: r.distance_km == null ? null : Number(r.distance_km.toFixed(3)),
    time_diff_hours: r.time_diff_hours == null ? null : Number(r.time_diff_hours.toFixed(2)),
    daynight: r.daynight,
  }))

  const noteParts = [
    `Live NASA FIRMS near-real-time data, last ${days} day${days === 1 ? '' : 's'} (${from} to ${today}), California.`,
  ]
  if (total === 0) {
    noteParts.push('No active fire detections in this window — expected outside fire season.')
  }
  if (capped) noteParts.push(`Points capped at ${MAX_POINTS.toLocaleString()} of ${total.toLocaleString()} (map shows a strided sample).`)
  if (failed.length > 0) {
    noteParts.push(`Some sources failed and were left out: ${failed.join(', ')}.`)
  }
  if (duplicates > 0) noteParts.push(`${duplicates} exact duplicate ${duplicates === 1 ? 'row was' : 'rows were'} dropped before matching.`)

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=60')
  return json(res, 200, {
    mode: 'live',
    window: { from, to: today, days },
    fetchedAt: new Date().toISOString(),
    totals: { modis: modisTotal, viirs: viirsTotal, total },
    matched: nMatched,
    ambiguous: nAmbGroups,
    ambiguous_records: ambiguousRecords,
    unmatched,
    duplicates,
    coverage: {
      modis_site_pct: modisTotal > 0 ? Number(((100 * nMatched) / modisTotal).toFixed(1)) : 0,
      modis_eligible_pct: modisEligible > 0 ? Number(((100 * nMatched) / modisEligible).toFixed(2)) : 0,
      modis_eligible: modisEligible,
      viirs_pct: viirsEligible > 0 ? Number(((100 * nMatched) / viirsEligible).toFixed(2)) : 0,
      viirs_eligible: viirsEligible,
    },
    peakDay: peakDay && peakDay.total > 0 ? peakDay : null,
    daily,
    points,
    capped,
    sources,
    note: noteParts.join(' '),
  })
}
