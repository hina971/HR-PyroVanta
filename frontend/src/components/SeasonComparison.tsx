// Season Comparison — AI feature A (v26).
//
// One click compares the 2023 and 2026 fire seasons, answered by the
// Groq model via /api/ask, grounded ONLY in both years' real data. The
// context is built by src/lib/askContext.ts (buildAskContext with a
// comparison question loads both years' summary.json + daily.json +
// comparison.json and appends the cross-season figures) — the same
// numbers the KPIs, calendar and Comparison Lab show. Nothing is
// hardcoded: totals, matched pairs, coverage, ambiguous groups,
// unmatched, peak days, FRP correlation and flagged days all come from
// the loaded files. The model is told to report the FRP correlation
// flip (Pearson 0.075 in 2023 vs 0.684 in 2026) as figures, never to
// invent a cause for it — the system prompt in api/ask.js forbids
// inventing numbers or causes.
//
// Archive seasons only: in Live mode the panel says so instead of
// comparing (a 5-day window is not a season). Without the GROQ_API_KEY
// the panel shows the friendly "not connected" state, never a crash.
import { useEffect, useState } from 'react'
import { useFireStore } from '../store'
import { buildAskContext } from '../lib/askContext'
import { NOT_CONNECTED_MSG, postAsk } from '../lib/askApi'

const COMPARE_QUESTION = 'Compare the 2023 and 2026 fire seasons.'

type CmpState = 'idle' | 'loading' | 'done' | 'err'

export default function SeasonComparison() {
  const year = useFireStore((s) => s.year)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<CmpState>('idle')
  const [answer, setAnswer] = useState('')
  const isLive = year === 'live'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close() {
    setOpen(false)
    // Fresh comparison on the next open.
    setState('idle')
    setAnswer('')
  }

  async function run() {
    setState('loading')
    try {
      const context = await buildAskContext(2023, COMPARE_QUESTION)
      const res = await postAsk(COMPARE_QUESTION, context)
      if (res.ok) {
        setAnswer(res.answer)
        setState('done')
      } else {
        setAnswer(res.error)
        setState('err')
      }
    } catch {
      setAnswer(NOT_CONNECTED_MSG)
      setState('err')
    }
  }

  // One click = open and compare immediately (archive seasons only).
  function openAndRun() {
    setOpen(true)
    if (isLive) return
    void run()
  }

  return (
    <>
      <button
        className="cmp-btn"
        onClick={openAndRun}
        aria-label="Compare the 2023 and 2026 seasons with AI"
      >
        ✦ Compare seasons
      </button>

      {open && (
        <div className="cmp-overlay" onClick={close} role="presentation">
          <section
            className="cmp-panel"
            role="dialog"
            aria-label="Season comparison"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cmp-h">
              <div>
                <b className="display">2023 vs 2026 — season comparison</b>
                <span>AI answer, grounded only in the real FIRMS data · archive seasons</span>
              </div>
              <button className="cmp-close" onClick={close} aria-label="Close">
                ✕
              </button>
            </div>

            {isLive ? (
              <p className="cmp-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                The season comparison covers the two archive seasons (2023 and 2026)
                only — a 5-day live window isn’t a season. Switch to 2023 or 2026 to
                run it.
              </p>
            ) : state === 'loading' ? (
              <p className="cmp-answer cmp-thinking">Comparing seasons…</p>
            ) : state === 'done' ? (
              <>
                <p className="cmp-answer">{answer}</p>
                <button className="cmp-rerun" onClick={() => void run()}>
                  ↻ Compare again
                </button>
                <p className="cmp-note">
                  Powered by Groq · figures quoted from the data on this page · the
                  comparison never invents a cause for a difference it can’t see in
                  the data.
                </p>
              </>
            ) : state === 'err' ? (
              <>
                <p className="cmp-answer cmp-err">{answer}</p>
                <button className="cmp-rerun" onClick={() => void run()}>
                  ↻ Try again
                </button>
              </>
            ) : (
              <p className="cmp-answer cmp-thinking">Comparing seasons…</p>
            )}
          </section>
        </div>
      )}
    </>
  )
}
