// RealMap — REAL geographic basemap prototype for FireFusion AI.
//
// A drop-in component that renders the REAL NASA FIRMS detections on a real
// map (Esri World Imagery satellite basemap — the same satellite look as the
// official NASA FIRMS map at firms.modaps.eosdis.nasa.gov), instead of the
// app's stylised dark-grid map. It is STANDALONE: nothing in the main app
// imports it yet, so the live site is unaffected until Sharjeel decides to
// wire it in.
//
// No npm dependency is added. Leaflet is loaded from CDN at runtime
// (unpkg, Leaflet 1.9.4) and the global `L` is used through `window.L`.
// The basemap tiles come from Esri's free World Imagery service — no API
// key needed. (CartoDB Dark Matter was tried first, but CARTO now requires
// an API key and its tiles render an "API KEY REQUIRED" watermark. The
// dark-gray Esri basemap was the first version; this satellite version
// matches the FIRMS look.) If the CDN is unreachable the component shows
// an error state instead of breaking the page.
//
// Data: the GeoJSON for the SELECTED DATE (from the app's calendar/store).
// When a date is picked, the map re-fetches and re-plots that day's real
// detections — the map follows the calendar. When no date is selected
// (full season), it shows the year's peak day (from that year's
// summary.json), the same day the app's own `loadDetections()` uses.
// Files live at `/data/points/YYYY-MM-DD.geojson` (2023) or
// `/data/2026/points/YYYY-MM-DD.geojson` (2026) — 92 daily files per
// season, Jul–Sep. A strided sample of up to 1,000 is plotted, exactly
// like the app's `loadDetections()`.
//
// Colours — the app's own convention (see App.tsx `apiPoint()`), so each
// category is distinct: matched lime/green, ambiguous rose/red, MODIS amber,
// VIIRS cyan/blue. Every colour uses the same big, soft, spreading dot
// style as the FIRMS red did, so dense areas merge into coloured patches.
import { useEffect, useRef, useState } from 'react'
import './RealMap.css'
import { useFireStore, type Layers } from '../store'
import { api } from '../lib/api'
import { dataBase } from '../lib/realData'
import { formatLiveWindow, liveErrorMessage, useLiveData, type LivePoint } from '../lib/liveData'
import type { FirePoint } from '../data/sample'

const LEAFLET_VERSION = '1.9.4'
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`

// Peak day is year-specific — read from that year's summary.json via
// api.seasonInfo(year) (2023 peak is 19 Aug 2023, 2,111 detections).
// Plot up to 1,000 dots so dense fire areas merge into solid red patches
// (the FIRMS "spread" look). The day's file can hold up to 2,111.
const MAX_POINTS = 1000

// Time-of-day filter (FIRMS-style time window). The day's detections each
// carry a UTC timestamp, so the map can show just one part of the day.
// Ranges follow the real satellite overpasses: the detections cluster in
// 00–12 UTC and 12–24 UTC (the 12–18 UTC window has no overpass, so a
// 6-hour split would show an empty 12–18).
type TimeRange = 'all' | '0-12' | '12-24'
const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: 'all', label: 'All day' },
  { key: '0-12', label: '00–12' },
  { key: '12-24', label: '12–24' },
]

function timeRangeLabel(range: TimeRange): string {
  return TIME_RANGES.find((r) => r.key === range)?.label ?? 'All day'
}

// California centre + zoom for the whole-state view.
const CA_CENTER: [number, number] = [37.0, -119.5]
const CA_ZOOM = 6

// Colours — the app's own convention (see App.tsx `apiPoint()`): matched
// lime/green, ambiguous rose/red, MODIS amber, VIIRS cyan/blue. Every
// colour uses the same big, soft, spreading dot style, so dense areas merge
// into coloured patches (the FIRMS spread look, but with distinction).
const COLORS = {
  matched: '#A3E635',
  amb: '#FB7185',
  modis: '#FFB020',
  viirs: '#22D3EE',
} as const

type LeafletGlobal = any

function getLeaflet(): LeafletGlobal | null {
  return (window as unknown as { L?: LeafletGlobal }).L ?? null
}

// Load Leaflet CSS + JS from CDN exactly once, even if the component mounts
// twice (React StrictMode) or is rendered in two places.
let leafletLoadPromise: Promise<LeafletGlobal> | null = null

function loadLeaflet(): Promise<LeafletGlobal> {
  const existing = getLeaflet()
  if (existing) return Promise.resolve(existing)
  if (leafletLoadPromise) return leafletLoadPromise

  leafletLoadPromise = new Promise<LeafletGlobal>((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = LEAFLET_CSS
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.onload = () => {
      const L = getLeaflet()
      if (L) resolve(L)
      else {
        leafletLoadPromise = null
        reject(new Error('Leaflet loaded but window.L is missing'))
      }
    }
    script.onerror = () => {
      leafletLoadPromise = null
      reject(new Error('Could not load Leaflet from the CDN (check your connection)'))
    }
    document.head.appendChild(script)
  })
  return leafletLoadPromise
}

interface GeoFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    record_id: string
    sensor: string
    satellite: string
    timestamp_utc: string
    frp_mw: number
    confidence_raw: string
    match_status: string
    match_group_id?: string | null
    distance_km?: number | null
    time_diff_hours?: number | null
  }
}

// Map a GeoJSON feature onto the app's FirePoint shape — the same mapping
// App.tsx `apiPoint()` uses for the hero map dots, so the Inspector shows
// the same fields for a RealMap click as for a hero-map click. The numeric
// id is the record number (FF-014355 -> 14355), which is what the
// Inspector displays as "Record #14355".
function toFirePoint(f: GeoFeature): FirePoint {
  const pr = f.properties
  const [lon, lat] = f.geometry.coordinates
  const type =
    pr.match_status === 'matched'
      ? 'matched'
      : pr.match_status === 'ambiguous'
        ? 'amb'
        : pr.sensor === 'MODIS'
          ? 'modis'
          : 'viirs'
  return {
    id: parseInt(pr.record_id.replace(/\D/g, ''), 10) || 0,
    x: Math.max(4, Math.min(94, ((lon + 124.4) / 10.3) * 100)),
    y: Math.max(5, Math.min(92, ((42 - lat) / 9.5) * 100)),
    type,
    lat: lat.toFixed(3),
    lon: lon.toFixed(3),
    frp: pr.frp_mw.toFixed(1),
    conf: Math.round(Number(pr.confidence_raw) || 0),
    dist: pr.distance_km != null ? pr.distance_km.toFixed(2) : '—',
    dt: pr.time_diff_hours != null ? pr.time_diff_hours.toFixed(1) : '—',
    sat: pr.satellite,
  }
}

interface GeoCollection {
  features: GeoFeature[]
}

// Live points -> the GeoFeature shape the plotter already understands,
// so the map, popup and Inspector code below works unchanged for live
// data. record_id keeps the LIVE- id (the Inspector shows it as
// "Record #000123" via the numeric part, same as archive records).
function livePointToGeo(p: LivePoint): GeoFeature {
  return {
    geometry: { coordinates: [p.lon, p.lat] },
    properties: {
      record_id: p.id,
      sensor: p.sensor,
      satellite: p.satellite,
      timestamp_utc: p.timestamp_utc,
      frp_mw: p.frp ?? 0,
      confidence_raw: p.confidence_raw,
      match_status: p.match,
      match_group_id: p.match_group_id,
      distance_km: p.distance_km,
      time_diff_hours: p.time_diff_hours,
    },
  }
}

// Same colour rule as the app (App.tsx `apiPoint()`).
function pointColor(f: GeoFeature): string {
  const p = f.properties
  if (p.match_status === 'matched') return COLORS.matched
  if (p.match_status === 'ambiguous') return COLORS.amb
  return p.sensor === 'MODIS' ? COLORS.modis : COLORS.viirs
}

function pointLabel(f: GeoFeature): string {
  const p = f.properties
  if (p.match_status === 'matched') return 'Matched'
  if (p.match_status === 'ambiguous') return 'Ambiguous'
  return p.sensor === 'MODIS' ? 'MODIS' : 'VIIRS'
}

// Hour (0–23, UTC) of a detection, from "2023-08-19T18:31:00Z".
function hourOf(f: GeoFeature): number {
  const t = f.properties.timestamp_utc || ''
  const h = parseInt(t.slice(11, 13), 10)
  return Number.isNaN(h) ? -1 : h
}

function inTimeRange(f: GeoFeature, range: TimeRange): boolean {
  if (range === 'all') return true
  const h = hourOf(f)
  if (h < 0) return true // no timestamp — keep it rather than hiding it
  const [lo, hi] = range.split('-').map(Number)
  return h >= lo && h < hi
}

// Control Rail layer toggles (same precedence as the app's point colour:
// matched > ambiguous > sensor). Lets the user hide a whole category.
function inLayers(f: GeoFeature, layers: Layers): boolean {
  const p = f.properties
  if (p.match_status === 'matched') return layers.matched
  if (p.match_status === 'ambiguous') return layers.amb
  return p.sensor === 'MODIS' ? layers.modis : layers.viirs
}

// "2023-08-19" -> "19 Aug 2023" for the header.
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${d} ${months[m - 1]} ${y}`
}

export default function RealMap() {
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletGlobal | null>(null)
  const layerRef = useRef<LeafletGlobal | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [shown, setShown] = useState(0)
  const [total, setTotal] = useState(0)
  const [shownDate, setShownDate] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [peakDay, setPeakDay] = useState('')

  // Dataset year — 2023 (/data), 2026 (/data/2026), or 'live' (the
  // live FIRMS window — points come from the shared live query, not a
  // GeoJSON day file).
  const year = useFireStore((s) => s.year)
  // The calendar's selected date — null means "full season" (peak day).
  // Never set in live mode (the calendar is archive-only).
  const selectedDate = useFireStore((s) => s.selectedDate)
  // Control Rail layer toggles — which categories to show.
  const layers = useFireStore((s) => s.layers)
  // Live window data (shared query — one fetch per selection).
  const { data: liveData, isLoading: liveLoading, error: liveError } = useLiveData()
  // Clicking a dot also fills the Inspector panel on the right (same as a
  // hero-map dot click). The popup alone is not enough — the panel is
  // where the match evidence lives.
  const setInspectorPoint = useFireStore((s) => s.setInspectorPoint)

  // Effect 1 (mount only): build the Leaflet map + satellite tiles once.
  useEffect(() => {
    let cancelled = false

    async function initMap() {
      try {
        const L = await loadLeaflet()
        if (cancelled) return

        const el = mapEl.current
        if (!el) return

        // If StrictMode remounts, drop the old map first.
        if (mapRef.current) {
          mapRef.current.remove()
          mapRef.current = null
        }

        const map = L.map(el, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: true,
        }).setView(CA_CENTER, CA_ZOOM)
        mapRef.current = map

        // Esri World Imagery (satellite) basemap — the FIRMS look, free, no
        // API key. The Base layer is the satellite imagery; the Reference
        // layer adds place labels and boundaries on top. Note the
        // {z}/{y}/{x} order — Esri's scheme.
        L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          {
            attribution:
              'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS user community',
            maxZoom: 16,
          },
        ).addTo(map)
        L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 16 },
        ).addTo(map)

        layerRef.current = L.layerGroup().addTo(map)
        setMapReady(true)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load the real map')
        setStatus('error')
      }
    }

    initMap()
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        layerRef.current = null
      }
    }
  }, [])

  // Effect 2: whenever the selected date or the year changes (or the map
  // becomes ready), re-fetch that day's GeoJSON and re-plot the markers.
  // The year's peak day comes from that year's summary.json.
  // LIVE MODE: no GeoJSON — the points come from the shared live query.
  // Loading/error are handled here so the map never shows archive dots
  // as if they were live, and an empty window shows a clear message.
  useEffect(() => {
    if (!mapReady) return
    let cancelled = false

    async function loadDate() {
      const map = mapRef.current
      const layer = layerRef.current
      if (!map || !layer) return

      setStatus('loading')
      try {
        let all: GeoFeature[]
        let date = ''
        if (year === 'live') {
          // Still fetching — keep the loading overlay; this effect
          // re-runs when the data (or error) arrives.
          if (liveLoading) return
          if (liveError || !liveData) throw new Error(liveErrorMessage(liveError))
          all = liveData.points.map(livePointToGeo)
          date = liveData.window.to
        } else {
          // Null = full season -> this year's peak day (same convention as
          // realData.ts loadDetections).
          const peak = selectedDate ? null : await api.seasonInfo(year)
          if (cancelled) return
          if (peak) setPeakDay(peak.peakDay)
          date = selectedDate ?? peak?.peakDay ?? ''
          if (!date) throw new Error('No peak day for this year')
          const res = await fetch(`${dataBase(year)}/points/${date}.geojson`)
          if (!res.ok) throw new Error(`No data file for ${date}`)
          const geo = (await res.json()) as GeoCollection
          if (cancelled) return

          all = geo.features.filter(
            (f) =>
              f.geometry &&
              Array.isArray(f.geometry.coordinates) &&
              f.geometry.coordinates.length === 2,
          )
        }

        // Time-of-day filter first (FIRMS-style window), then the Control
        // Rail layer toggles, then the strided sample so the plotted points
        // spread across California.
        const inRange = all
          .filter((f) => inTimeRange(f, timeRange))
          .filter((f) => inLayers(f, layers))
        const step = Math.max(1, Math.floor(inRange.length / MAX_POINTS))
        const sampled: GeoFeature[] = []
        for (let i = 0; i < inRange.length && sampled.length < MAX_POINTS; i += step) {
          sampled.push(inRange[i])
        }

        layer.clearLayers()
        for (const f of sampled) {
          const [lon, lat] = f.geometry.coordinates
          const color = pointColor(f)
          const label = pointLabel(f)
          const p = f.properties
          const marker = getLeaflet().circleMarker([lat, lon], {
            // Big, soft red dots: where fires cluster, the overlapping dots
            // merge into a solid red patch (the FIRMS "spread" look).
            radius: p.match_status === 'matched' ? 9 : 7,
            color,
            weight: 0,
            opacity: 0,
            fillColor: color,
            fillOpacity: 0.7,
          })
          // Popup shows the dot's full record — label, sensor, FRP,
          // confidence, match, coordinates and time — and the same record
          // goes to the Inspector panel on the right (see the click
          // handler below).
          const [popLon, popLat] = f.geometry.coordinates
          marker.bindPopup(
            `<b>${label}</b> &middot; ${p.record_id}<br>` +
              `Sensor: ${p.sensor} (${p.satellite})<br>` +
              `Location: ${popLat.toFixed(3)}&deg;, ${popLon.toFixed(3)}&deg;<br>` +
              `FRP: ${p.frp_mw} MW &middot; Confidence: ${p.confidence_raw}<br>` +
              `Match: ${p.match_status}<br>` +
              `<span style="opacity:.75">${p.timestamp_utc}</span>`,
          )
          // Fill the Inspector panel on the right with this dot's record,
          // exactly as a hero-map dot click does.
          marker.on('click', () => setInspectorPoint(toFirePoint(f)))
          marker.addTo(layer)
        }

        setTotal(inRange.length)
        setShown(sampled.length)
        setShownDate(date)
        setStatus('ready')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load the real map')
        setStatus('error')
      }
    }

    loadDate()
    return () => {
      cancelled = true
    }
  }, [selectedDate, year, mapReady, timeRange, layers, liveData, liveLoading, liveError])

  const dateLine =
    year === 'live'
      ? liveData
        ? `🔴 Live — last ${liveData.window.days} days (${formatLiveWindow(liveData)}) · NASA FIRMS NRT · fetched ${new Date(liveData.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
        : '🔴 Live — last 5 days · NASA FIRMS NRT'
      : selectedDate
        ? `Selected day ${prettyDate(selectedDate)} · NASA FIRMS · MODIS C6.1 + VIIRS 375 m (NOAA-20 + S-NPP)`
        : peakDay
          ? `Peak day ${prettyDate(peakDay)} · NASA FIRMS · MODIS C6.1 + VIIRS 375 m (NOAA-20 + S-NPP)`
          : `NASA FIRMS · MODIS C6.1 + VIIRS 375 m (NOAA-20 + S-NPP)`

  return (
    <div className="realmap-card">
      <div className="realmap-head">
        <div>
          <b>California — Real Fire Detections</b>
          <span>{dateLine}</span>
        </div>
        <span className="realmap-pill">
          {status === 'ready'
            ? year === 'live' && total === 0
              ? 'NO LIVE DETECTIONS'
              : `${shown.toLocaleString()} ${year === 'live' ? 'LIVE' : 'REAL'} POINTS SHOWN`
            : status === 'error'
              ? 'MAP UNAVAILABLE'
              : 'LOADING…'}
        </span>
      </div>

      <div className="realmap-timebar">
        <span>Time (UTC):</span>
        {TIME_RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={timeRange === r.key ? 'active' : ''}
            onClick={() => setTimeRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="realmap-wrap">
        <div ref={mapEl} className="realmap" />
        <div className="realmap-legend">
          <span>
            <i style={{ background: COLORS.modis }} /> MODIS
          </span>
          <span>
            <i style={{ background: COLORS.viirs }} /> VIIRS
          </span>
          <span>
            <i style={{ background: COLORS.matched }} /> Matched
          </span>
          <span>
            <i style={{ background: COLORS.amb }} /> Ambiguous
          </span>
        </div>
        {status === 'loading' && (
          <div className="realmap-overlay">
            {year === 'live' ? 'Fetching live FIRMS data…' : 'Loading real map…'}
          </div>
        )}
        {status === 'error' && (
          <div className="realmap-overlay realmap-overlay-error">
            {error || 'Could not load the real map.'}
            <br />
            <button type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}
        {status === 'ready' && year === 'live' && total === 0 && (
          // Empty live window — expected outside fire season, not a bug.
          // Say so plainly instead of leaving an unexplained empty map.
          <div className="realmap-overlay">
            No active detections in California in the last {liveData?.window.days ?? 5} days.
            <br />
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              Fire season is over — switch to 2023 or 2026 to explore an archive season.
            </span>
          </div>
        )}
      </div>

      <div className="realmap-foot">
        {status === 'ready'
          ? year === 'live'
            ? total === 0
              ? `No live detections in the last ${liveData?.window.days ?? 5} days${liveData ? ` (${formatLiveWindow(liveData)})` : ''}. Fire season is over — the satellites see nothing burning right now.`
              : `${shown.toLocaleString()} live detections plotted (strided sample of ${total.toLocaleString()} in the last ${liveData?.window.days ?? 5} days). Click a dot for its sensor, FRP and match status. Basemap © Esri, Maxar, Earthstar Geographics, and the GIS user community.`
            : `${shown.toLocaleString()} real detections plotted (strided sample of ${total.toLocaleString()} on ${prettyDate(shownDate)}${timeRange === 'all' ? '' : `, ${timeRangeLabel(timeRange)} UTC`}). Click a dot for its sensor, FRP and match status. Basemap © Esri, Maxar, Earthstar Geographics, and the GIS user community.`
          : 'Real detections from NASA FIRMS, plotted on a real geographic basemap.'}
      </div>
    </div>
  )
}
