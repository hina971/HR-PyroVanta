// Ask FireFusion — Vercel serverless function (Groq proxy).
//
// POST /api/ask  { question: string, context: string }  ->  { answer: string }
// or { error: string, code: string } on failure.
//
// WHERE IT LIVES: this file must sit in the Vercel project's `api/`
// directory. The Vercel project's Root Directory is `frontend/` (the
// Vite app), so this file goes to `frontend/api/ask.js` in the repo.
// Vercel auto-detects it — no vercel.json needed.
//
// SECURITY: the Groq key is read ONLY from the GROQ_API_KEY environment
// variable, set in the Vercel dashboard (Project → Settings → Environment
// Variables). It NEVER appears in this file, in the repo, or in the
// frontend bundle. Without the env var the endpoint answers 503 with a
// friendly message instead of crashing.
//
// MODEL: openai/gpt-oss-120b on Groq (fast, strong enough for grounded
// Q&A over a few KB of data). Temperature 0.2 keeps answers factual.
// The model is only ever given the FireFusion numbers the frontend sends
// as `context` — the system prompt forbids inventing figures.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'openai/gpt-oss-120b'
const FETCH_TIMEOUT_MS = 25_000
const MAX_QUESTION_CHARS = 500
const MAX_CONTEXT_CHARS = 8000

const SYSTEM_PROMPT = `You are the FireFusion AI assistant, answering questions about a NASA Space Apps 2026 project that harmonizes MODIS and VIIRS satellite fire detections over California (July–September, 2023 and 2026 seasons).

STRICT GROUNDING RULES — these outrank everything else:
- Answer ONLY from the FireFusion data provided in the user's message. Quote the exact figures you use.
- NEVER invent, estimate, or round up numbers. If a number is not in the provided data, say so plainly instead of guessing.
- If the data does not cover the question, say what it does not cover and what extra data would be needed to answer it. Do not answer from general knowledge about wildfires.
- FRP (fire radiative power) is never summed across sensors; report MODIS and VIIRS FRP separately.
- A "match" means one MODIS and one VIIRS detection within 1.0 km and 4 hours of each other. "Ambiguous" means several candidates compete, so no confirmed pair. "Unmatched" means no partner was found.
- Keep answers short (2–4 sentences, or a short list), in plain English, no jargon without explaining it.`

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json')
  res.json(body)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { error: 'Method not allowed — use POST.', code: 'method_not_allowed' })
  }

  // Vercel parses JSON bodies automatically; stay defensive for other runtimes.
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return json(res, 400, { error: 'Request body must be JSON.', code: 'bad_json' })
    }
  }
  if (!body || typeof body !== 'object') {
    return json(res, 400, { error: 'Request body must be JSON.', code: 'bad_json' })
  }

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const context = typeof body.context === 'string' ? body.context : ''
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return json(res, 400, {
      error: 'Please ask a question of up to 500 characters.',
      code: 'bad_question',
    })
  }
  if (context.length > MAX_CONTEXT_CHARS) {
    return json(res, 400, { error: 'Context is too large.', code: 'bad_context' })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return json(res, 503, {
      error:
        'The AI is not connected yet — the GROQ_API_KEY still needs adding in the Vercel project settings.',
      code: 'not_configured',
    })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `FireFusion data (use ONLY this — do not invent numbers):\n${context || '(no data was provided)'}\n\nQuestion: ${question}`,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (groqRes.status === 429) {
      return json(res, 429, {
        error: 'The AI is busy right now — please try again in a moment.',
        code: 'rate_limited',
      })
    }
    if (!groqRes.ok) {
      return json(res, 502, {
        error: 'The AI service returned an error — please try again.',
        code: 'upstream_error',
      })
    }

    const data = await groqRes.json()
    const answer = data?.choices?.[0]?.message?.content?.trim()
    if (!answer) {
      return json(res, 502, {
        error: 'The AI returned an empty answer — please try again.',
        code: 'empty_answer',
      })
    }
    return json(res, 200, { answer })
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return json(res, 502, {
        error: 'The AI took too long to answer — please try again.',
        code: 'timeout',
      })
    }
    return json(res, 502, {
      error: 'Could not reach the AI service — please try again.',
      code: 'upstream_error',
    })
  } finally {
    clearTimeout(timer)
  }
}
