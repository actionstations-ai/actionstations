#!/usr/bin/env node
// Validate the Mini against saved full runs, with no model call (#604, spec 0445). A run folder
// (the --out folder of pnpm bench) keeps every stage's output in its work folder. For each
// Mini probe this reads the same kind of call from the run's own drafted scenario (overview,
// the last MSEL phase, the handbook) and its saved critique case, scores them with the Mini's
// scorers and compares the verdict with the full run's results.
//
//   pnpm bench:mini:replay <run-dir> [<run-dir> ...] [--json]
//
// The inputs differ from a live Mini (the run's own upstream stages, not the fixed ones), so
// this shows whether the probes would see the failures, not what a live Mini scores.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadDefects, loadExample, loadSuite, ROOT, scenarioIdFor } from '../corpus.mjs'
import { findCaseScenario, rescoreCase } from '../rescore.mjs'
import { median } from '../score/util.mjs'
import {
  miniScore,
  runObservation,
  scoreFormat,
  scoreLongContext,
  scoreLongOutput,
  scoreReview,
  speedOf,
} from './score.mjs'
import { LEVEL_LABEL, verdictOf } from './verdict.mjs'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const dirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(dir, d.name))
    : []

/** Scenario folders the run generated for `example` in repeat `r` (those with a started overview). */
function generatedScenarios(workRoot, r, example, startedAt) {
  const out = []
  for (const model of dirs(workRoot))
    for (const rep of dirs(model).filter((d) => d.endsWith(`/r${r + 1}`)))
      for (const project of dirs(join(rep, example)).filter((d) => d.endsWith('.asproj')))
        for (const dir of dirs(join(project, 'scenarios'))) {
          const file = join(dir, 'scenario.json')
          if (!existsSync(file)) continue
          const scenario = readJson(file)
          const first = scenario.provenance.find((p) => p.stage === 'scenario_overview')
          if (first && first.startedAt >= startedAt.slice(0, 10)) out.push({ dir, scenario })
        }
  return out.sort((a, b) =>
    a.scenario.provenance[0].startedAt.localeCompare(b.scenario.provenance[0].startedAt),
  )
}

const handbookOf = (dir) => {
  const file = join(dir, 'documents', 'handbook.md')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/**
 * The Mini's long-prompt call is the last phase. A run that stopped at an earlier phase never
 * reached it, so the failed phase call stands in for it (the same stage, a shorter prompt).
 */
function lastPhaseObservation(scenario) {
  const phase = [...scenario.phases].sort((a, b) => b.index - a.index)[0]
  const failedRun = scenario.provenance.find(
    (r) => r.stage === 'msel_phase' && r.status === 'error',
  )
  if (failedRun) return { phase, obs: runObservation(scenario, 'msel_phase', failedRun.itemId) }
  return { phase, obs: phase ? runObservation(scenario, 'msel_phase', phase.id) : undefined }
}

function reviewProbe(workRoot, r, c, suite, what) {
  const defects = loadDefects(c.defects)
  const scenarioId = scenarioIdFor(loadExample(c.example), defects.scenario)
  const found = findCaseScenario(workRoot, r, c, scenarioId)
  if (!found) return undefined
  const critique = rescoreCase(workRoot, r, c, suite)
  const obs = runObservation(found.final, 'critique')
  return { obs, probe: scoreReview({ obs, critique, what }) }
}

/** The Mini probes for one saved run folder; undefined parts are those the folder cannot supply. */
export function miniFromRun(dir, mini, gold, repeat = 0, heldOutWork = undefined) {
  const file = readdirSync(dir).find((f) => f.endsWith('.json') && f !== 'state.json')
  if (!file) return undefined
  const run = readJson(join(dir, file))
  const work = join(dir, 'work')
  const water = generatedScenarios(work, repeat, 'city-water', run.startedAt)[0]
  const probes = {}
  const calls = []
  if (water) {
    const sc = water.scenario
    const format = runObservation(sc, 'scenario_overview')
    probes.format = scoreFormat(format)
    calls.push({ key: 'format', ...format })
    const { phase, obs } = lastPhaseObservation(sc)
    const long = obs ?? { ok: false, error: 'the run never reached this stage' }
    probes.longContext = phase
      ? scoreLongContext({
          obs: long,
          scenario: sc,
          phaseId: phase.id,
          grounding: sc.grounding,
          suite: mini,
          gold,
        })
      : scoreLongContext({ obs: long })
    calls.push({ key: 'longContext', ...long })
    const hb = runObservation(sc, 'controller_handbook')
    probes.longOutput = scoreLongOutput({
      obs: hb,
      handbookMd: handbookOf(water.dir),
      simcellScripts: sc.simcellScripts?.length,
      suite: mini,
    })
    calls.push({ key: 'longOutput', ...hb })
  }
  const review = reviewProbe(work, repeat, mini.critique[0], mini, 'The review call')
  if (review) {
    probes.review = review.probe
    calls.push({ key: 'review', ...review.obs })
  }
  const heldCase = loadSuite('mini-held-out').critique[0]
  const held = reviewProbe(heldOutWork ?? work, repeat, heldCase, mini, 'The held-out review call')
  if (held) probes.heldOutReview = held.probe
  const longCall = calls.find((c) => c.key === 'longContext' && c.ok)
  const speed = speedOf({ calls, longPrompt: longCall })
  const score = miniScore(probes, mini.weights.mini)
  return {
    run,
    probes,
    speed,
    score,
    verdict: verdictOf({ probes, speed, score, thresholds: mini.thresholds }),
  }
}

/** Spearman rank correlation of two equal-length lists (average ranks for ties). */
export function spearman(a, b) {
  const ranks = (xs) =>
    xs.map((x) => {
      const less = xs.filter((y) => y < x).length
      const same = xs.filter((y) => y === x).length
      return less + (same + 1) / 2
    })
  const [ra, rb] = [ranks(a), ranks(b)]
  const ma = ra.reduce((s, x) => s + x, 0) / ra.length
  const mb = rb.reduce((s, x) => s + x, 0) / rb.length
  const cov = ra.reduce((s, x, i) => s + (x - ma) * (rb[i] - mb), 0)
  const va = ra.reduce((s, x) => s + (x - ma) ** 2, 0)
  const vb = rb.reduce((s, x) => s + (x - mb) ** 2, 0)
  return va && vb ? Math.round((cov / Math.sqrt(va * vb)) * 100) / 100 : 0
}

const FULL_FLAGS = (run) => {
  const out = []
  if (run.median.draftingReliability < 0.9)
    out.push(`reliability ${Math.round(run.median.draftingReliability * 100)}%`)
  for (const t of ['drafting', 'ideation'])
    if ((run.median.tasks[t] ?? 0) < 50) out.push(`${t} ${run.median.tasks[t]}`)
  if (run.median.critique?.damage >= 10) out.push(`review damage ${run.median.critique.damage}%`)
  return out.length ? out.join('; ') : 'none'
}

/** The work folder of a held-out run saved next to `<model>-quick` (`-held-out`, `-held-out2`). */
function heldOutWorkFor(dir) {
  if (!dir.endsWith('-quick')) return undefined
  const base = dir.slice(0, -'-quick'.length)
  return ['-held-out', '-held-out2']
    .map((suffix) => join(`${base}${suffix}`, 'work'))
    .find((work) => existsSync(work))
}

export function replayRows(targets) {
  const mini = loadSuite('mini')
  const gold = readJson(join(ROOT, 'bench', 'gold', 'scenario-3.json'))
  return targets.flatMap((dir) => {
    const m = miniFromRun(dir, mini, gold, 0, heldOutWorkFor(dir))
    if (!m) return []
    const critiqueDamage = m.probes.review?.metrics?.damage
    return [
      {
        dir: basename(dir),
        model: m.run.model.ref,
        suite: m.run.suite,
        full: {
          overall: m.run.median.overall,
          tasks: m.run.median.tasks,
          flags: FULL_FLAGS(m.run),
        },
        mini: {
          score: m.score,
          level: m.verdict.level,
          reasons: m.verdict.reasons,
          probes: Object.fromEntries(
            Object.entries(m.probes).map(([k, p]) => [k, p.ok ? Math.round(p.score) : 'failed']),
          ),
          reviewDamage: critiqueDamage,
          speed: m.speed,
        },
      },
    ]
  })
}

export function tableMarkdown(rows) {
  const lines = [
    '| Run | Full overall | Full drafting | Full flags | Mini score | Mini verdict | Mini reasons |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| ${r.dir} | ${r.full.overall} | ${r.full.tasks.drafting} | ${r.full.flags} | ${r.mini.score} | ${LEVEL_LABEL[r.mini.level]} | ${r.mini.reasons.join('; ')} |`,
    ),
  ]
  return lines.join('\n')
}

function main(argv) {
  const json = argv.includes('--json')
  const targets = argv
    .filter((a) => !a.startsWith('--') && statSync(a, { throwIfNoEntry: false })?.isDirectory())
    .map((a) => resolve(a))
  if (!targets.length) throw new Error('usage: pnpm bench:mini:replay <run-dir> [<run-dir> ...]')
  const rows = replayRows(targets)
  if (json) return console.log(JSON.stringify(rows, null, 2))
  console.log(tableMarkdown(rows))
  const mini = rows.map((r) => r.mini.score)
  const rho = (pick) => spearman(mini, rows.map(pick))
  console.log(
    `\nSpearman rank correlation of the Mini score over ${rows.length} runs: ${rho((r) => r.full.overall)} with the full overall, ` +
      `${rho((r) => r.full.tasks.drafting)} with full drafting (median Mini ${median(mini)}).`,
  )
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  try {
    main(process.argv.slice(2))
  } catch (err) {
    console.error(`bench:mini:replay: ${err?.message ?? err}`)
    process.exit(1)
  }
}
