// Tabletop Mini Benchmark scoring (#604, docs/specs/0445-tabletop-mini-benchmark.md). Pure
// functions: each probe's score is composed from the scorers the full benchmark uses (lint,
// citations, structure rubric, critique recall, fixed and damage); nothing here calls a model
// or the app. An "observation" is what one model call left behind:
//   { ok, seconds, inputTokens, outputTokens, repairAttempts, error, capped }
// taken live from the job (run.mjs) or, for validation, from a saved scenario (replay.mjs).
import { citationScore } from '../score/citations.mjs'
import { lintFindings, lintScore } from '../score/lint.mjs'
import { rubricScore } from '../score/rubric.mjs'
import { mean, round1, weighted } from '../score/util.mjs'

const toMinutes = (t) => {
  const [h, m] = String(t ?? '0:00').split(':')
  return Number(h) * 60 + Number(m)
}

/** The scenario reduced to one phase, so the existing scorers judge that phase's rows only. */
export function phaseView(scenario, phaseId) {
  const phase = scenario.phases.find((p) => p.id === phaseId)
  if (!phase) throw new Error(`no phase ${phaseId}`)
  const msel = scenario.msel.filter((r) => r.phaseId === phaseId)
  const ids = new Set(msel.map((r) => r.id))
  const minutes = Math.max(15, toMinutes(phase.endTime) - toMinutes(phase.startTime))
  return {
    ...scenario,
    brief: { ...scenario.brief, durationHours: minutes / 60 },
    overview: undefined,
    phases: [phase],
    msel,
    warnings: scenario.warnings.filter((w) => w.rowId && ids.has(w.rowId)),
  }
}

/** grounding:scenario's result limited to the rows of `msel`. */
function groundingOfRows(grounding, msel) {
  if (!grounding) return undefined
  const keep = new Set(msel.map((r) => `row:${r.id}`))
  return {
    items: Object.fromEntries(Object.entries(grounding.items ?? {}).filter(([k]) => keep.has(k))),
  }
}

/** An error on one line, capped: job errors can run to several lines of schema detail. */
const oneLine = (text) =>
  String(text ?? 'no answer')
    .replace(/\s+/g, ' ')
    .slice(0, 230)

/** A failed call scores 0 and carries its reason. */
const failed = (obs, what) => ({
  score: 0,
  ok: false,
  metrics: {},
  reason: obs.capped
    ? `${what} did not finish within the per-call time cap`
    : `${what} failed: ${oneLine(obs.error)}`,
})

/** Probe 1: the structured answer arrived valid; repair rounds are reported. */
export function scoreFormat(obs) {
  if (!obs.ok) return failed(obs, 'The format call')
  const repairs = obs.repairAttempts ?? 0
  return { score: repairs ? 70 : 100, ok: true, metrics: { repairAttempts: repairs } }
}

/** Probe 2: the phase's rows through the lint, citation and structure scorers. */
export function scoreLongContext({ obs, scenario, phaseId, grounding, suite, gold }) {
  if (!obs.ok) return failed(obs, 'The long-prompt call')
  const view = phaseView(scenario, phaseId)
  const { weights, thresholds } = suite
  const lints = lintFindings(view.warnings)
  const lint = lintScore(lints, view.msel.length, thresholds.lintCap)
  const cit = citationScore(view, groundingOfRows(grounding, view.msel))
  const citations = weighted(cit, weights.citations)
  const rubric = rubricScore(view, lints, gold, weights.structure, thresholds.paceBand)
  const parts = { lint: lint.score, citations, structure: rubric.score }
  return {
    score: weighted(parts, weights.longContext),
    ok: true,
    metrics: {
      ...parts,
      rows: view.msel.length,
      repairAttempts: obs.repairAttempts ?? 0,
      lintFindings: lint.findings,
      citationsResolved: round1(cit.resolution),
      citationsCovered: round1(cit.coverage),
    },
  }
}

const shingles = (text, n = 6) => {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const out = []
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(' '))
  return out
}

/** Share of 6-word runs that appear more than once: a looping reply scores high. */
export function repetitionShare(text) {
  const all = shingles(text)
  if (!all.length) return 0
  return 1 - new Set(all).size / all.length
}

/** Probe 3: the handbook finished (no length cut-off), has its sections and does not loop. */
export function scoreLongOutput({ obs, handbookMd, simcellScripts, suite }) {
  if (!obs.ok) return failed(obs, 'The long-output call')
  const { thresholds, weights } = suite
  const text = handbookMd ?? ''
  const sections = (text.match(/<!-- section:[a-z-]+ -->/g) ?? []).length
  const repetition = repetitionShare(text)
  const parts = {
    sections: Math.min(100, (sections / thresholds.handbookMinSections) * 100),
    variety: Math.max(0, 100 * (1 - repetition / 0.5)),
  }
  return {
    score: weighted(parts, weights.longOutput),
    ok: true,
    metrics: {
      ...parts,
      handbookSections: sections,
      simcellScripts: simcellScripts ?? 0,
      words: text.split(/\s+/).filter(Boolean).length,
      repetition: round1(repetition * 100) / 100,
      repairAttempts: obs.repairAttempts ?? 0,
    },
  }
}

/** Probe 4 and the held-out probe: the full benchmark's critique case result, unchanged. */
export function scoreReview({ obs, critique, what = 'The review call' }) {
  if (!obs.ok || !critique) return failed(obs, what)
  const p = critique.parts
  return {
    score: critique.score,
    ok: obs.ok,
    metrics: {
      recall: p.recall,
      fixed: p.fixed,
      damage: p.damage,
      intact: p.intact,
      noise: p.noise,
    },
  }
}

/** Output tokens per second over the calls that report both. */
export function outputSpeed(observations) {
  const usable = observations.filter((o) => o.ok && o.outputTokens > 0 && o.seconds > 0)
  const tokens = usable.reduce((n, o) => n + o.outputTokens, 0)
  const seconds = usable.reduce((n, o) => n + o.seconds, 0)
  return seconds > 0 ? round1(tokens / seconds) : undefined
}

/** The speed figures: tokens per second, and the long-prompt call's size and time. */
export function speedOf({ calls, longPrompt }) {
  return {
    outputTokensPerSecond: outputSpeed(calls),
    ...(longPrompt?.inputTokens
      ? { longPromptTokens: longPrompt.inputTokens, longPromptSeconds: round1(longPrompt.seconds) }
      : {}),
    totalSeconds: round1(calls.reduce((n, o) => n + (o.seconds ?? 0), 0)),
  }
}

const PROBE_KEYS = ['format', 'longContext', 'longOutput', 'review']

/** The Mini score: the probes' weighted mean (the held-out review, when run, joins the review). */
export function miniScore(probes, weights) {
  const review = probes.review
    ? [probes.review, probes.heldOutReview].filter(Boolean).map((p) => p.score)
    : []
  const parts = {
    ...Object.fromEntries(PROBE_KEYS.filter((k) => probes[k]).map((k) => [k, probes[k].score])),
    ...(review.length ? { review: mean(review) } : {}),
  }
  const used = Object.fromEntries(Object.entries(weights).filter(([k]) => k in parts))
  return round1(weighted(parts, used))
}

/**
 * What the last run of a stage (and phase) in a scenario's provenance says: used live after a
 * re-run and by the replay of saved runs. `ok` also counts "stale" (the run succeeded; a later
 * change marked it out of date). A stage with no run yet is a failure with no error text.
 */
export function runObservation(scenario, stage, itemId) {
  const runs = scenario.provenance.filter(
    (r) => r.stage === stage && (itemId === undefined || r.itemId === itemId),
  )
  const run = runs.at(-1)
  if (!run) return { ok: false, seconds: 0, error: 'no run was recorded for this stage' }
  const ms = run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : 0
  return {
    ok: run.status === 'ok' || run.status === 'stale',
    seconds: ms > 0 ? ms / 1000 : 0,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    repairAttempts: run.repairAttempts ?? 0,
    error: run.error,
    ...(run.promptHash ? { promptHash: run.promptHash, stage: run.stage } : {}),
  }
}
