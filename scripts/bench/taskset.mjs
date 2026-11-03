// The public task set of a suite (#586): the files that define what the benchmark asks, and
// one hash over them, so a result says exactly which task set produced it. Pure reads.
//
//   pnpm bench:export                              (prints each suite's hash)
//   pnpm bench:export -- --suite standard --out ../tabletop-bench/tasks
//
// Files: the suite file, the defect files its critique cases name, the gold MSEL statistics,
// the judge prompt and calibration rows, and corpus.json (corpus hashes of the examples used
// and the drafting briefs). Scoring code is not part of it; it stays in this repository.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { caseBrief, corpusHash, loadExample, loadSuite, ROOT } from './corpus.mjs'
import { SCORING_VERSION } from './score/composite.mjs'

const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const readText = (root, rel) => readFileSync(join(root, rel), 'utf8')
const json = (value) => `${JSON.stringify(value, null, 2)}\n`

/** corpus.json: per example, its corpus hash and the briefs of the drafting cases using it. */
export function corpusManifest(suite, root = ROOT) {
  const out = {}
  const examples = [...suite.drafting, ...suite.ideation, ...suite.critique].map((c) => c.example)
  for (const id of new Set(examples))
    out[id] = { corpusHash: corpusHash(loadExample(id, root)), briefs: {} }
  for (const c of suite.drafting)
    out[c.example].briefs[c.id] = caseBrief(loadExample(c.example, root), c.scenario)
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

/** A suite whose cases are kept out of the published task set (bench/defects-held-out/). */
export const isHeldOut = (suite) => suite.critique.some((c) => c.defects?.startsWith('held-out-'))

/** { path: text } for every file of the task set, paths relative to the task-set folder. */
export function taskSetFiles(suiteName, root = ROOT) {
  const suite = loadSuite(suiteName, root)
  if (isHeldOut(suite)) throw new Error(`${suiteName} is held out and has no published task set`)
  const files = {
    'suite.json': readText(root, `bench/suites/${suiteName}.json`),
    'gold/scenario-3.json': readText(root, 'bench/gold/scenario-3.json'),
    'judge/bench_judge.md': readText(root, 'bench/prompts/bench_judge.md'),
    'judge/calibration-rows.json': readText(root, 'bench/calibration/rows.json'),
    'corpus.json': json(corpusManifest(suite, root)),
  }
  for (const c of suite.critique)
    files[`defects/${c.defects}.json`] = readText(root, `bench/defects/${c.defects}.json`)
  return files
}

/** sha256 over the sorted (path, file hash) pairs. The manifest itself is not hashed. */
export function hashFiles(files) {
  const lines = Object.keys(files)
    .sort()
    .map((p) => `${p}\0${sha256(files[p])}\n`)
  return sha256(lines.join(''))
}

export function taskSetManifest(suiteName, root = ROOT) {
  const suite = loadSuite(suiteName, root)
  const files = taskSetFiles(suiteName, root)
  return {
    formatVersion: 1,
    suite: suite.suite,
    suiteVersion: suite.suiteVersion,
    scoringVersion: SCORING_VERSION,
    hash: hashFiles(files),
    files: Object.fromEntries(
      Object.keys(files)
        .sort()
        .map((p) => [p, sha256(files[p])]),
    ),
  }
}

export const taskSetHash = (suiteName, root = ROOT) => taskSetManifest(suiteName, root).hash

/** Writes <out>/<suite>-v<N>/ with the files and taskset.json. */
export function exportTaskSet(suiteName, outDir, root = ROOT) {
  const manifest = taskSetManifest(suiteName, root)
  const dir = resolve(outDir, `${manifest.suite}-v${manifest.suiteVersion}`)
  for (const [rel, text] of Object.entries(taskSetFiles(suiteName, root))) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  writeFileSync(join(dir, 'taskset.json'), json(manifest))
  return { dir, manifest }
}

function main(argv) {
  const arg = (name) => argv[argv.indexOf(name) + 1]
  const out = argv.includes('--out') ? arg('--out') : null
  const suites = argv.includes('--suite') ? [arg('--suite')] : ['quick', 'standard']
  for (const s of suites) {
    if (!out) {
      const m = taskSetManifest(s)
      console.log(`${m.suite} v${m.suiteVersion} scoring v${m.scoringVersion} ${m.hash}`)
    } else {
      const { dir, manifest } = exportTaskSet(s, out)
      console.log(`${dir}\n  hash ${manifest.hash}`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2))
