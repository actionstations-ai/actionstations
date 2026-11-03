#!/usr/bin/env node
// The token budget of one full scenario (#606, docs/specs/0445-tabletop-mini-benchmark.md),
// used to turn a model's measured speed into the Mini's "draft time".
//
// The budget comes from the pipeline and from the bundled examples, nothing else. The pipeline
// (src/main/generate/engine.ts, PIPELINE_STAGES) makes one model call per stage and one
// msel_phase call per phase: with four phases, 14 calls. Each bundled example scenario keeps
// the input and output token counts of every call that drafted it (its provenance), so the
// budget of a stage is the mean of those counts over the bundled scenarios that ran it. A
// msel_phase call is the mean per phase times the phase count. Nothing here reads benchmark
// results; a test checks that the numbers in bench/suites/mini.json are what this computes.
//
//   node scripts/bench/mini/budget.mjs        prints the budget as JSON
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from '../corpus.mjs'

/** The stages of the scenario pipeline, in order (engine.ts PIPELINE_STAGES). */
export const PIPELINE_STAGES = [
  'scenario_overview',
  'objectives_roles',
  'phase_plan',
  'msel_phase',
  'controller_handbook',
  'rubric',
  'eeg',
  'player_briefing',
  'hotwash',
  'sitman',
  'critique',
]

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const round = (n) => Math.round(n)
const sum = (xs) => xs.reduce((a, b) => a + b, 0)

/** Every bundled example scenario (scenario.json), read from examples/<id>/project/scenarios. */
export function bundledScenarios(root = ROOT) {
  const out = []
  const examples = join(root, 'examples')
  for (const e of readdirSync(examples, { withFileTypes: true })) {
    const dir = join(examples, e.name, 'project', 'scenarios')
    if (!e.isDirectory()) continue
    if (!existsSync(dir)) continue
    for (const id of readdirSync(dir)) out.push(readJson(join(dir, id, 'scenario.json')))
  }
  return out
}

/** Tokens a scenario's provenance records for one stage (all its calls summed). */
function stageTokens(scenario, stage) {
  const runs = scenario.provenance.filter((r) => r.stage === stage && r.status !== 'error')
  if (!runs.length) return undefined
  return {
    input: sum(runs.map((r) => r.inputTokens ?? 0)),
    output: sum(runs.map((r) => r.outputTokens ?? 0)),
    calls: runs.length,
  }
}

const meanOf = (xs) => (xs.length ? sum(xs) / xs.length : 0)

/**
 * { phases, modelStages, inputTokens, outputTokens, stages: [{ stage, calls, inputTokens,
 * outputTokens, scenarios }] } for a scenario of `phases` phases.
 */
export function scenarioBudget({ phases = 4, root = ROOT, scenarios } = {}) {
  const all = scenarios ?? bundledScenarios(root)
  const stages = PIPELINE_STAGES.map((stage) => {
    const seen = all.map((s) => stageTokens(s, stage)).filter(Boolean)
    // msel_phase: tokens per call, times one call per phase.
    const perCall = stage === 'msel_phase'
    const calls = perCall ? phases : 1
    const scale = (key) =>
      perCall
        ? (sum(seen.map((t) => t[key])) / Math.max(1, sum(seen.map((t) => t.calls)))) * phases
        : meanOf(seen.map((t) => t[key]))
    return {
      stage,
      calls,
      inputTokens: round(scale('input')),
      outputTokens: round(scale('output')),
      scenarios: seen.length,
    }
  })
  return {
    phases,
    modelStages: sum(stages.map((s) => s.calls)),
    inputTokens: sum(stages.map((s) => s.inputTokens)),
    outputTokens: sum(stages.map((s) => s.outputTokens)),
    stages,
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) console.log(JSON.stringify(scenarioBudget(), null, 2))
