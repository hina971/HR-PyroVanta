import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFireStore, type View } from '../store'

// Guided tour (M5, PRD §8.6 "Welcome tour"). Pure overlay: it never
// changes, moves or restyles any existing element. It only reads their
// positions (getBoundingClientRect) and draws a highlight ring + a
// tooltip card on top. The ring is a separate fixed div, never a parent
// of a photo, so the demo's backdrop rules are untouched. Opens from
// the FIRA panel; Esc / Skip closes it and restores the view it found.

interface Step {
  target: string // CSS selector for the element to highlight
  title: string
  text: string
  view?: View // switch to this view before measuring the target
}

const STEPS: Step[] = [
  {
    target: '.topbar',
    title: 'Welcome to FireFusion AI',
    text: 'This dashboard harmonizes NASA MODIS and VIIRS fire detections for California, July to September 2023. FIRA narrates what the data shows — this tour walks you through every feature.',
    view: 'dashboard',
  },
  {
    target: '#tour-rail',
    title: 'Control rail — always visible',
    text: 'The case-study region is fixed to California. Toggle the MODIS, VIIRS, matched and ambiguous layers, check the matching rules, or reset to the full season.',
    view: 'dashboard',
  },
  {
    target: '.year-seg',
    title: 'Dataset — pick a season, or go Live',
    text: '2023 and 2026 are the two full archive fire seasons. 🔴 Live switches to NASA FIRMS near-real-time data for the last 5 days — every number, the map and the KPIs follow the dataset you pick.',
    view: 'dashboard',
  },
  {
    target: '#kpis',
    title: 'Summary cards',
    text: 'MODIS and VIIRS detections, confirmed matched pairs, and match coverage. Pick a day in the calendar and these numbers update to that day.',
    view: 'dashboard',
  },
  {
    target: '.match-why',
    title: 'Why is the match rate so low?',
    text: 'Tap this button on the Match Coverage card and the explainer breaks the number down in plain English — the matched / ambiguous / unmatched split, plus the four reasons the method is strict on purpose. No AI key needed; every figure comes from the loaded data.',
    view: 'dashboard',
  },
  {
    target: '#mainMap',
    title: 'Interactive fire map',
    text: 'Every dot is a real detection. Lime means a confirmed one-to-one match, rose means an ambiguous group. Click any point and the Inspector panel shows its sensor, satellite, FRP, confidence and match status. The Time (UTC) bar above the map filters part of the day.',
    view: 'dashboard',
  },
  {
    target: '#tour-calendar',
    title: 'Burning activity calendar',
    text: 'One cell per day — hotter means more detections, and a red outline marks an anomaly flag. Click a day and the whole dashboard filters to it.',
    view: 'dashboard',
  },
  {
    target: '#view-lab',
    title: 'Sensor Comparison Lab — the second view',
    text: 'Switch between Dashboard and the Lab with the tabs above the map. The Lab tests whether the result survives different matching thresholds: change the time window and the satellite pair and the bars recompute from the real sensitivity table. Match coverage falls as the radius grows — wider radius pulls in more candidates and turns clean pairs ambiguous. FRP is compared, never summed.',
    view: 'lab',
  },
  {
    target: '.cmp-btn',
    title: 'Compare seasons — AI',
    text: 'One click and the AI compares the 2023 and 2026 fire seasons side by side from the real data: totals, matched pairs, coverage, peak days, and how the FRP correlation flipped between seasons. Needs the Groq key on the live site; without it you get a plain "AI isn’t connected yet" note.',
    view: 'lab',
  },
  {
    target: '.anom-btn',
    title: 'Anomalous days — and Explain this day',
    text: 'Lists the season’s flagged days — the ones far above the daily average — and clicking one jumps the map and calendar straight to it. The ✦ Explain button on each row asks the AI to narrate that day in plain English from its real numbers.',
    view: 'lab',
  },
  {
    target: '.ask-fab',
    title: 'Ask FireFusion AI',
    text: 'The floating button opens a chat panel: ask anything about the data — "Why did fires peak on 19 Aug 2023?" or "Compare 2023 and 2026" — and the answer is grounded only in the loaded season data, with figures quoted. Needs the Groq key on the live site.',
    view: 'dashboard',
  },
  {
    target: '#firaText',
    title: 'FIRA, the storyteller',
    text: 'Template-driven narration from the computed results only — it never invents causes, impacts or casualties. Replay it any time, or take this tour again from here.',
    view: 'dashboard',
  },
  {
    target: '.downloads',
    title: 'Take the data with you',
    text: 'Download the full harmonized season (harmonized.csv) or the 36-row sensitivity table (comparison.csv). Downloads follow the selected season — and in Live mode they say so plainly, because live detections aren’t archived yet.',
    view: 'dashboard',
  },
  {
    target: '#tour-limitations',
    title: 'Know the limits',
    text: 'Detections are not unique fires, ambiguous groups are never confirmed matches, and VIIRS NOAA-20 has no rows on 30 September 2023. The limits are listed here, in the open.',
    view: 'dashboard',
  },
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function measure(selector: string): Rect | null {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export default function GuidedTour() {
  const tourOpen = useFireStore((s) => s.tourOpen)
  const setTourOpen = useFireStore((s) => s.setTourOpen)
  const setView = useFireStore((s) => s.setView)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const startView = useRef<View>('dashboard')
  const timer = useRef<number | null>(null)
  const retryTimer = useRef<number | null>(null)

  // Measure a target, retrying for up to ~1s when it isn't found yet
  // (the view may still be rendering after a switch). If it is never
  // found, rect stays null and the tooltip renders centred on screen
  // instead of vanishing — a missing target can never blank the tour.
  const attemptMeasure = useCallback((selector: string, triesLeft: number) => {
    const r = measure(selector)
    if (r) {
      setRect(r)
      return
    }
    if (triesLeft <= 0) {
      setRect(null)
      return
    }
    if (retryTimer.current) window.clearTimeout(retryTimer.current)
    retryTimer.current = window.setTimeout(() => attemptMeasure(selector, triesLeft - 1), 200)
  }, [])

  const showStep = useCallback(
    (i: number) => {
      const s = STEPS[i]
      if (!s) return
      if (s.view) setView(s.view)
      // Let the view switch render, then measure and scroll.
      if (timer.current) window.clearTimeout(timer.current)
      if (retryTimer.current) window.clearTimeout(retryTimer.current)
      timer.current = window.setTimeout(() => {
        const el = document.querySelector(s.target) as HTMLElement | null
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        attemptMeasure(s.target, 5)
        // Re-measure once the smooth scroll lands, to re-glue the ring.
        window.setTimeout(() => setRect(measure(s.target)), 450)
      }, 60)
    },
    [setView, attemptMeasure],
  )

  // Open: remember the view, start at step 0. Close: restore the view.
  useEffect(() => {
    if (!tourOpen) return
    startView.current = useFireStore.getState().view
    setStep(0)
    showStep(0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTourOpen(false)
      if (e.key === 'ArrowRight') setStep((n) => Math.min(n + 1, STEPS.length - 1))
      if (e.key === 'ArrowLeft') setStep((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (timer.current) window.clearTimeout(timer.current)
      if (retryTimer.current) window.clearTimeout(retryTimer.current)
    }
  }, [tourOpen, setTourOpen, showStep])

  useEffect(() => {
    if (tourOpen) showStep(step)
  }, [step, tourOpen, showStep])

  // Keep the ring glued to its target while scrolling / resizing.
  useEffect(() => {
    if (!tourOpen) return
    const update = () => setRect(measure(STEPS[step].target))
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [tourOpen, step])

  const close = useCallback(() => {
    setView(startView.current)
    setTourOpen(false)
  }, [setTourOpen, setView])

  const s = STEPS[step]
  const last = step === STEPS.length - 1

  // The tooltip body is the same whether it sits under the highlight
  // ring or centred on screen (the fallback when its target is missing).
  const tooltipBody = (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <b style={{ fontSize: 15 }}>{s.title}</b>
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          {step + 1} / {STEPS.length}
        </span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, margin: '8px 0 14px' }}>
        {s.text}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="dl" onClick={close}>
          Skip tour
        </button>
        {step > 0 && (
          <button className="dl" onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        )}
        <button
          className="btn-ember"
          onClick={() => (last ? close() : setStep(step + 1))}
        >
          {last ? 'Done ✓' : 'Next →'}
        </button>
      </div>
    </>
  )

  const tooltipStyle: CSSProperties = {
    width: 'min(360px, calc(100vw - 24px))',
    background: 'var(--surface, #121216)',
    border: '1px solid var(--line, #26262B)',
    borderRadius: 14,
    padding: 16,
    pointerEvents: 'auto',
    boxShadow: '0 18px 48px rgba(0,0,0,.55)',
  }

  return (
    <AnimatePresence>
      {tourOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            pointerEvents: 'none',
          }}
          role="dialog"
          aria-label="Guided tour"
        >
          {/* Dim everything except the highlighted element. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(5,5,8,.72)',
              pointerEvents: 'auto',
            }}
            onClick={close}
          />
          {/* Highlight ring — a separate overlay div, never a parent of
              any existing element, so no layout or motion is disturbed. */}
          {rect && (
            <div
              style={{
                position: 'fixed',
                top: Math.max(8, rect.top - 8),
                left: Math.max(8, rect.left - 8),
                width: Math.min(rect.width + 16, window.innerWidth - 16),
                height: rect.height + 16,
                border: '2px solid var(--ember, #FF6B1A)',
                borderRadius: 14,
                boxShadow: '0 0 0 9999px rgba(5,5,8,.72), 0 0 32px rgba(255,107,26,.45)',
                pointerEvents: 'none',
              }}
            />
          )}
          {/* Tooltip card — ALWAYS rendered, so a missing target can never
              blank the tour. Under the highlight when the target is found;
              centred on screen when it isn't. Only the ring is gated on
              rect. */}
          {rect ? (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                ...tooltipStyle,
                position: 'fixed',
                left: Math.max(
                  12,
                  Math.min(rect.left, window.innerWidth - 372),
                ),
                top: Math.min(
                  rect.top + rect.height + 20,
                  window.innerHeight - 210,
                ),
              }}
            >
              {tooltipBody}
            </motion.div>
          ) : (
            <div
              style={{
                position: 'fixed',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'auto',
              }}
            >
              <motion.div
                key={`center-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                style={tooltipStyle}
              >
                {tooltipBody}
              </motion.div>
            </div>
          )}
        </div>
      )}
    </AnimatePresence>
  )
}
