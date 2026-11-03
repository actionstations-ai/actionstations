#!/usr/bin/env node
// Re-score the critique cases of saved benchmark runs with the current scorer (#592), without
// any model call. A run folder (the --out folder of pnpm bench) holds the run file and the work
// folder with every project the run used; for each critique case this reads the scenario before
// the critique (the history snapshot saved with the planted defects) and after its revision,
// plus the critique notes stored on it, and scores them again.
//
//   pnpm bench:rescore <run-dir> [<run-dir> ...] [--json]
//
// Prints, per run, the critique figures and the floor verdict as scored then and now. The old
// figures come from the run file; the notes-only recall is recomputed so the table shows that
// the rows were read correctly (it should equal the old recall).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { applyDefects } from './defects.mjs'
import { loadDefects, loadExample, loadSuite, scenarioIdFor, shippedScenario } from './corpus.mjs'
import { aggregateTask, overallScore, summarizeRepeats, critiqueCase } from './score/composite.mjs'
import { critiqueNotes } from './score/critique.mjs'
import { lintFindings } from './score/lint.mjs'
import { FLOOR_TASKS } from './scheduler.mjs'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const dirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(dir, d.name))
    : []

/** The folders a repeat's projects can be in: its own, and one per parallel worker. */
function repeatFolders(workRoot, repeat) {
  const base = dirs(workRoot).flatMap((model) =>
    dirs(model).filter((d) => d.endsWith(`/r${repeat + 1}`)),
  )
  return base.flatMap((b) => [b, ...dirs(b).filter((d) => /\/w\d+$/.test(d))])
}

/** The snapshot the benchmark saved with the planted defects, newest first match; or null. */
function plantedSnapshot(historyFile, caseId) {
  if (!existsSync(historyFile)) return null
  const note = `Benchmark ${caseId}: planted defects`
  const lines = readFileSync(historyFile, 'utf8').split('\n').filter(Boolean)
  const hit = lines.map((l) => JSON.parse(l)).filter((e) => e.note === note)
  return hit.at(-1)?.snapshot ?? null
}

/** Where case `c` of repeat `repeat` ran: its scenario folder, or null when not in the work folder. */
export function findCaseScenario(workRoot, repeat, c, scenarioId) {
  for (const folder of repeatFolders(workRoot, repeat)) {
    for (const project of dirs(join(folder, c.example)).filter((d) => d.endsWith('.asproj'))) {
      const dir = join(project, 'scenarios', scenarioId)
      const snapshot = plantedSnapshot(join(dir, 'history', 'scenario.jsonl'), c.id)
      if (snapshot && existsSync(join(dir, 'scenario.json')))
        return { dir, snapshot, final: readJson(join(dir, 'scenario.json')) }
    }
  }
  return null
}

/** One critique case scored again from the saved scenarios; null when they are not there. */
export function rescoreCase(workRoot, repeat, c, suite) {
  const defects = loadDefects(c.defects)
  const example = loadExample(c.example)
  const scenarioId = scenarioIdFor(example, defects.scenario)
  const found = findCaseScenario(workRoot, repeat, c, scenarioId)
  if (!found) return null
  const { planted } = applyDefects(shippedScenario(example, defects.scenario), defects)
  const scored = critiqueCase({
    notes: critiqueNotes(found.final.warnings),
    planted,
    lints: lintFindings(found.final.warnings),
    rowCount: found.snapshot.msel.length,
    suite,
    before: found.snapshot.msel,
    after: found.final.msel,
  })
  return { caseId: c.id, ...scored }
}

const floorOf = (tasks, reliability, thresholds) =>
  FLOOR_TASKS.every((t) => (tasks[t] ?? 0) >= thresholds.floorTaskScore) &&
  reliability >= thresholds.floorDraftingReliability

/** Re-score every critique case of a run; `run` is the run file, `workRoot` its work folder. */
export function rescoreRun(run, workRoot, suite) {
  const missing = []
  const repeats = run.repeats.map((rep, r) => {
    const results = suite.critique.map((c) => {
      const scored = rescoreCase(workRoot, r, c, suite)
      if (!scored) missing.push(`repeat ${r + 1} ${c.id}`)
      return scored
    })
    const critique = aggregateTask('critique', results.filter(Boolean), {
      wallSeconds: rep.tasks.find((t) => t.task === 'critique')?.wallSeconds ?? 0,
    })
    const tasks = rep.tasks.map((t) => (t.task === 'critique' ? critique : t))
    return { ...rep, tasks, overall: overallScore(tasks, suite.weights.overall), cases: results }
  })
  const summary = summarizeRepeats(
    repeats,
    repeats.map(() => run.median.draftingReliability),
    suite.thresholds.unstableRange,
  )
  const before = floorVerdict(run.median.tasks, run, suite, ['drafting', 'critique', 'ideation'])
  return {
    repeats,
    summary,
    missing,
    floor: {
      before,
      after: floorOf(summary.median.tasks, run.median.draftingReliability, suite.thresholds),
    },
  }
}

function floorVerdict(tasks, run, suite, names) {
  return (
    names.every((t) => (tasks[t] ?? 0) >= suite.thresholds.floorTaskScore) &&
    run.median.draftingReliability >= suite.thresholds.floorDraftingReliability
  )
}

/** Run files in a run folder (not state.json). */
export const runFiles = (dir) =>
  readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'state.json')

/** Mean of a list of numbers; 0 for an empty list. */
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const r1 = (n) => Math.round(n * 10) / 10

/** One table row for a run folder. */
export function summarize(dir) {
  const files = runFiles(dir)
  if (!files.length) return { dir, skipped: 'no run file (the run did not finish)' }
  const run = readJson(join(dir, files[0]))
  const suite = loadSuite(run.suite)
  const re = rescoreRun(run, join(dir, 'work'), suite)
  const cases = re.repeats.flatMap((r) => r.cases.filter(Boolean))
  const oldTask = (t) => run.median.tasks[t]
  const old = run.repeats.flatMap((r) =>
    Object.values(r.tasks.find((t) => t.task === 'critique')?.details ?? {}),
  )
  return {
    dir,
    model: run.model.ref,
    suite: run.suite,
    repeats: run.repeats.length,
    scoredCases: cases.length,
    missing: re.missing,
    oldRecall: r1(mean(old.map((d) => d.recall ?? 0))),
    notesOnlyRecall: r1(mean(cases.map((c) => c.details.noted))),
    recall: r1(mean(cases.map((c) => c.parts.recall))),
    fixed: r1(mean(cases.map((c) => c.parts.fixed))),
    damage: r1(mean(cases.map((c) => c.parts.damage))),
    critiqueBefore: oldTask('critique'),
    critiqueAfter: re.summary.median.tasks.critique,
    overallBefore: run.median.overall,
    overallAfter: re.summary.median.overall,
    floorBefore: re.floor.before,
    floorAfter: re.floor.after,
  }
}

export function tableMarkdown(rows) {
  const head = [
    '| Run | Critique then | Critique now | Recall then | Recall notes only | Recall now | Fixed | Damage | Overall then | Overall now | Floor then | Floor now |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  const yn = (b) => (b ? 'pass' : 'miss')
  return [
    ...head,
    ...rows
      .filter((r) => !r.skipped)
      .map(
        (r) =>
          `| ${basename(r.dir)} (${r.suite}, ${r.repeats} repeat(s)) | ${r.critiqueBefore} | ${r.critiqueAfter} | ${r.oldRecall}% | ${r.notesOnlyRecall}% | ${r.recall}% | ${r.fixed}% | ${r.damage}% | ${r.overallBefore} | ${r.overallAfter} | ${yn(r.floorBefore)} | ${yn(r.floorAfter)} |`,
      ),
  ].join('\n')
}

function main(argv) {
  const json = argv.includes('--json')
  const targets = argv.filter(
    (a) => !a.startsWith('--') && statSync(a, { throwIfNoEntry: false })?.isDirectory(),
  )
  if (!targets.length)
    throw new Error('usage: pnpm bench:rescore <run-dir> [<run-dir> ...] [--json]')
  const rows = targets.map((t) => summarize(resolve(t)))
  if (json) return console.log(JSON.stringify(rows, null, 2))
  console.log(tableMarkdown(rows))
  for (const r of rows) {
    if (r.skipped) console.log(`\n${r.dir}: skipped, ${r.skipped}`)
    else if (r.missing.length)
      console.log(`\n${r.model}: no saved scenario for ${r.missing.join(', ')}`)
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  try {
    main(process.argv.slice(2))
  } catch (err) {
    console.error(`bench:rescore: ${err?.message ?? err}`)
    process.exit(1)
  }
}
