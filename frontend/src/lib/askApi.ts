// Shared POST helper for the AI features (Season Comparison, Explain
// This Day — v26).
//
// Posts { question, context } to the /api/ask Vercel serverless function
// (Groq openai/gpt-oss-120b, key only from process.env.GROQ_API_KEY on
// the server) and normalises every failure into a friendly message, so
// callers never parse HTTP statuses. A missing function (local dev) or a
// missing key both surface as "not connected" — the rest of the site
// keeps working. No key lives here or anywhere in the frontend bundle.
export type AskResult = { ok: true; answer: string } | { ok: false; error: string }

export const NOT_CONNECTED_MSG =
  'The AI isn’t connected on this deployment yet — the GROQ_API_KEY still needs adding in the Vercel project settings. The numbers on this page are still the real FIRMS data.'

export async function postAsk(question: string, context: string): Promise<AskResult> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context }),
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data && typeof data.answer === 'string' && data.answer.trim()) {
        return { ok: true, answer: data.answer.trim() }
      }
      if (data && typeof data.error === 'string' && data.error.trim()) {
        return { ok: false, error: data.error.trim() }
      }
      return { ok: false, error: NOT_CONNECTED_MSG }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    // No /api/ask on this deployment (local dev, or the function was
    // never deployed): say so plainly, don't crash.
    return { ok: false, error: NOT_CONNECTED_MSG }
  }
}
