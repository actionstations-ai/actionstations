// Tabletop Mini Benchmark scoring (#604, #606; docs/specs/0445-tabletop-mini-benchmark.md).
// Pure functions: nothing here calls a model or the app, and nothing reads the results of the
// full Tabletop Benchmark. An "observation" is what one model call left behind:
//   { ok, seconds, inputTokens, outputTokens, repairAttempts, lengthRetries, error }
// taken live from the job (probes.mjs) or, for replay, from a saved scenario (replay.mjs).
//
// Mini score = Quality x Completion.
//   Quality     the share of absolute criteria met, over the replies the model delivered. The
//               criteria are fixed pass/fail statements against the Scenario 3 reference
//               (bench/gold/scenario-3.json) and the planted defects; see `criteriaFor*`.
//   Completion  the chance that a full scenario drafts with no failed stage: the per-call
//               first-try rate, over every Mini call, raised to the number of model calls in a
//               scenario (bench/suites/mini.json, scenarioBudget.modelStages).
// Review damage and draft time are reported next to the score and never mixed into it.
import { citationScore } from '../score/citations.mjs'
import { lintFindings, lintScore } from '../score/lint.mjs'
import { paceOk, rubricScore, tagMixOk } from '../score/rubric.mjs'
import { mean, round1 } from '../score/util.mjs'

const toMinutes = (t) => {
  const [h, m] = String(t ?? '0:00').split(':')
  return Number(h) * 60 + Number(m)
}

const clockOf = (minutes) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`

/**
 * The scenario with one phase's window stretched to `minutes` (its start stays, its end moves
 * later), so the phase call must write a full phase of rows: the app asks for six rows an hour
 * (src/main/generate/lint.ts), so 180 minutes asks for 18 and allows 21. The brief's duration
 * grows with it so the exercise still ends where the last phase does.
 */
export function stretchPhase(scenario, phaseId, minutes) {
  const phase = scenario.phases.find((p) => p.id === phaseId)
  if (!phase) throw new Error(`no phase ${phaseId}`)
  const start = toMinutes(phase.startTime)
  const grown = Math.max(0, start + minutes - toMinutes(phase.endTime))
  const durationHours = scenario.brief?.durationHours
  return {
    ...scenario,
    brief: {
      ...scenario.brief,
      ...(durationHours ? { durationHours: durationHours + grown / 60 } : {}),
    },
    phases: scenario.phases.map((p) =>
      p.id === phaseId ? { ...p, endTime: clockOf(start + minutes) } : p,
    ),
  }
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

// ---- failures -------------------------------------------------------------------------------

/** An error on one line, capped: job errors can run to several lines of schema detail. */
const oneLine = (text, n = 230) =>
  String(text ?? 'no answer')
    .replace(/\s+/g, ' ')
    .slice(0, n)

/**
 * What kind of failure a job error describes, and for a stall or a loop the raw tail of the
 * reply the guard recorded (src/main/providers/stream-guard.ts):
 * stall | loop | cutoff | format | error.
 */
export function classifyFailure(error) {
  const text = String(error ?? '')
  const guard = /Reply (stalled|looped): (.*?)\. Last output: "([\s\S]*)"/.exec(text)
  if (guard)
    return {
      kind: guard[1] === 'stalled' ? 'stall' : 'loop',
      detail: guard[2],
      tail: guard[3].slice(-400),
    }
  if (/cut off at the length limit/.test(text)) return { kind: 'cutoff', detail: oneLine(text) }
  if (/no JSON|did not match|schema|validation|malformed/i.test(text))
    return { kind: 'format', detail: oneLine(text) }
  return { kind: 'error', detail: oneLine(text) }
}

const FAILURE_TEXT = {
  stall: (f) => `stalled (${f.detail})`,
  loop: (f) => `looped (${f.detail})`,
  cutoff: () => 'was cut off at the length limit',
  format: (f) => `did not return valid structured output: ${f.detail}`,
  error: (f) => `failed: ${f.detail}`,
}

/** A call with no usable reply: no criteria to score, its reason, and the raw tail if any. */
const failed = (obs, what) => {
  const failure = classifyFailure(obs.error)
  return {
    score: 0,
    ok: false,
    firstTry: false,
    criteria: [],
    metrics: {},
    failure,
    reason: `${what} ${FAILURE_TEXT[failure.kind](failure)}`.slice(0, 400),
  }
}

/** Succeeded on the first try: no failure, no repair round, no reply cut off and asked again. */
export const firstTry = (obs) =>
  !!obs.ok && (obs.repairAttempts ?? 0) === 0 && (obs.lengthRetries ?? 0) === 0

const criterion = (id, label, met) => ({ id, label, met: !!met })
const pct = (met, total) => (total > 0 ? (met / total) * 100 : 0)
const scoreOf = (criteria) => round1(pct(criteria.filter((c) => c.met).length, criteria.length))

function attempts(obs) {
  return { repairAttempts: obs.repairAttempts ?? 0, lengthRetries: obs.lengthRetries ?? 0 }
}

// ---- probe 1: format ------------------------------------------------------------------------

/** Probe 1: the structured answer arrived valid. It adds no quality criteria (completion only). */
export function scoreFormat(obs) {
  if (!obs.ok) return failed(obs, 'The format call')
  const first = firstTry(obs)
  return {
    score: first ? 100 : 70,
    ok: true,
    firstTry: first,
    criteria: [],
    metrics: attempts(obs),
  }
}

// ---- probe 2: a full MSEL phase on a long prompt ---------------------------------------------

const GROUPS_WITHOUT_DECISION = (gold) => ({
  ...gold,
  groups: gold.groups.filter((g) => !g.includes('DECISION_POINT')),
})

/** The criteria a drafted phase is judged by (suite.quality), each a fixed pass/fail statement. */
function phaseCriteria({ view, rubric, cit, lint, hasSupport, q, gold, isLast }) {
  const rows = view.msel
  const pace = paceOk(view, gold, q.paceBand)
  const mix = tagMixOk(view, GROUPS_WITHOUT_DECISION(gold))
  const opens = rows[0]?.purposeTag === 'TIME_JUMP' || rows[0]?.purposeTag === 'STARTEX'
  const closes = !isLast || rows.at(-1)?.purposeTag === 'ENDEX'
  const errors = lint.findingsList.filter((w) => w.severity === 'error').length
  return [
    criterion(
      'rows',
      `at least ${q.phaseMinRows} rows in the phase`,
      rows.length >= q.phaseMinRows,
    ),
    criterion('pace', 'rows per hour within the reference band', pace.pass),
    criterion('tagMix', 'every purpose-tag group of the reference present', mix.pass),
    criterion(
      'opensEnds',
      'opens with its time jump and ends the exercise when last',
      opens && closes,
    ),
    criterion('roles', 'every role receives an inject', rubric.items.rolesEveryPhase),
    criterion('briefIds', 'the brief ids are used', rubric.items.briefIds),
    criterion('noLeak', 'no text copied from the reference', rubric.items.noReferenceLeak),
    criterion(
      'resolved',
      `citations resolved >= ${q.citationResolution}%`,
      cit.resolution >= q.citationResolution,
    ),
    criterion(
      'covered',
      `rows citing a source >= ${q.citationCoverage}%`,
      cit.coverage >= q.citationCoverage,
    ),
    ...(hasSupport
      ? [
          criterion(
            'supported',
            `claims supported by the source >= ${q.citationSupport}%`,
            cit.support >= q.citationSupport,
          ),
        ]
      : []),
    criterion('noLintErrors', 'no lint errors', errors === 0),
    criterion(
      'lintLow',
      `lint penalty <= ${q.lintPenaltyPer10Rows} per 10 rows`,
      (lint.penaltyPer10Rows ?? Infinity) <= q.lintPenaltyPer10Rows,
    ),
  ]
}

/** Probe 2: the phase's rows against the Scenario 3 reference criteria (suite.quality). */
export function scoreLongContext({ obs, scenario, phaseId, grounding, suite, gold }) {
  if (!obs.ok) return failed(obs, 'The long-prompt call')
  const view = phaseView(scenario, phaseId)
  const q = suite.quality
  const findings = lintFindings(view.warnings)
  const lint = { ...lintScore(findings, view.msel.length, 20), findingsList: findings }
  const cit = citationScore(view, groundingOfRows(grounding, view.msel))
  const rubric = rubricScore(view, findings, gold, { pace: 1 }, q.paceBand)
  const isLast = view.phases[0].index === Math.max(...scenario.phases.map((p) => p.index))
  const criteria = phaseCriteria({
    view,
    rubric,
    cit,
    lint,
    hasSupport: (cit.grounding?.claimBearing ?? 0) > 0,
    q,
    gold,
    isLast,
  })
  return {
    score: scoreOf(criteria),
    ok: true,
    firstTry: firstTry(obs),
    criteria,
    metrics: {
      rows: view.msel.length,
      lintFindings: lint.findings,
      lintPenaltyPer10Rows: round1(lint.penaltyPer10Rows ?? 0),
      citationsResolved: round1(cit.resolution),
      citationsCovered: round1(cit.coverage),
      ...((cit.grounding?.claimBearing ?? 0) > 0
        ? { citationsSupported: round1(cit.support) }
        : {}),
      ...attempts(obs),
    },
  }
}

// ---- probe 3: a long handbook ----------------------------------------------------------------

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

/** Probe 3: the handbook has its sections and enough text, and does not repeat itself. */
export function scoreLongOutput({ obs, handbookMd, simcellScripts, suite }) {
  if (!obs.ok) return failed(obs, 'The long-output call')
  const q = suite.quality
  const text = handbookMd ?? ''
  const sections = (text.match(/<!-- section:[a-z-]+ -->/g) ?? []).length
  const words = text.split(/\s+/).filter(Boolean).length
  const repetition = repetitionShare(text)
  const criteria = [
    criterion(
      'sections',
      `all ${q.handbookSections} handbook sections present`,
      sections >= q.handbookSections,
    ),
    criterion('length', `at least ${q.handbookMinWords} words`, words >= q.handbookMinWords),
    criterion(
      'noRepeat',
      `under ${q.handbookMaxRepetition * 100}% repeated phrases`,
      repetition < q.handbookMaxRepetition,
    ),
  ]
  return {
    score: scoreOf(criteria),
    ok: true,
    firstTry: firstTry(obs),
    criteria,
    metrics: {
      handbookSections: sections,
      simcellScripts: simcellScripts ?? 0,
      words,
      repetition: round1(repetition * 100) / 100,
      ...attempts(obs),
    },
  }
}

// ---- probe 4: review of planted defects --------------------------------------------------------

/**
 * Probe 4 and the held-out probe: one criterion per planted defect (found by a note or fixed in
 * the revision). Damage (the share of correct rows the revision changed) is a metric shown next
 * to the score, not a criterion.
 */
export function scoreReview({ obs, critique, what = 'The review call' }) {
  if (!obs.ok || !critique) return failed(obs, what)
  const p = critique.parts
  const d = critique.details ?? {}
  const found = new Set(d.found ?? [])
  const ids = [...(d.found ?? []), ...(d.missed ?? [])]
  const criteria = ids.map((id) =>
    criterion(`defect:${id}`, `finds the planted defect ${id}`, found.has(id)),
  )
  return {
    score: criteria.length ? scoreOf(criteria) : round1(p.recall),
    ok: true,
    firstTry: firstTry(obs),
    criteria,
    metrics: {
      recall: p.recall,
      fixed: p.fixed,
      damage: p.damage,
      intact: p.intact,
      noise: p.noise,
      ...attempts(obs),
    },
  }
}

// ---- one repeat and the whole run --------------------------------------------------------------

/** Quality of one repeat: the share of criteria met over the replies that were delivered. */
export function qualityOf(probes) {
  const all = Object.values(probes).flatMap((p) => p.criteria ?? [])
  const met = all.filter((c) => c.met).length
  return { score: round1(pct(met, all.length)), met, total: all.length }
}

/** Mean review damage (percent of correct rows changed) over a repeat's review calls. */
export function damageOf(probes) {
  const reviews = [probes.review, probes.heldOutReview].filter((p) => p?.ok)
  return reviews.length ? round1(mean(reviews.map((p) => p.metrics.damage))) : undefined
}

/** { value, min, max } of a list of numbers; undefined for an empty list. */
export function rangeOf(values, digits = 1) {
  const xs = values.filter((v) => v !== undefined && Number.isFinite(v))
  if (!xs.length) return undefined
  const f = 10 ** digits
  const r = (n) => Math.round(n * f) / f
  return { value: r(mean(xs)), min: r(Math.min(...xs)), max: r(Math.max(...xs)) }
}

/** Do two { min, max } ranges overlap? Models whose ranges overlap are a tie. */
export const rangesOverlap = (a, b) => a.min <= b.max && b.min <= a.max

/** 'a', 'b' or 'tie' for two ranges of the Mini score (higher is better). */
export function compareRanges(a, b) {
  if (rangesOverlap(a, b)) return 'tie'
  return a.min > b.max ? 'a' : 'b'
}

/** Per-call first-try rate (0 to 1) of a list of probe results. */
export function callRate(probes) {
  const results = Object.values(probes)
  return results.length ? results.filter((p) => p.firstTry).length / results.length : 0
}

// ---- speed and draft time ----------------------------------------------------------------------

/** Output tokens per second over the calls that report both (prompt time included). */
export function outputSpeed(observations) {
  const usable = observations.filter((o) => o.ok && o.outputTokens > 0 && o.seconds > 0)
  const tokens = usable.reduce((n, o) => n + o.outputTokens, 0)
  const seconds = usable.reduce((n, o) => n + o.seconds, 0)
  return seconds > 0 ? round1(tokens / seconds) : undefined
}

/**
 * Prompt-processing and generation rates from the calls' own timings: a least-squares fit of
 * seconds = input/P + output/G over the calls that report tokens. The calls differ in how much
 * they read and write (a 29K-token prompt with a short answer, a 5K prompt with a long one),
 * so the two rates separate. If the fit is degenerate (a negative or missing rate) one pooled
 * rate over all tokens is used instead.
 */
export function fitSpeeds(observations) {
  const calls = observations.filter(
    (o) => o.ok && o.seconds > 0 && (o.inputTokens > 0 || o.outputTokens > 0),
  )
  if (!calls.length) return undefined
  const s = (f) => calls.reduce((n, o) => n + f(o), 0)
  const ii = s((o) => (o.inputTokens ?? 0) ** 2)
  const oo = s((o) => (o.outputTokens ?? 0) ** 2)
  const io = s((o) => (o.inputTokens ?? 0) * (o.outputTokens ?? 0))
  const ti = s((o) => o.seconds * (o.inputTokens ?? 0))
  const to = s((o) => o.seconds * (o.outputTokens ?? 0))
  const det = ii * oo - io * io
  if (calls.length >= 3 && Math.abs(det) > 1e-9 * ii * oo) {
    const a = (ti * oo - to * io) / det
    const b = (ii * to - io * ti) / det
    if (a > 0 && b > 0)
      return {
        promptTokensPerSecond: round1(1 / a),
        outputTokensPerSecond: round1(1 / b),
        method: 'fit',
      }
  }
  const tokens = s((o) => (o.inputTokens ?? 0) + (o.outputTokens ?? 0))
  const rate = round1(tokens / s((o) => o.seconds))
  return { promptTokensPerSecond: rate, outputTokensPerSecond: rate, method: 'pooled' }
}

/** Minutes to draft a full scenario: its measured token budget at the measured rates. */
export function draftMinutes(speeds, budget) {
  if (!speeds) return undefined
  const seconds =
    budget.inputTokens / speeds.promptTokensPerSecond +
    budget.outputTokens / speeds.outputTokensPerSecond
  return round1(seconds / 60)
}

/** The speed figures of one repeat: rates, draft time, and the long-prompt call's size and time. */
export function speedOf({ calls, budget }) {
  const speeds = fitSpeeds(calls)
  const long = calls.find((c) => c.key === 'longContext' && c.ok && c.inputTokens)
  return {
    ...(speeds ?? {}),
    ...(speeds ? { draftMinutes: draftMinutes(speeds, budget) } : {}),
    ...(long
      ? { longPromptTokens: long.inputTokens, longPromptSeconds: round1(long.seconds) }
      : {}),
    totalSeconds: round1(calls.reduce((n, o) => n + (o.seconds ?? 0), 0)),
  }
}

// ---- the run ----------------------------------------------------------------------------------

/**
 * One repeat's numbers. `probes`: scored probes; `calls`: their observations with `key`.
 * completion = perCall ^ modelStages.
 */
export function scoreRepeat({ probes, calls, suite }) {
  const budget = suite.scenarioBudget
  const quality = qualityOf(probes)
  const perCall = callRate(probes)
  const completion = perCall ** budget.modelStages
  const failures = Object.entries(probes)
    .filter(([, p]) => p.failure || !p.firstTry)
    .map(([key, p]) => ({
      probe: key,
      ...(p.failure ? { failure: p.failure } : {}),
      ...(p.ok && !p.firstTry ? { repaired: true } : {}),
    }))
  return {
    quality,
    perCallRate: round1(perCall * 100),
    completion: round1(completion * 100),
    score: round1(quality.score * completion),
    damage: damageOf(probes),
    speed: speedOf({ calls, budget }),
    failures,
  }
}

/**
 * The Mini result over all repeats. Quality and damage are means, the per-call rate is pooled
 * over every call, completion raises that to the number of model calls in a scenario, and the
 * score is Quality x Completion. Every figure carries the range across the repeats; the score's
 * range is the repeats' own scores, widened to include the reported score.
 */
export function miniResult({ repeats, suite }) {
  const stages = suite.scenarioBudget.modelStages
  const results = repeats.map((r) => r.result)
  const all = repeats.flatMap((r) => Object.values(r.probes))
  const pooled = all.length ? all.filter((p) => p.firstTry).length / all.length : 0
  const quality = rangeOf(results.map((r) => r.quality.score))
  const completion = rangeOf(results.map((r) => r.completion))
  const perCall = rangeOf(results.map((r) => r.perCallRate))
  const completionValue = round1(pooled ** stages * 100)
  const score = round1((quality?.value ?? 0) * (completionValue / 100))
  const scores = results.map((r) => r.score)
  const draft = rangeOf(results.map((r) => r.speed.draftMinutes))
  return {
    quality,
    perCallRate: { ...perCall, value: round1(pooled * 100) },
    completion: { ...completion, value: completionValue },
    damage: rangeOf(results.map((r) => r.damage)),
    draftMinutes: draft,
    outputTokensPerSecond: rangeOf(results.map((r) => r.speed.outputTokensPerSecond)),
    promptTokensPerSecond: rangeOf(results.map((r) => r.speed.promptTokensPerSecond)),
    score: {
      value: score,
      min: Math.min(score, ...scores),
      max: Math.max(score, ...scores),
    },
    calls: all.length,
    firstTryCalls: all.filter((p) => p.firstTry).length,
  }
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
    lengthRetries: run.lengthRetries ?? 0,
    error: run.error,
    ...(run.promptHash ? { promptHash: run.promptHash, stage: run.stage } : {}),
  }
}
