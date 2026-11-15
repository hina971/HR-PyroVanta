// Ask FireFusion — natural-language Q&A over the real FIRMS data.
//
// A floating "✦ Ask FireFusion" button (bottom-right, Ember Dark, pulsing
// glow like the tour button) opens a chat panel. Every answer comes from
// the Groq model via the /api/ask Vercel serverless function, grounded
// ONLY in the numbers built by src/lib/askContext.ts from the app's own
// data layer (same files the KPIs, calendar and Comparison Lab read).
// The model never sees a key and the frontend never holds one.
//
// If the function is missing (local dev) or the GROQ_API_KEY is not set
// in Vercel yet, the panel says so plainly instead of crashing — the rest
// of the site keeps working.
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFireStore } from '../store'
import { api } from '../lib/api'
import { buildAskContext, buildLiveAskContext } from '../lib/askContext'
import { liveErrorMessage, useLiveData } from '../lib/liveData'

type Msg = { role: 'user' | 'ai' | 'err'; text: string }

const NOT_CONNECTED_MSG =
  'The Ask AI service isn’t connected on this deployment yet — the GROQ_API_KEY still needs adding in the Vercel project settings. The numbers on this page are still the real FIRMS data.'

function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]} ${y}`
}

export default function AskPanel() {
  const year = useFireStore((s) => s.year)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'ai',
      text: 'Ask me anything about this fire season — I answer only from the real FIRMS data on this page, and I quote the figures I use.',
    },
  ])
  const listRef = useRef<HTMLDivElement>(null)

  // Same query key as App.tsx, so the summary is shared, not refetched.
  // Disabled in live mode — the archive summary must never stand in
  // for live numbers (realData.ts would throw for 'live' anyway).
  const { data: summary } = useQuery({
    queryKey: ['summary', year],
    queryFn: () => api.summary(year === 'live' ? 2023 : year, `${year === 'live' ? 2023 : year}-07-01`, `${year === 'live' ? 2023 : year}-09-30`),
    enabled: year !== 'live',
  })
  // Live window data (shared query — one fetch per selection).
  const live = useLiveData()

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [msgs, sending, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open ])

  const coverage =
    year === 'live'
      ? live.data
        ? ((live.data.matched / Math.max(1, live.data.totals.modis)) * 100).toFixed(1)
        : '…'
      : summary
        ? ((summary.matched / summary.modis) * 100).toFixed(1)
        : '…'
  const peak =
    year === 'live'
      ? live.data?.peakDay
        ? fmtDateShort(live.data.peakDay.date)
        : '…'
      : summary
        ? fmtDateShort(summary.peak_day)
        : '…'

  const chips: { label: string; question: string }[] =
    year === 'live'
      ? [
          {
            label: 'How many detections in the last 5 days?',
            question: 'How many fire detections were there in the last 5 days, and how do MODIS and VIIRS compare?',
          },
          { label: `Why is the match rate only ${coverage}%?`, question: 'Why is the match rate only ' + coverage + '%?' },
          { label: 'Compare live with the 2023 season', question: 'Compare the live window with the 2023 fire season.' },
        ]
      : [
          { label: `Why did fires peak on ${peak}?`, question: `Why did fires peak on ${peak}?` },
          { label: `Why is the match rate only ${coverage}%?`, question: 'Why is the match rate only ' + coverage + '%?' },
          { label: 'Compare 2023 and 2026', question: 'Compare the 2023 and 2026 fire seasons.' },
          { label: 'Which days were anomalous?', question: 'Which days were anomalous, and why were they flagged?' },
        ]

  async function ask(question: string) {
    const q = question.trim()
    if (!q || sending) return
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setInput('')
    setSending(true)
    try {
      // LIVE MODE: ground the answer in the live window's own numbers —
      // never the archive context. If the live data isn't ready yet, say
      // so instead of asking with no grounding.
      let context: string
      if (year === 'live') {
        if (live.error) {
          setMsgs((m) => [...m, { role: 'err', text: liveErrorMessage(live.error) }])
          return
        }
        if (!live.data) {
          setMsgs((m) => [...m, { role: 'err', text: 'Live data is still loading — try again in a moment.' }])
          return
        }
        context = await buildLiveAskContext(live.data, q)
      } else {
        context = await buildAskContext(year, q)
      }
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, context }),
          signal: ctrl.signal,
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data && typeof data.answer === 'string' && data.answer.trim()) {
          setMsgs((m) => [...m, { role: 'ai', text: data.answer.trim() }])
        } else if (data && typeof data.error === 'string') {
          setMsgs((m) => [...m, { role: 'err', text: data.error }])
        } else {
          setMsgs((m) => [...m, { role: 'err', text: NOT_CONNECTED_MSG }])
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // No /api/ask on this deployment (local dev, or the function was
      // never deployed): say so plainly, don't crash.
      setMsgs((m) => [...m, { role: 'err', text: NOT_CONNECTED_MSG }])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        className="ask-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Ask FireFusion' : 'Ask FireFusion'}
        aria-expanded={open}
      >
        ✦ Ask FireFusion
      </button>

      {open && (
        <section className="ask-panel" role="dialog" aria-label="Ask FireFusion">
          <div className="ask-panel-h">
            <div>
              <b className="display">✦ Ask FireFusion</b>
              <span>
                {year === 'live'
                  ? 'Answers only from the live FIRMS window · last 5 days'
                  : `Answers only from the real FIRMS data · ${year} season`}
              </span>
            </div>
            <button className="ask-close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="ask-msgs" ref={listRef}>
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`ask-msg ${m.role === 'user' ? 'ask-msg-user' : m.role === 'err' ? 'ask-msg-err' : 'ask-msg-ai'}`}
              >
                {m.text}
              </div>
            ))}
            {sending && <div className="ask-msg ask-msg-ai ask-thinking">Thinking…</div>}
          </div>

          <div className="ask-chips">
            {chips.map((c) => (
              <button
                key={c.label}
                className="ask-chip"
                disabled={sending}
                onClick={() => ask(c.question)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <form
            className="ask-input-row"
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
          >
            <input
              className="ask-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this fire season…"
              maxLength={500}
              disabled={sending}
              aria-label="Your question"
            />
            <button className="ask-send" type="submit" disabled={sending || !input.trim()}>
              Send
            </button>
          </form>
          <div className="ask-note">Powered by Groq · figures quoted from the data on this page</div>
        </section>
      )}
    </>
  )
}
