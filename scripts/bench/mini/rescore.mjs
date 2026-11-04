// Score saved Mini run files again, without any model call (#610, #611, #612). Recomputed:
//   - the tokens-per-second figures and the draft time, from each call's own seconds and tokens;
//   - quality, with partial credit for the continuous criteria (#612), from the raw measures each
//     probe saved (lint penalty, citation shares, handbook words...). The long-prompt probe's pace
//     and tag mix were not saved as numbers by earlier runs; they are read again from the saved
//     work folder next to the run files when it is there, and keep their yes/no result when not;
//   - the score, the band and its reasons, and the run's scoring version.
// Completion, the failure counts and review damage are not touched.
//
//   node scripts/bench/mini/rescore.mjs <run-dir-or-file> [...]
//
// Writes each file in place and prints each model's quality and band before and after. Keep a
// copy of the folder first.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadExample, loadSuite, ROOT, scenarioIdFor, slug } from '../corpus.mjs'
import { phaseShape, phaseView, qualityOf, rangeOf, regradeProbe, speedOf } from './score.mjs'
import { restampRun, runFilesIn } from './restamp.mjs'
import { LEVEL_LABEL, verdictOf } from './verdict.mjs'

const loadGold = () =>
  JSON.parse(readFileSync(join(ROOT, 'bench', 'gold', 'scenario-3.json'), 'utf8'))

/** The calls of a saved repeat, as the scorer saw them. */
export const callsOf = (repeat) =>
  Object.entries(repeat.probes).map(([key, p]) => ({
    key,
    ok: p.ok,
    seconds: p.seconds,
    inputTokens: p.inputTokens,
    outputTokens: p.outputTokens,
  }))

/**
 * Pace and tag mix of the saved long-prompt reply of repeat `index`, read from the work folder
 * (`<work>/long-context-r<index>`), or undefined when it is not there.
 */
export function savedLongContextShape(workDir, index, suite, gold) {
  const spec = suite.probes.longContext
  const tagDir = join(workDir, `long-context-r${index}`)
  if (!existsSync(tagDir)) return undefined
  const project = readdirSync(tagDir).find((d) => d.endsWith('.asproj'))
  if (!project) return undefined
  const id = scenarioIdFor(loadExample(spec.example), spec.scenario)
  const file = join(tagDir, project, 'scenarios', id, 'scenario.json')
  if (!existsSync(file)) return undefined
  const scenario = JSON.parse(readFileSync(file, 'utf8'))
  const phase = scenario.phases.find((p) => p.index === spec.phaseIndex)
  return phase ? phaseShape(phaseView(scenario, phase.id), gold, suite.quality) : undefined
}

/** One saved repeat with partial credit applied and its quality and score recomputed. */
function regradeRepeat(repeat, ctx, shape) {
  const probes = Object.fromEntries(
    Object.entries(repeat.probes).map(([key, p]) => [
      key,
      regradeProbe(key, p, { ...ctx, measured: key === 'longContext' ? shape : undefined }),
    ]),
  )
  const quality = qualityOf(probes)
  return {
    ...repeat,
    probes,
    quality,
    score: Math.round(quality.score * repeat.completion) / 100,
  }
}

/** The result with quality and the score from the regraded repeats (completion is untouched). */
function resultWith(result, repeats) {
  const quality = rangeOf(repeats.map((r) => r.quality.score))
  const value = Math.round(quality.value * result.completion.value) / 100
  const scores = repeats.map((r) => r.score)
  return {
    ...result,
    quality,
    score: { value, min: Math.min(value, ...scores), max: Math.max(value, ...scores) },
  }
}

/**
 * The run with partial credit, speed, draft time and verdict recomputed from what it saved.
 * `workDir`: the saved work folder of this run, for the pace and tag mix of older runs.
 */
export function rescoreRun(run, suite = loadSuite('mini'), workDir = undefined, gold = loadGold()) {
  const ctx = { suite, gold }
  const graded = run.repeats.some((r) => Object.values(r.probes).some((p) => p.criteria?.length))
  const regraded = run.repeats.map((r, i) =>
    graded ? regradeRepeat(r, ctx, workDir && savedLongContextShape(workDir, i, suite, gold)) : r,
  )
  const repeats = regraded.map((r) => ({
    ...r,
    speed: { ...r.speed, ...speedOf({ calls: callsOf(r), budget: suite.scenarioBudget }) },
  }))
  const speeds = repeats.map((r) => r.speed)
  const result = {
    ...(graded ? resultWith(run.result, repeats) : run.result),
    outputTokensPerSecond: rangeOf(speeds.map((s) => s.outputTokensPerSecond)),
    promptTokensPerSecond: rangeOf(speeds.map((s) => s.promptTokensPerSecond)),
    draftMinutes: rangeOf(speeds.map((s) => s.draftMinutes)),
  }
  const verdict = verdictOf({ result, repeats, bands: suite.bands })
  return restampRun({ ...run, repeats, result, verdict }, suite)
}

const figure = (r) => (r ? `${r.value} (${r.min} to ${r.max})` : 'n/a')

const label = (v) => `${LEVEL_LABEL[v.level]}${v.uncertain ? ' (uncertain)' : ''}`

function main(paths) {
  if (!paths.length) throw new Error('usage: rescore.mjs <run-dir-or-file> [...]')
  for (const file of paths.flatMap((p) => runFilesIn(resolve(p)))) {
    const old = JSON.parse(readFileSync(file, 'utf8'))
    const workDir = join(dirname(file), 'work', slug(old.model.ref ?? old.model.name))
    const run = rescoreRun(old, loadSuite('mini'), workDir)
    writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`)
    const name = old.model.ref ?? old.model.name
    console.log(
      `${name}: quality ${figure(old.result.quality)} -> ${figure(run.result.quality)}; band ${label(old.verdict)} -> ${label(run.verdict)}; score ${figure(old.result.score)} -> ${figure(run.result.score)}`,
    )
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
