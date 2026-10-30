// The optional local model judge of the benchmark (#434 FR-17, #503). Off unless `--judge` is
// given, local endpoints only, and never part of the composite. A judge reads one MSEL row and
// the passage it cites and scores how plausible the row is, quoting both. A score whose quotes
// are not in the row or the passage is discarded. Scores are published only when the judge's
// agreement with the maintainer's human-scored rows (bench/calibration/rows.json) reaches the
// threshold; without that file the scores are kept but marked unpublished.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './corpus.mjs'
import { assertLocalEndpoint, DEFAULT_BASE_URLS, parseModelRef } from './model-info.mjs'

export const MIN_CALIBRATION_ROWS = 60
export const KAPPA_THRESHOLD = 0.6
export const MAX_JUDGED_ROWS = 30
const SCALE = [1, 2, 3, 4, 5]
const PROMPT_FILE = join(ROOT, 'bench', 'prompts', 'bench_judge.md')
const CALIBRATION_FILE = join(ROOT, 'bench', 'calibration', 'rows.json')

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** A judge must be a local model (lmstudio or ollama). */
export function parseJudgeRef(ref, baseUrl, env = process.env) {
  const model = parseModelRef(ref, baseUrl, env)
  if (model.tool === 'mock') throw new Error('--judge needs a real local model, not mock')
  return model
}

/** The rows a drafted scenario offers the judge: rows with a cited passage, capped. */
export function judgeRowsOf(scenario, limit = MAX_JUDGED_ROWS) {
  const rows = []
  for (const r of scenario.msel ?? []) {
    const passage = (r.citations ?? []).find((c) => c.quote)?.quote
    if (!passage) continue
    rows.push({ id: r.id, row: `${r.event}\nExpected action: ${r.expectedAction}`, passage })
    if (rows.length >= limit) break
  }
  return rows
}

export function loadJudgePrompt(file = PROMPT_FILE) {
  return readFileSync(file, 'utf8')
    .replace(/^---[\s\S]*?---\n/, '')
    .trim()
}

export function buildJudgeMessages(item, prompt) {
  return [
    { role: 'system', content: prompt },
    { role: 'user', content: `ROW:\n${item.row}\n\nPASSAGE:\n${item.passage}` },
  ]
}

/** Parse a reply: JSON with score 1-5, rowQuote and passageQuote; null when malformed. */
export function parseJudgeReply(text) {
  const m = /\{[\s\S]*\}/.exec(String(text ?? ''))
  if (!m) return null
  try {
    const v = JSON.parse(m[0])
    if (!SCALE.includes(v.score)) return null
    if (typeof v.rowQuote !== 'string' || typeof v.passageQuote !== 'string') return null
    return { score: v.score, rowQuote: v.rowQuote, passageQuote: v.passageQuote }
  } catch {
    return null
  }
}

/** Both quotes must be substrings (whitespace and case aside) of the row and the passage. */
export function quotesHold(reply, item) {
  const rq = squash(reply.rowQuote)
  const pq = squash(reply.passageQuote)
  return (
    rq.length > 0 &&
    pq.length > 0 &&
    squash(item.row).includes(rq) &&
    squash(item.passage).includes(pq)
  )
}

/** Linearly weighted Cohen's kappa for two lists of 1-5 scores; null without pairs. */
export function weightedKappa(a, b) {
  const n = Math.min(a.length, b.length)
  if (!n) return null
  const k = SCALE.length
  const observed = Array.from({ length: k }, () => Array(k).fill(0))
  const rowTotals = Array(k).fill(0)
  const colTotals = Array(k).fill(0)
  for (let i = 0; i < n; i++) {
    observed[a[i] - 1][b[i] - 1] += 1
    rowTotals[a[i] - 1] += 1
    colTotals[b[i] - 1] += 1
  }
  let disagreement = 0
  let expected = 0
  for (let x = 0; x < k; x++)
    for (let y = 0; y < k; y++) {
      const w = Math.abs(x - y) / (k - 1)
      disagreement += (w * observed[x][y]) / n
      expected += (w * rowTotals[x] * colTotals[y]) / (n * n)
    }
  if (expected === 0) return 1
  return Math.round((1 - disagreement / expected) * 1000) / 1000
}

/** The maintainer's human-scored rows ({row, passage, score}), or [] without the file. */
export function loadCalibration(file = CALIBRATION_FILE) {
  if (!existsSync(file)) return []
  return JSON.parse(readFileSync(file, 'utf8'))
    .filter((r) => r && typeof r.row === 'string' && typeof r.passage === 'string')
    .filter((r) => SCALE.includes(r.score))
    .map((r, i) => ({ id: `cal-${i}`, row: r.row, passage: r.passage, score: r.score }))
}

/** One call to the local model through its OpenAI-compatible endpoint (LM Studio and Ollama). */
export function localJudgeCall(model) {
  const base = (model.baseUrl ?? DEFAULT_BASE_URLS[model.tool]).replace(/\/+$/, '')
  const root = model.tool === 'ollama' ? `${base}/v1` : base
  assertLocalEndpoint(root)
  return async (messages) => {
    const res = await fetch(`${root}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: model.name, messages, temperature: 0, seed: 11 }),
      signal: AbortSignal.timeout(5 * 60_000),
    })
    if (!res.ok) throw new Error(`judge ${model.ref}: HTTP ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }
}

/** Judge items one by one; discarded ones (bad reply or quotes) are counted, not scored. */
export async function judgeItems(items, call, prompt) {
  const scored = []
  let discarded = 0
  for (const item of items) {
    let reply
    try {
      reply = parseJudgeReply(await call(buildJudgeMessages(item, prompt)))
    } catch {
      reply = null
    }
    if (reply && quotesHold(reply, item)) scored.push({ id: item.id, score: reply.score })
    else discarded += 1
  }
  return { scored, discarded }
}

/**
 * Judge a run's rows. `call` is injectable for tests. Returns the BenchRun `judge` block: the
 * agreement with the calibration rows, whether the scores may be published, and the mean
 * plausibility (0-100) with counts.
 */
export async function runJudge({ model, items, calibration, call, prompt }) {
  const cal = await judgeItems(calibration, call, prompt)
  const human = new Map(calibration.map((c) => [c.id, c.score]))
  const kappa = calibration.length
    ? weightedKappa(
        cal.scored.map((s) => s.score),
        cal.scored.map((s) => human.get(s.id)),
      )
    : null
  const rows = await judgeItems(items, call, prompt)
  const mean = rows.scored.length
    ? rows.scored.reduce((n, s) => n + s.score, 0) / rows.scored.length
    : 1
  return {
    model,
    kappa,
    calibrationRows: calibration.length,
    published:
      kappa !== null && kappa >= KAPPA_THRESHOLD && calibration.length >= MIN_CALIBRATION_ROWS,
    scores: {
      plausibility: Math.round(((mean - 1) / 4) * 1000) / 10,
      rowsJudged: rows.scored.length,
      rowsDiscarded: rows.discarded,
    },
  }
}
