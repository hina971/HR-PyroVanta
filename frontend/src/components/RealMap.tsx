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
// (full season), it shows the peak day, 19 Aug 2023, the same day the
// app's own `loadDetections()` uses. Files live at `/data/points/YYYY-MM-DD.geojson`
// (92 daily files, Jul–Sep 2023), already shipped with the app. A strided
// sample of up to 500 is plotted, exactly like the app's `loadDetections()`.
//
// Colours — the app's own convention (see App.tsx `apiPoint()`), so each
// category is distinct: matched lime/green, ambiguous rose/red, MODIS amber,
// VIIRS cyan/blue. Every colour uses the same big, soft, spreading dot
// style as the FIRMS red did, so dense areas merge into coloured patches.
import { useEffect, useRef, useState } from 'react'
import './RealMap.css'
import { useFireStore, type Layers } from '../store'

const LEAFLET_VERSION = '1.9.4'
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`

const PEAK_DAY = '2023-08-19'
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
  }
}

interface GeoCollection {
  features: GeoFeature[]
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
  const [shownDate, setShownDate] = useState(PEAK_DAY)
  const [timeRange, setTimeRange] = useState<TimeRange>('all')

  // The calendar's selected date — null means "full season" (peak day).
  const selectedDate = useFireStore((s) => s.selectedDate)
  // Control Rail layer toggles — which categories to show.
  const layers = useFireStore((s) => s.layers)

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

  // Effect 2: whenever the selected date changes (or the map becomes
  // ready), re-fetch that day's GeoJSON and re-plot the markers.
  useEffect(() => {
    if (!mapReady) return
    let cancelled = false

    async function loadDate() {
      const map = mapRef.current
      const layer = layerRef.current
      if (!map || !layer) return

      // Null = full season -> peak day (same convention as realData.ts).
      const date = selectedDate ?? PEAK_DAY
      setStatus('loading')
      try {
        const res = await fetch(`/data/points/${date}.geojson`)
        if (!res.ok) throw new Error(`No data file for ${date}`)
        const geo = (await res.json()) as GeoCollection
        if (cancelled) return

        const all = geo.features.filter(
          (f) =>
            f.geometry &&
            Array.isArray(f.geometry.coordinates) &&
            f.geometry.coordinates.length === 2,
        )
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
          marker.bindPopup(
            `<b>${label}</b> &middot; ${p.record_id}<br>` +
              `Sensor: ${p.sensor} (${p.satellite})<br>` +
              `FRP: ${p.frp_mw} MW &middot; Confidence: ${p.confidence_raw}<br>` +
              `Match: ${p.match_status}<br>` +
              `<span style="opacity:.75">${p.timestamp_utc}</span>`,
          )
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
  }, [selectedDate, mapReady, timeRange, layers])

  const dateLine = selectedDate
    ? `Selected day ${prettyDate(selectedDate)} · NASA FIRMS · MODIS C6.1 + VIIRS 375 m (NOAA-20 + S-NPP)`
    : `Peak day 19 Aug 2023 · NASA FIRMS · MODIS C6.1 + VIIRS 375 m (NOAA-20 + S-NPP)`

  return (
    <div className="realmap-card">
      <div className="realmap-head">
        <div>
          <b>California — Real Fire Detections</b>
          <span>{dateLine}</span>
        </div>
        <span className="realmap-pill">
          {status === 'ready'
            ? `${shown.toLocaleString()} REAL POINTS SHOWN`
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
          <div className="realmap-overlay">Loading real map…</div>
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
      </div>

      <div className="realmap-foot">
        {status === 'ready'
          ? `${shown.toLocaleString()} real detections plotted (strided sample of ${total.toLocaleString()} on ${prettyDate(shownDate)}${timeRange === 'all' ? '' : `, ${timeRangeLabel(timeRange)} UTC`}). Click a dot for its sensor, FRP and match status. Basemap © Esri, Maxar, Earthstar Geographics, and the GIS user community.`
          : 'Real detections from NASA FIRMS, plotted on a real geographic basemap.'}
      </div>
    </div>
  )
}
