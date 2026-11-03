#!/usr/bin/env node
// Score saved Mini runs again with the current scoring, with no model call (#606). A Mini run
// folder (the --out folder of pnpm bench:mini) holds the run files and a work folder with the
// project each probe used. For each probe this reads the saved scenario (what the call left
// behind: its provenance, rows, handbook and, for the review, the planted-defect snapshot and
// the revised MSEL) and scores it with the Mini's scorers, then builds the score, band and
// ranges exactly as a live run does.
//
//   pnpm bench:mini:replay <mini-run-dir> [--json]
//
// What a replay cannot recompute is listed per run, never guessed:
//   - A call cut by the old 180 s per-call cap has no saved reply: it is left out of the score
//     (and out of the completion count), and named.
//   - Only one sample was saved, so every range is a single value (no second run).
//   - The long-prompt call was the unstretched last phase (about 6 rows), so the rows-in-phase
//     criterion is dropped; the harder 15 to 20 row probe has no saved data.
//   - Saved runs do not record a reply that was cut off and asked again, so only repair rounds
//     count against the first-try rate.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { applyDefects } from '../defects.mjs'
import {
  loadDefects,
  loadExample,
  loadSuite,
  ROOT,
  scenarioIdFor,
  shippedScenario,
  slug,
} from '../corpus.mjs'
import { critiqueCase } from '../score/composite.mjs'
import { critiqueNotes } from '../score/critique.mjs'
import { lintFindings } from '../score/lint.mjs'
import {
  miniResult,
  runObservation,
  scoreFormat,
  scoreLongContext,
  scoreLongOutput,
  scoreRepeat,
  scoreReview,
} from './score.mjs'
import { LEVEL_LABEL, verdictOf } from './verdict.mjs'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const dirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(dir, d.name))
    : []

/** The work-folder tag each probe ran in (probes.mjs before repeats were added). */
const TAGS = {
  format: 'format',
  longContext: 'long-context',
  longOutput: 'long-output',
  review: 'review',
  heldOutReview: 'held-out',
}

/** The first project of a probe's tag folder, or undefined. */
const projectOf = (workDir, tag) => dirs(join(workDir, tag)).find((d) => d.endsWith('.asproj'))

const scenarioFile = (project, id) => join(project, 'scenarios', id, 'scenario.json')

/** Was this saved probe a call cut by the old per-call cap? */
const wasCapped = (old) => old && !old.ok && /time cap/.test(old.reason ?? '')

/** The saved scenario of a probe, or undefined when the folder is missing. */
function savedScenario(workDir, tag, example, key) {
  const project = projectOf(workDir, tag)
  if (!project) return undefined
  const file = scenarioFile(project, scenarioIdFor(loadExample(example), key))
  return existsSync(file) ? { project, file, scenario: readJson(file) } : undefined
}

/** The snapshot saved with the planted defects (history), newest match. */
function plantedSnapshot(file, caseId) {
  if (!existsSync(file)) return undefined
  const note = `Benchmark ${caseId}: planted defects`
  const hits = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => e.note === note)
  return hits.at(-1)?.snapshot
}

function replayReview(workDir, tag, c, suite, what) {
  const defects = loadDefects(c.defects)
  const saved = savedScenario(workDir, tag, c.example, defects.scenario)
  if (!saved) return undefined
  const snapshot = plantedSnapshot(join(saved.file, '..', 'history', 'scenario.jsonl'), c.id)
  if (!snapshot) return undefined
  const obs = runObservation(saved.scenario, 'critique')
  const { planted } = applyDefects(
    shippedScenario(loadExample(c.example), defects.scenario),
    defects,
  )
  const critique = obs.ok
    ? critiqueCase({
        notes: critiqueNotes(saved.scenario.warnings),
        planted,
        lints: lintFindings(saved.scenario.warnings),
        rowCount: snapshot.msel.length,
        suite,
        before: snapshot.msel,
        after: saved.scenario.msel,
      })
    : undefined
  return { obs, probe: scoreReview({ obs, critique, what }) }
}

function replayFormat(workDir, spec) {
  const saved = savedScenario(workDir, TAGS.format, spec.example, spec.scenario)
  if (!saved) return undefined
  const obs = runObservation(saved.scenario, spec.stage)
  return { obs, probe: scoreFormat(obs) }
}

function replayLongContext(workDir, spec, suite, gold) {
  const saved = savedScenario(workDir, TAGS.longContext, spec.example, spec.scenario)
  if (!saved) return undefined
  const phase = saved.scenario.phases.find((p) => p.index === spec.phaseIndex)
  if (!phase) return undefined
  const obs = runObservation(saved.scenario, spec.stage, phase.id)
  // The saved phase is the unstretched one: its row count cannot meet the full-phase criterion.
  const old = { ...suite, quality: { ...suite.quality, phaseMinRows: 0 } }
  const probe = scoreLongContext({
    obs,
    scenario: saved.scenario,
    phaseId: phase.id,
    grounding: saved.scenario.grounding,
    suite: old,
    gold,
  })
  return { obs, probe }
}

function replayLongOutput(workDir, spec, suite) {
  const saved = savedScenario(workDir, TAGS.longOutput, spec.example, spec.scenario)
  if (!saved) return undefined
  const obs = runObservation(saved.scenario, spec.stage)
  const hb = join(saved.file, '..', 'documents', 'handbook.md')
  const probe = scoreLongOutput({
    obs,
    handbookMd: existsSync(hb) ? readFileSync(hb, 'utf8') : '',
    simcellScripts: saved.scenario.simcellScripts?.length,
    suite,
  })
  return { obs, probe }
}

/**
 * One saved Mini run scored again: { model, probes, unknown, repeat, result, verdict }.
 * `old` is the saved run file (the previous scoring's), used only to know which calls the old
 * cap cut and where the work folder is.
 */
export function replayMiniRun(old, workDir, suite, gold, heldOutCase) {
  const spec = suite.probes
  const found = {
    format: replayFormat(workDir, spec.format),
    longContext: replayLongContext(workDir, spec.longContext, suite, gold),
    longOutput: replayLongOutput(workDir, spec.longOutput, suite),
    review: replayReview(workDir, TAGS.review, suite.critique[0], suite, 'The review call'),
    ...(old.probes.heldOutReview && heldOutCase
      ? {
          heldOutReview: replayReview(
            workDir,
            TAGS.heldOutReview,
            heldOutCase,
            suite,
            'The held-out review call',
          ),
        }
      : {}),
  }
  const probes = {}
  const calls = []
  const unknown = []
  for (const [key, hit] of Object.entries(found)) {
    if (wasCapped(old.probes[key]))
      unknown.push({ probe: key, why: 'cut by the old 180 s per-call cap; the reply is not saved' })
    else if (!hit) unknown.push({ probe: key, why: 'no saved work for this probe' })
    else {
      probes[key] = hit.probe
      calls.push({ key, ...hit.obs })
    }
  }
  const repeat = { seed: suite.seeds[0], probes, calls }
  repeat.result = scoreRepeat({ probes, calls, suite })
  const result = miniResult({ repeats: [repeat], suite })
  const verdict = verdictOf({ result, repeats: [repeat.result], bands: suite.bands })
  const before = {
    score: old.score,
    level: old.verdict?.level,
    reasons: old.verdict?.reasons ?? [],
  }
  return { model: old.model.ref, probes, unknown, repeat, result, verdict, before }
}

/** Saved run files (not state files) in a Mini run folder. */
const runFiles = (dir) =>
  readdirSync(dir).filter((f) => f.startsWith('mini-') && f.endsWith('.json'))

export function replayDir(dir) {
  const suite = loadSuite('mini')
  const gold = readJson(join(ROOT, 'bench', 'gold', 'scenario-3.json'))
  const heldOutCase = loadSuite('mini-held-out').critique[0]
  return runFiles(dir).map((f) => {
    const old = readJson(join(dir, f))
    return replayMiniRun(old, join(dir, 'work', slug(old.model.ref)), suite, gold, heldOutCase)
  })
}

const OLD_LABEL = { will_work: 'Will work', risky: 'Risky', wont_work: "Won't work" }

const num = (r, unit = '') => (r ? `${r.value}${unit}` : 'n/a')

export function tableMarkdown(rows) {
  const lines = [
    '| Model | Quality | Per-call | Completion | Mini score | Damage | Draft time | Band now | Saved verdict (v1) | Not recomputed |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => {
      const x = r.result
      const skipped = r.unknown.map((u) => u.probe).join(', ') || 'none'
      return `| ${r.model} | ${num(x.quality)} | ${num(x.perCallRate, '%')} (${x.firstTryCalls}/${x.calls}) | ${num(x.completion, '%')} | ${num(x.score)} | ${num(x.damage, '%')} | ${num(x.draftMinutes, ' min')} | ${LEVEL_LABEL[r.verdict.level]}${r.unknown.length ? ' (partial)' : ''} | ${OLD_LABEL[r.before.level] ?? r.before.level} ${r.before.score} | ${skipped} |`
    }),
  ]
  return lines.join('\n')
}

function main(argv) {
  const json = argv.includes('--json')
  const targets = argv
    .filter((a) => !a.startsWith('--') && statSync(a, { throwIfNoEntry: false })?.isDirectory())
    .map((a) => resolve(a))
  if (!targets.length) throw new Error('usage: pnpm bench:mini:replay <mini-run-dir> [--json]')
  const rows = targets.flatMap(replayDir)
  if (json) return console.log(JSON.stringify(rows, null, 2))
  console.log(tableMarkdown(rows))
  for (const r of rows)
    for (const u of r.unknown) console.log(`- ${r.model}: ${u.probe} not recomputed: ${u.why}`)
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
