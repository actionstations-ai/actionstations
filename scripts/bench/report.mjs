#!/usr/bin/env node
// Merge submitted benchmark runs (docs/benchmarks/runs/*.json) into the report the website
// reads (#434, FR-19 to FR-21): docs/benchmarks/model-benchmarks.json, its JSON Schema and the
// generated table in docs/benchmarks/README.md, with a recommended model per memory tier of
// the setup recommendations (TEXT_TIERS in src/main/setup/models.ts).
//
//   pnpm bench:report [--suite standard] [--runs <dir>] [--out <dir>]
//   pnpm bench:report --schema        (writes model-benchmarks.schema.json only)
//
// Run files are untrusted data: each is validated with the BenchRun schema, refused when a
// string looks like an absolute path or a field names a host or user, and every string is
// Markdown-escaped in the table.
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { importMain } from '../lib/bundle-main.mjs'
import { loadSuite, ROOT } from './corpus.mjs'
import { SCORING_VERSION } from './score/composite.mjs'
import { median } from './score/util.mjs'
import { writeFormatted } from './write.mjs'

/** Budget assumed for the lowest tier (an 8 GB Apple Silicon Mac has about 5.6 GB). */
export const LOWEST_TIER_BUDGET_GB = 5.5
const FORBIDDEN_KEYS = new Set(['hostname', 'host', 'username', 'user', 'home', 'path', 'cwd'])
const ABSOLUTE = /^(\/|~[\\/]|[A-Za-z]:[\\/]|\\\\)/

/** Where a run carries a path, host or user name (NFR-2); empty when clean. */
export function findForbidden(value, at = '$') {
  if (typeof value === 'string') return ABSOLUTE.test(value) ? [at] : []
  if (Array.isArray(value)) return value.flatMap((v, i) => findForbidden(v, `${at}[${i}]`))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => [
      ...(FORBIDDEN_KEYS.has(k.toLowerCase()) ? [`${at}.${k}`] : []),
      ...findForbidden(v, `${at}.${k}`),
    ])
  return []
}

/**
 * A rough KV-cache size for the context used: a tenth of the weights per 32k tokens (the
 * context the suites run at), at least a quarter GB. Recorded as an estimate; a model the tool cannot load at the suite's context
 * shows up as failed stages instead.
 */
export function kvCacheGb(model) {
  const weightsGb = (model.sizeBytes ?? 0) / 1e9
  const ctx = model.contextLength ?? 32768
  return Math.max(0.25, weightsGb * 0.1 * (ctx / 32768))
}

export const fitsBudgetGb = (model) =>
  Math.round(((model.sizeBytes ?? 0) / 1e9 + kvCacheGb(model)) * 10) / 10

const round1 = (n) => Math.round(n * 10) / 10

/** One entry per model ref: medians of the runs' medians, the widest range, every machine. */
export function mergeRuns(runs, unstableRange) {
  const byRef = new Map()
  for (const run of runs) byRef.set(run.model.ref, [...(byRef.get(run.model.ref) ?? []), run])
  return [...byRef.values()].map((list) => {
    const latest = [...list].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1)
    const overall = list.map((r) => r.median.overall)
    const tasks = [...new Set(list.flatMap((r) => Object.keys(r.median.tasks)))]
    const hardware = [
      ...new Map(list.map((r) => [JSON.stringify(r.hardware), r.hardware])).values(),
    ]
    return {
      model: latest.model,
      runs: list.length,
      median: {
        overall: round1(median(overall)),
        tasks: Object.fromEntries(
          tasks.map((t) => [t, round1(median(list.map((r) => r.median.tasks[t] ?? 0)))]),
        ),
        draftingReliability: median(list.map((r) => r.median.draftingReliability)),
      },
      range: {
        overall: [
          Math.min(...list.map((r) => r.range.overall[0])),
          Math.max(...list.map((r) => r.range.overall[1])),
        ],
      },
      unstable:
        list.some((r) => r.unstable) || Math.max(...overall) - Math.min(...overall) > unstableRange,
      hardware,
      fitsBudgetGb: fitsBudgetGb(latest.model),
      backedBy: list.map((r) => ({ hardware: r.hardware, startedAt: r.startedAt })),
    }
  })
}

/** The floor a recommended model must pass (FR-20). */
export function passesFloor(entry, thresholds) {
  const taskScores = Object.values(entry.median.tasks)
  return (
    taskScores.length > 0 &&
    taskScores.every((s) => s >= thresholds.floorTaskScore) &&
    entry.median.draftingReliability >= thresholds.floorDraftingReliability &&
    !entry.unstable
  )
}

export const tierLabel = (t) =>
  t.max === Infinity || t.max == null
    ? `${t.min} GB and up`
    : t.min === 0
      ? `under ${t.max} GB`
      : `${t.min}–${t.max} GB`

export const tierBudget = (t) => (t.min > 0 ? t.min : LOWEST_TIER_BUDGET_GB)

/** The best model per tier that fits the tier's smallest machine and passes the floor. */
export function recommend(entries, tiers, thresholds) {
  return tiers.map((t) => {
    const budget = tierBudget(t)
    const fitting = entries.filter((e) => e.fitsBudgetGb <= budget)
    const passing = fitting
      .filter((e) => passesFloor(e, thresholds))
      .sort((a, b) => b.median.overall - a.median.overall || a.model.ref.localeCompare(b.model.ref))
    const best = passing[0]
    const base = {
      tier: tierLabel(t),
      minBudgetGb: t.min,
      maxBudgetGb: t.max === Infinity ? null : t.max,
    }
    if (!best)
      return {
        ...base,
        model: null,
        reason: fitting.length
          ? `None of the ${fitting.length} benchmarked model(s) that fit ${budget} GB passes the floor (every task at least ${thresholds.floorTaskScore}, drafting reliability at least ${Math.round(thresholds.floorDraftingReliability * 100)}%, stable across repeats).`
          : `No benchmarked model fits ${budget} GB yet.`,
        backedBy: [],
      }
    return {
      ...base,
      model: best.model.ref,
      reason: `Highest median overall score (${best.median.overall}) of the ${passing.length} model(s) that fit ${budget} GB (needs about ${best.fitsBudgetGb} GB) and pass the floor.`,
      backedBy: best.backedBy,
    }
  })
}

/** The report for the current suite and scoring versions; other versions are only counted. */
export function buildReport(runs, { suite, scoringVersion, tiers, now = new Date() }) {
  const current = runs.filter(
    (r) => r.suiteVersion === suite.suiteVersion && r.scoringVersion === scoringVersion,
  )
  const archived = new Map()
  for (const r of runs)
    if (!current.includes(r)) {
      const key = `${r.suiteVersion}:${r.scoringVersion}`
      const a = archived.get(key) ?? {
        suiteVersion: r.suiteVersion,
        scoringVersion: r.scoringVersion,
        runs: 0,
      }
      a.runs++
      archived.set(key, a)
    }
  const entries = mergeRuns(current, suite.thresholds.unstableRange).sort(
    (a, b) => b.median.overall - a.median.overall || a.model.ref.localeCompare(b.model.ref),
  )
  return {
    formatVersion: 1,
    generatedAt: now.toISOString(),
    suite: suite.suite,
    suiteVersion: suite.suiteVersion,
    scoringVersion,
    models: entries.map(({ backedBy: _b, ...e }) => e),
    recommendations: recommend(entries, tiers, suite.thresholds),
    archived: [...archived.values()].sort(
      (a, b) => a.suiteVersion - b.suiteVersion || a.scoringVersion - b.scoringVersion,
    ),
  }
}

/** Markdown-escape a string from a run file for a table cell. */
export const md = (s) =>
  String(s ?? '')
    .replace(/[\\`*_{}[\]()#+!|<>~]/g, (c) => `\\${c}`)
    .replace(/\s+/g, ' ')
    .trim()

const gbOf = (bytes) => (bytes ? `${round1(bytes / 1e9)} GB` : 'unknown')

/** The generated part of docs/benchmarks/README.md: text values only, a header row each. */
export function readmeTables(report) {
  const lines = [
    `Suite **${md(report.suite)}** version ${report.suiteVersion}, scoring version ${report.scoringVersion}. Generated ${report.generatedAt.slice(0, 10)}.`,
    '',
    '### Recommended model per memory size',
    '',
    '| Memory for models | Recommended model | Why |',
    '| --- | --- | --- |',
    ...report.recommendations.map(
      (r) => `| ${md(r.tier)} | ${r.model ? md(r.model) : 'none yet'} | ${md(r.reason)} |`,
    ),
    '',
    '### Models',
    '',
  ]
  if (!report.models.length) lines.push('No runs for this suite version yet.')
  else
    lines.push(
      '| Model | Tool | Quantization | Size | Overall (median, range) | Drafting | Critique | Ideation | Runs | Machines | Stability |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...report.models
        .map((m) =>
          [
            md(m.model.name),
            md(m.model.tool),
            md(m.model.quantization ?? 'unknown'),
            gbOf(m.model.sizeBytes),
            `${m.median.overall} (${m.range.overall[0]}–${m.range.overall[1]})`,
            m.median.tasks.drafting ?? 'n/a',
            m.median.tasks.critique ?? 'n/a',
            m.median.tasks.ideation ?? 'n/a',
            m.runs,
            m.hardware.length,
            m.unstable ? 'unstable' : 'stable',
          ].join(' | '),
        )
        .map((row) => `| ${row} |`),
    )
  if (report.archived.length)
    lines.push(
      '',
      `Archived runs from other suite or scoring versions: ${report.archived.map((a) => `suite v${a.suiteVersion} scoring v${a.scoringVersion} (${a.runs})`).join(', ')}.`,
    )
  return lines.join('\n')
}

export const BEGIN = '<!-- bench:report:begin (generated by pnpm bench:report; do not edit) -->'
export const END = '<!-- bench:report:end -->'

/** Replace the generated block of the README, keeping the hand-written text around it. */
export function spliceReadme(readme, tables) {
  const a = readme.indexOf(BEGIN)
  const b = readme.indexOf(END)
  if (a < 0 || b < a) throw new Error('docs/benchmarks/README.md lacks the generated-table markers')
  return `${readme.slice(0, a + BEGIN.length)}\n\n${tables}\n\n${readme.slice(b)}`
}

/** Validated runs from `dir`; throws naming the first bad file. */
export function loadRuns(dir, BenchRun) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    const bad = findForbidden(raw)
    if (bad.length)
      throw new Error(
        `${f}: paths, hosts or user names are not allowed (${bad.slice(0, 3).join(', ')})`,
      )
    const parsed = BenchRun.safeParse(raw)
    if (!parsed.success)
      throw new Error(`${f}: not a benchmark run file: ${parsed.error.issues[0]?.message}`)
    if (parsed.data.model.tool === 'mock')
      throw new Error(`${f}: mock runs are for the smoke test, not the report`)
    return parsed.data
  })
}

function parseArgs(argv) {
  const args = { suite: 'standard', runs: 'docs/benchmarks/runs', out: 'docs/benchmarks' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    else if (a === '--schema') args.schema = true
    else if (['--suite', '--runs', '--out'].includes(a)) args[a.slice(2)] = argv[++i]
    else throw new Error(`Unknown argument ${a}`)
  }
  return args
}

async function main(argv) {
  const args = parseArgs(argv)
  const app = await importMain('bench-app', 'scripts/lib/bench-app.ts')
  const out = resolve(ROOT, args.out)
  mkdirSync(out, { recursive: true })
  await writeFormatted(
    join(out, 'model-benchmarks.schema.json'),
    JSON.stringify(app.benchReportJsonSchema()),
  )
  if (args.schema) return console.log(`wrote ${join(args.out, 'model-benchmarks.schema.json')}`)
  const suite = loadSuite(args.suite)
  const runs = loadRuns(resolve(ROOT, args.runs), app.BenchRun)
  const tiers = [...app.TEXT_TIERS].sort((a, b) => a.min - b.min)
  const report = app.BenchReport.parse(
    buildReport(runs, { suite, scoringVersion: SCORING_VERSION, tiers }),
  )
  await writeFormatted(join(out, 'model-benchmarks.json'), JSON.stringify(report))
  const readmePath = join(out, 'README.md')
  await writeFormatted(
    readmePath,
    spliceReadme(readFileSync(readmePath, 'utf8'), readmeTables(report)),
  )
  console.log(
    `${runs.length} run file(s), ${report.models.length} model(s) in the report; wrote ${args.out}/model-benchmarks.json and README.md`,
  )
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`bench:report: ${err?.message ?? err}`)
    process.exit(1)
  })
}
