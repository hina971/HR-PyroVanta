import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import SpaceBackdrop from './components/SpaceBackdrop'
import Hero from './components/Hero'
import LeftRail from './components/LeftRail'
import KpiStrip from './components/KpiStrip'
import FireMap from './components/FireMap'
import CalendarDock from './components/CalendarDock'
import ComparisonLab from './components/ComparisonLab'
import FiraPanel from './components/FiraPanel'
import Inspector from './components/Inspector'
import Limitations from './components/Limitations'
import GuidedTour from './components/GuidedTour'
import Footer from './components/Footer'
import { useFireStore } from './store'
import { POINTS, SEASON, type FirePoint } from './data/sample'
import { api, type Detection } from './lib/api'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
})

// Map an API detection onto the demo's %-position map space, using the
// demo's own inverse projection (lat 42→32.5, lon −124.4→−114.1).
function apiPoint(d: Detection, i: number): FirePoint {
  const x = Math.max(4, Math.min(94, ((d.lon + 124.4) / 10.3) * 100))
  const y = Math.max(5, Math.min(92, ((42 - d.lat) / 9.5) * 100))
  const type =
    d.match_status === 'matched' ? 'matched' : d.match_status === 'ambiguous' ? 'amb' : d.sensor === 'MODIS' ? 'modis' : 'viirs'
  return {
    id: typeof d.id === 'number' ? d.id : 10000 + i,
    x,
    y,
    type,
    lat: d.lat.toFixed(3),
    lon: d.lon.toFixed(3),
    frp: d.frp.toFixed(1),
    conf: Math.round(d.confidence),
    // Real partner evidence from the static GeoJSON (matched pairs only);
    // '—' when the detection has no partner (unmatched / ambiguous).
    dist: d.distance_km != null ? d.distance_km.toFixed(2) : '—',
    dt: d.time_diff_hours != null ? d.time_diff_hours.toFixed(1) : '—',
    sat: d.satellite,
  }
}

function DownloadButton({ file, label }: { file: 'harmonized.csv' | 'comparison.csv'; label: string }) {
  const [note, setNote] = useState(label)
  const onClick = async () => {
    try {
      const res = await fetch(api.downloadUrl(file))
      if (!res.ok) throw new Error('no file')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Offline / demo: no backend file yet — same behaviour as the demo.
      setNote('✓ Demo only — no file yet')
      setTimeout(() => setNote(label), 1800)
    }
  }
  return (
    <button className="dl" onClick={onClick}>
      {note}
    </button>
  )
}

function Shell() {
  const view = useFireStore((s) => s.view)
  const setView = useFireStore((s) => s.setView)

  // Server state (TanStack Query). Every query fails fast (retry: false)
  // when the backend is down, and the app falls back to the embedded
  // sample data — the offline rule. Nothing here invents data.
  const { data: summary } = useQuery({
    queryKey: ['summary'],
    queryFn: () => api.summary('2023-07-01', '2023-09-30'),
  })
  const { data: detections } = useQuery({
    queryKey: ['detections'],
    queryFn: () => api.detections({ from: '2023-07-01', to: '2023-09-30', limit: '200' }),
  })

  const season = summary
    ? { modis: summary.modis, viirs: summary.viirs, matched: summary.matched }
    : SEASON
  const points: FirePoint[] =
    detections && detections.items.length > 0
      ? detections.items.map((d, i) => apiPoint(d, i))
      : POINTS
  const isSample = !summary

  const goView = (name: 'dashboard' | 'map' | 'lab') => {
    if (name === 'map') {
      setView('dashboard')
      document.getElementById('mainMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setView(name)
  }

  // Scroll reveal, ported from the demo: IntersectionObserver adds .in,
  // with a 1600 ms safety net so nothing stays hidden.
  useEffect(() => {
    const els = Array.prototype.slice.call(document.querySelectorAll('.reveal')) as HTMLElement[]
    if (!els.length) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in')
            io.unobserve(en.target)
          }
        })
      },
      { threshold: 0.05, rootMargin: '0px 0px 250% 0px' },
    )
    els.forEach((el) => io.observe(el))
    const t = setTimeout(() => els.forEach((el) => el.classList.add('in')), 1600)
    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [])

  return (
    <>
      <SpaceBackdrop />
      <Hero season={season} points={points} isSample={isSample} />

      <main className="shell" id="mission">
        <div className="section-label">Act 2 — Mission Control</div>
        <h2>One selection. Every view updates.</h2>

        <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 10, background: 'rgba(4,5,13,.52)', padding: '6px 10px', borderRadius: 8, display: 'inline-block', fontWeight: 600, textShadow: '0 1px 6px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)' }} className="mono">
          ▸ ALL NUMBERS BELOW ARE {isSample ? 'DEMO / SAMPLE VALUES FOR UI PREVIEW' : 'REAL DATA — NASA FIRMS, JUL–SEP 2023'}
        </div>

        <KpiStrip season={season} />

        <div className="tabs reveal" role="tablist">
          <button
            className={`tab ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => goView('dashboard')}
          >
            Dashboard
          </button>
          <button className="tab" onClick={() => goView('map')}>
            Fire Map
          </button>
          <button
            className={`tab ${view === 'lab' ? 'active' : ''}`}
            onClick={() => goView('lab')}
          >
            Sensor Comparison Lab
          </button>
        </div>

        <div className="grid">
          <LeftRail />

          <section className="reveal">
            {/* Both views stay in the DOM like the demo (display-toggled);
                the active one fades in via Framer Motion. */}
            <motion.div
              key={view}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div id="view-dashboard" style={{ display: view === 'lab' ? 'none' : 'block' }}>
                <div className="card">
                  <div className="card-h">
                    <b>Interactive Fire Map</b>
                    <span id="mapMeta">{isSample ? 'Showing sample • click a lime point' : 'Real detections • click a lime point'}</span>
                  </div>
                  <FireMap points={points} isSample={isSample} />
                </div>

                <div className="card" id="tour-calendar" style={{ marginTop: 12 }}>
                  <div className="card-h">
                    <b>Burning Activity Calendar</b>
                    <span>Click a day to filter everything</span>
                  </div>
                  <div className="card-b">
                    <CalendarDock />
                  </div>
                </div>
              </div>

              <div id="view-lab" style={{ display: view === 'lab' ? 'block' : 'none' }}>
                <ComparisonLab />
              </div>
            </motion.div>
          </section>

          <aside className="reveal" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FiraPanel />
            <Inspector points={points} />
          </aside>
        </div>

        <div className="card reveal" style={{ marginTop: 12 }}>
          <div
            className="card-b"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 640 }}>
              <b>How matching works:</b>{' '}
              <span style={{ color: 'var(--muted)' }}>
                Two detections become a confirmed pair only if they are ≤1.0 km and
                ≤4 h apart, with no competing candidate. Groups with multiple
                candidates stay <span style={{ color: 'var(--amb)' }}>ambiguous</span>{' '}
                — visible, counted separately, never hidden.
              </span>
            </div>
            <div className="downloads">
              <DownloadButton file="harmonized.csv" label="↓ harmonized.csv" />
              <DownloadButton file="comparison.csv" label="↓ comparison.csv" />
            </div>
          </div>
        </div>

        {/* Limitations (M5): new card only, appended after "How matching
            works". Nothing above it moves. */}
        <Limitations />
      </main>

      <Footer />
      {/* Guided tour overlay (M5): fixed overlay, no layout impact. */}
      <GuidedTour />
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  )
}
