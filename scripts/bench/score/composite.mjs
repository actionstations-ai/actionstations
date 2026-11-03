// Composite scores (#434, FR-16): a 0–100 score per case from the measured parts and the suite
// file's weights, a task score as the mean over its cases, the overall score as the weighted
// mean of the tasks, and the median and range over repeats ("unstable" past the threshold).
import { citationScore } from './citations.mjs'
import { critiqueScore } from './critique.mjs'
import { ideationScore } from './ideation.mjs'
import { lintScore } from './lint.mjs'
import { reliability } from './reliability.mjs'
import { rubricScore } from './rubric.mjs'
import { mean, median, round1, weighted } from './util.mjs'

/**
 * 1: reliability, lint, citations (resolution, grounding support of #423, coverage), structure.
 * 2: critique scores the revised scenario (a fixed defect counts as found), measures damage to
 * correct rows, and is advisory: the recommendation floor uses drafting and ideation (#592).
 */
export const SCORING_VERSION = 2

/** One drafted scenario: reliability, lint, citations and structure. */
export function draftingCase({ scenario, lints, gold, suite, grounding }) {
  const { weights, thresholds } = suite
  const rel = reliability(scenario)
  const lint = lintScore(lints, scenario.msel.length, thresholds.lintCap)
  const cit = citationScore(scenario, grounding)
  const rubric = rubricScore(scenario, lints, gold, weights.structure, thresholds.paceBand)
  const citations = weighted(cit, weights.citations)
  const parts = {
    reliability: rel.score,
    lint: lint.score,
    citations,
    'citations.resolution': cit.resolution,
    'citations.coverage': cit.coverage,
    ...(cit.support !== undefined ? { 'citations.support': cit.support } : {}),
    structure: rubric.score,
  }
  return {
    score: weighted(parts, weights.drafting),
    parts,
    reliability: rel,
    details: { lintByCode: lint.byCode, rubric: rubric.items, rel, citations: cit },
  }
}

export function ideationCase({ ideas, dropped, suite, grounding }) {
  const m = ideationScore(ideas, {
    count: suite.ideationCount,
    dropped,
    threshold: suite.thresholds.distinctCosine,
    grounding,
  })
  const parts = {
    valid: m.valid,
    distinct: m.distinct,
    resolution: m.resolution,
    spread: m.spread,
    ...(m.grounding !== undefined ? { grounding: m.grounding } : {}),
  }
  return { score: weighted(parts, suite.weights.ideation), parts, details: m }
}

export function critiqueCase({ notes, planted, lints, rowCount, suite, before, after }) {
  const m = critiqueScore({
    notes,
    planted,
    lints,
    rowCount,
    noisePenalty: suite.thresholds.noisePenaltyPer10Rows,
    damagePenalty: suite.thresholds.damagePenaltyPerPercent,
    before,
    after,
  })
  const parts = {
    recall: m.recall,
    noise: m.noise,
    intact: m.intact,
    fixed: m.fixed,
    damage: m.damage,
  }
  return { score: weighted(parts, suite.weights.critique), parts, details: m }
}

/** Mean of the cases' scores and parts; a failed case scores 0 in every part. */
export function aggregateTask(task, cases, { wallSeconds, outputTokensPerSecond } = {}) {
  const keys = [...new Set(cases.flatMap((c) => Object.keys(c.parts)))]
  const parts = Object.fromEntries(
    keys.map((k) => [k, round1(mean(cases.map((c) => c.parts[k] ?? 0)))]),
  )
  return {
    task,
    score: round1(mean(cases.map((c) => c.score))),
    parts,
    details: Object.fromEntries(cases.map((c) => [c.caseId, { score: c.score, ...c.details }])),
    wallSeconds: Math.round(wallSeconds ?? 0),
    ...(outputTokensPerSecond !== undefined
      ? { outputTokensPerSecond: round1(outputTokensPerSecond) }
      : {}),
  }
}

/** Weighted mean of the task scores (drafting 0.5, critique 0.25, ideation 0.25 by default). */
export function overallScore(tasks, weights) {
  return round1(weighted(Object.fromEntries(tasks.map((t) => [t.task, t.score])), weights))
}

/** Median recall, fixed and damage of the critique task over repeats; nothing without them. */
function critiqueMedian(repeats) {
  const parts = repeats
    .map((r) => r.tasks.find((t) => t.task === 'critique')?.parts)
    .filter((p) => p && 'recall' in p)
  if (!parts.length) return {}
  const med = (k) => round1(median(parts.map((p) => p[k] ?? 0)))
  return { critique: { recall: med('recall'), fixed: med('fixed'), damage: med('damage') } }
}

/** Median, range and stability over repeats; `reliabilities` per repeat (0–1). */
export function summarizeRepeats(repeats, reliabilities, unstableRange) {
  const overall = repeats.map((r) => r.overall)
  const taskNames = [...new Set(repeats.flatMap((r) => r.tasks.map((t) => t.task)))]
  const tasks = Object.fromEntries(
    taskNames.map((name) => [
      name,
      round1(median(repeats.map((r) => r.tasks.find((t) => t.task === name)?.score ?? 0))),
    ]),
  )
  const lo = Math.min(...overall)
  const hi = Math.max(...overall)
  return {
    median: {
      overall: round1(median(overall)),
      tasks,
      draftingReliability: Math.round(median(reliabilities) * 1000) / 1000,
      ...critiqueMedian(repeats),
    },
    range: { overall: [lo, hi] },
    unstable: hi - lo > unstableRange,
  }
}
