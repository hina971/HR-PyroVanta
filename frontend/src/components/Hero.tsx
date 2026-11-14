import { useEffect, useRef } from 'react'
import { Flame } from 'lucide-react'
import { useFireStore } from '../store'
import { useCountUp } from '../hooks/useCountUp'
import type { FirePoint } from '../data/sample'

export interface SeasonNumbers {
  modis: number
  viirs: number
  matched: number
}

function scrollToMission() {
  document.getElementById('mission')?.scrollIntoView({ behavior: 'smooth' })
}

// Ember particles over the hero (demo's sprite-blitted canvas, 55 parts).
function HeroParticles() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let W = 0
    let H = 0
    const parts: Array<{ x: number; y: number; s: number; v: number; drift: number }> = []
    const resize = () => {
      W = cv.width = cv.offsetWidth
      H = cv.height = cv.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)
    for (let i = 0; i < 55; i++)
      parts.push({
        x: Math.random(),
        y: Math.random(),
        s: Math.random() * 2 + 0.6,
        v: Math.random() * 0.0016 + 0.0004,
        drift: (Math.random() - 0.5) * 0.0003,
      })
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sprite = document.createElement('canvas')
    sprite.width = sprite.height = 32
    const sctx = sprite.getContext('2d')!
    const g = sctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    g.addColorStop(0, 'rgba(255,190,110,1)')
    g.addColorStop(0.3, 'rgba(255,140,40,.55)')
    g.addColorStop(1, 'rgba(255,110,26,0)')
    sctx.fillStyle = g
    sctx.fillRect(0, 0, 32, 32)
    const paint = () => {
      ctx.clearRect(0, 0, W, H)
      parts.forEach((p) => {
        const sz = p.s * 11
        ctx.drawImage(sprite, p.x * W - sz / 2, p.y * H - sz / 2, sz, sz)
      })
    }
    let visible = true
    let rafId = 0
    const draw = () => {
      rafId = 0
      parts.forEach((p) => {
        p.y -= p.v
        p.x += p.drift
        if (p.y < 0) {
          p.y = 1
          p.x = Math.random()
        }
      })
      paint()
      if (!reduced && visible) rafId = requestAnimationFrame(draw)
    }
    let io: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((en) => {
        const v = en[0].isIntersecting
        if (v !== visible) {
          visible = v
          if (v && !reduced && !rafId) rafId = requestAnimationFrame(draw)
        }
      })
      io.observe(cv)
    }
    if (reduced) paint()
    else rafId = requestAnimationFrame(draw)
    return () => {
      window.removeEventListener('resize', resize)
      if (io) io.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])
  return <canvas id="particles" ref={ref}></canvas>
}

export default function Hero({
  season,
  points,
  isSample,
}: {
  season: SeasonNumbers
  points: FirePoint[]
  isSample: boolean
}) {
  const selectDay = useFireStore((s) => s.selectDay)
  const heroModis = useCountUp(season.modis, 1400)
  const heroViirs = useCountUp(season.viirs, 1400)
  const heroMatch = useCountUp(season.matched, 1400)

  const jumpToHottest = () => {
    selectDay('2023-08-19')
    scrollToMission()
  }

  return (
    <>
      <header className="topbar">
        <div className="logo">
          <div className="logo-mark">
            <Flame size={17} color="#FF6B1A" fill="#FF6B1A" />
          </div>
          FireFusion <span style={{ color: 'var(--ember)' }}>AI</span>
        </div>
        <div className="top-links">
          <span className="pill nasa">NASA Space Apps 2026</span>
          <span className="pill">Team #786</span>
          <span className="pill live">● {isSample ? 'UI Demo' : 'Live'}</span>
          <button className="btn-ember" onClick={scrollToMission}>
            Explore the data ↓
          </button>
        </div>
      </header>

      <section className="hero">
        <HeroParticles />
        <div className="hero-glow"></div>
        <div className="hero-inner">
          <div>
            <span
              className="pill eyebrow"
              style={{ color: 'var(--amber)', borderColor: 'rgba(255,176,32,.35)' }}
            >
              MODIS + VIIRS HARMONIZATION • CALIFORNIA • JUL–SEP 2023
            </span>
            <h1>
              Two satellites
              <br />
              see fire <em>differently.</em>
              <br />
              <span>
                We show where
                <br />
                they agree.
              </span>
            </h1>
            <p className="lead">
              FireFusion AI harmonizes NASA MODIS C6.1 and VIIRS 375&nbsp;m active-fire
              detections into one trusted view — matched pairs, ambiguous groups, and
              the days that broke the baseline.
            </p>
            <div className="hero-cta">
              <button
                className="btn-ember"
                style={{ padding: '13px 20px', fontSize: 14 }}
                onClick={scrollToMission}
              >
                Explore the data ↓
              </button>
              <button className="btn-ghost" onClick={jumpToHottest}>
                Jump to hottest day — Aug 19
              </button>
            </div>
            <div className="hero-stats">
              <div className="hstat">
                <span>
                  <i className="dot" style={{ background: 'var(--amber)' }}></i>MODIS
                </span>
                <b id="heroModis">{heroModis.toLocaleString()}</b>
                <small style={{ color: 'var(--muted)' }}>detections</small>
              </div>
              <div className="hstat">
                <span>
                  <i className="dot" style={{ background: 'var(--cyan)' }}></i>VIIRS
                </span>
                <b id="heroViirs">{heroViirs.toLocaleString()}</b>
                <small style={{ color: 'var(--muted)' }}>detections</small>
              </div>
              <div className="hstat">
                <span>
                  <i className="dot" style={{ background: 'var(--match)' }}></i>Matched
                </span>
                <b id="heroMatch" style={{ color: 'var(--match)' }}>
                  {heroMatch.toLocaleString()}
                </b>
                <small style={{ color: 'var(--muted)' }}>confirmed pairs</small>
              </div>
            </div>
            <p
              style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}
              className="mono demo-note"
            >
              DEMO VALUES — REPRESENTATIVE SAMPLE FOR UI PREVIEW • FORMAT: NASA FIRMS •
              MODIS C6.1 • VIIRS 375m (NOAA-20)
            </p>
          </div>

          <div className="map-card">
            <div className="map-head">
              <b>CALIFORNIA — SAMPLE PREVIEW</b>
              <span>
                August 2023 • Demo data •{' '}
                <span style={{ color: 'var(--match)' }}>● Matched glow = agreement</span>
              </span>
            </div>
            <div className="map-stage" id="heroMap">
              {points.slice(0, 70).map((p) => (
                <FireDot key={p.id} p={p} />
              ))}
            </div>
            <div className="map-foot">
              <span>
                <i className="dot" style={{ background: 'var(--amber)' }}></i>MODIS
                (Terra / Aqua)
              </span>
              <span>
                <i className="dot" style={{ background: 'var(--cyan)' }}></i>VIIRS
                (NOAA-20)
              </span>
              <span>
                <i className="dot" style={{ background: 'var(--match)' }}></i>Matched
                pair
              </span>
              <span>
                <i className="dot" style={{ background: 'var(--amb)' }}></i>Ambiguous
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

// One map dot — shared by the hero map and the main map (FireMap.tsx).
// Clicking opens the Inspector (demo's inspect(id)).
export function FireDot({ p }: { p: FirePoint }) {
  const selectPoint = useFireStore((s) => s.selectPoint)
  return (
    <div
      className={`fire-dot ${p.type}`}
      style={{ left: `${p.x}%`, top: `${p.y}%` }}
      title={`${p.type.toUpperCase()} • FRP ${p.frp} MW`}
      onClick={(e) => {
        e.stopPropagation()
        selectPoint(p.id)
      }}
    ></div>
  )
}
