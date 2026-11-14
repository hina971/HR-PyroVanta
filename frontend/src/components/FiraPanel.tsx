import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFireStore } from '../store'
import { FIRA_SEASON_TEXT, dayData, firaDayText } from '../data/sample'
import { api } from '../lib/api'

// FIRA — Fire Intelligence & Research Assistant (demo's #firaText).
// Template-driven narration from the computed results object only.
// Streams out character by character like the demo (3 chars / 14 ms
// after a 450 ms "reading" beat). When the backend is up, its
// /api/v1/fira narration is used; otherwise the embedded sample text.
// FIRA never invents causes, impacts, burned area, or casualties.
export default function FiraPanel() {
  const selectedDate = useFireStore((s) => s.selectedDate)
  const setTourOpen = useFireStore((s) => s.setTourOpen)
  const [text, setText] = useState('')
  const [replay, setReplay] = useState(0)
  const timerRef = useRef<number | null>(null)

  const sampleText = selectedDate
    ? firaDayText(dayData(Number(selectedDate.slice(5, 7)), Number(selectedDate.slice(8, 10))))
    : FIRA_SEASON_TEXT

  // Ask the backend for its narration; fall back silently to the sample
  // text when it is unreachable (offline rule).
  const { data: apiFira } = useQuery({
    queryKey: ['fira', selectedDate],
    queryFn: () => api.fira(selectedDate ?? undefined),
    retry: false,
    staleTime: 60_000,
  })
  const fullText = apiFira?.text ?? sampleText

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    setText('')
    // "FIRA IS READING THE COMPUTED RESULTS…" beat, then stream.
    const boot = window.setTimeout(() => {
      let i = 0
      timerRef.current = window.setInterval(() => {
        i += 3
        setText(fullText.slice(0, i))
        if (i >= fullText.length && timerRef.current) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
      }, 14)
    }, 450)
    return () => {
      window.clearTimeout(boot)
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [fullText, replay])

  const streaming = text.length < fullText.length

  return (
    <div className="card" style={{ borderColor: 'rgba(255,107,26,.35)' }}>
      <div className="card-h">
        <b>✦ FIRA — Storyteller</b>
        <span style={{ color: 'var(--ember)' }}>Template • {apiFira ? 'Real data' : 'Demo sample'}</span>
      </div>
      <div className="card-b">
        <div className="fira-text" id="firaText">
          {text.length === 0 ? (
            <span style={{ color: 'var(--muted)', fontSize: 12 }} className="mono">
              FIRA IS READING THE COMPUTED RESULTS…
            </span>
          ) : (
            text
          )}
          {streaming && text.length > 0 && <span className="cursor-blink"></span>}
        </div>
        <div style={{ marginTop: 12 }}>
          <span className="chip">{apiFira ? 'Real data' : 'Demo sample data'}</span>
          <span className="chip">MODIS C6.1</span>
          <span className="chip">VIIRS 375 m</span>
        </div>
        <button
          className="btn-ember"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => setReplay((r) => r + 1)}
        >
          ↻ Replay narration
        </button>
        {/* Guided tour trigger (M5): one new button, existing elements
            untouched — the card only grows by this row. */}
        <button
          className="dl"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => setTourOpen(true)}
        >
          ✦ Take the guided tour
        </button>
      </div>
    </div>
  )
}
