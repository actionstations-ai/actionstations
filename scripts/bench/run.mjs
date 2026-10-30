#!/usr/bin/env node
// Benchmark local models on Action Stations tasks (#434, docs/specs/0434-local-model-benchmark.md,
// docs/guides/model-benchmark.md). Drives the built app headless with a throwaway user-data
// folder through its existing IPC, runs the suite's ideation, drafting and critique cases
// against each model, scores them deterministically and writes one run file per model.
//
//   pnpm build:app
//   pnpm bench -- --models ollama:qwen3.5:9b[,lmstudio:<id>…] [--suite quick|standard]
//                 [--repeats N] [--out <dir>] [--base-url <url>] [--embedder local|hash]
//                 [--yes] [--resume] [--clean] [--judge lmstudio:<model>] [--determinism]
//
// Local endpoints only (127.0.0.1); there is no flag to allow a remote one.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { freshUserData, launchApp, waitForJob } from '../lib/app-driver.mjs'
import { importMain } from '../lib/bundle-main.mjs'
import { assertNoPromptOverrides, RUNNERS } from './cases.mjs'
import { determinismOf } from './determinism.mjs'
import {
  loadCalibration,
  loadJudgePrompt,
  localJudgeCall,
  parseJudgeRef,
  runJudge,
} from './judge.mjs'
import { corpusHash, loadExample, loadSuite, ROOT, runFileName, slug } from './corpus.mjs'
import { modelInfo, parseModelRef, providerConfig } from './model-info.mjs'
import {
  aggregateTask,
  overallScore,
  SCORING_VERSION,
  summarizeRepeats,
} from './score/composite.mjs'
import { median } from './score/util.mjs'
import { writeFormatted } from './write.mjs'

export const LOCAL_EMBEDDER = 'Xenova/bge-small-en-v1.5'
export const TASKS = ['ideation', 'drafting', 'critique']
const MODELS_CACHE = join(ROOT, '.cache', 'bench', 'models')
/** The app's budget unit (src/main/setup/models.ts); RAM and VRAM are shown in GiB as sold. */
const GB = 1e9
const GIB = 2 ** 30

const log = (msg) => console.log(`[bench ${new Date().toISOString().slice(11, 19)}] ${msg}`)

export function parseArgs(argv) {
  const args = { suite: 'quick', out: '.tmp/bench', embedder: 'local', models: [] }
  const value = (i) => {
    if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`)
    return argv[i + 1]
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    else if (a === '--models')
      args.models = value(i++)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (a === '--suite') args.suite = value(i++)
    else if (a === '--repeats') args.repeats = Number(value(i++))
    else if (a === '--out') args.out = value(i++)
    else if (a === '--base-url') args.baseUrl = value(i++)
    else if (a === '--embedder') args.embedder = value(i++)
    else if (a === '--judge') args.judge = value(i++)
    else if (a === '--determinism') args.determinism = true
    else if (a === '--yes') args.yes = true
    else if (a === '--resume') args.resume = true
    else if (a === '--clean') args.clean = true
    else throw new Error(`Unknown argument ${a}`)
  }
  if (!args.models.length) throw new Error('--models is required (e.g. --models ollama:qwen3.5:9b)')
  if (args.judge) parseJudgeRef(args.judge, args.baseUrl)
  if (args.determinism && args.repeats !== undefined)
    throw new Error('--determinism runs two repeats at one seed; leave out --repeats')
  if (!['local', 'hash'].includes(args.embedder)) throw new Error('--embedder is local or hash')
  if (
    args.repeats !== undefined &&
    !(Number.isInteger(args.repeats) && args.repeats >= 1 && args.repeats <= 3)
  )
    throw new Error('--repeats is 1, 2 or 3 (one per fixed seed)')
  return args
}

// ---- environment ------------------------------------------------------------------------------

function appCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'unknown'
  }
}

/** Coarse hardware for the run file: no hostname, username or path (NFR-2). */
export async function benchHardware(app) {
  const h = app.hardwareView(await app.readHardware())
  const gib = (n) => Math.round(n / GIB)
  return {
    platform: h.platform,
    arch: h.arch,
    appleSilicon: h.appleSilicon,
    ramGb: gib(h.ramBytes),
    ...(h.vramBytes ? { vramGb: gib(h.vramBytes) } : {}),
    ...(h.gpuName ? { gpuName: h.gpuName.slice(0, 100) } : {}),
    budgetGb: Math.round(h.budgetBytes / GB),
  }
}

const localModelCached = () => existsSync(join(MODELS_CACHE, LOCAL_EMBEDDER, 'config.json'))

async function confirmEmbedderDownload(args) {
  if (args.embedder !== 'local' || localModelCached() || args.yes) return
  const question =
    `The local embedder (${LOCAL_EMBEDDER}, about 130 MB) is downloaded once from Hugging Face ` +
    'into .cache/bench/models. Continue? [y/N] '
  if (!process.stdin.isTTY)
    throw new Error(
      'The local embedder must be downloaded once: pass --yes, or --embedder hash for a fully offline run',
    )
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  if (!/^y(es)?$/i.test(answer.trim()))
    throw new Error('Cancelled: use --embedder hash to run without it')
}

/** The app's models folder points at the shared cache, so the embedder downloads only once. */
function linkModelsCache(userData) {
  mkdirSync(MODELS_CACHE, { recursive: true })
  symlinkSync(
    MODELS_CACHE,
    join(userData, 'models'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
}

async function setEmbedder(invoke, embedder) {
  if (embedder === 'hash') {
    await invoke('settings:update', { embeddings: { mode: 'hash' } })
    return 'hash'
  }
  await invoke('settings:update', { embeddings: { mode: 'local-onnx', model: LOCAL_EMBEDDER } })
  const status = await invoke('embeddings:status')
  if (!status.downloaded) {
    log(`downloading ${LOCAL_EMBEDDER}`)
    const { jobId } = await invoke('embeddings:download-model')
    await waitForJob(invoke, jobId, 'embedder download', 30 * 60_000, { log })
  }
  return `local-onnx:${LOCAL_EMBEDDER}`
}

// ---- state (--resume) -------------------------------------------------------------------------

const statePath = (out) => join(out, 'state.json')

function readState(out, resume, suite) {
  const file = statePath(out)
  if (!resume || !existsSync(file))
    return { suite: suite.suite, suiteVersion: suite.suiteVersion, models: {} }
  const state = JSON.parse(readFileSync(file, 'utf8'))
  if (state.suite !== suite.suite || state.suiteVersion !== suite.suiteVersion)
    throw new Error(`${file} is for another suite; drop --resume or use another --out`)
  return state
}

const saveState = (out, state) => writeFileSync(statePath(out), JSON.stringify(state, null, 2))

// ---- one model --------------------------------------------------------------------------------

async function routeModel(invoke, model, seed, contextLength, providerId) {
  if (model.tool === 'mock') return providerId
  const config = {
    ...providerConfig(model, seed, contextLength),
    ...(providerId ? { id: providerId } : {}),
  }
  const view = await invoke('providers:upsert', { config })
  const ref = { providerId: view.id }
  await invoke('routing:set', {
    scope: 'global',
    routing: { ideate: ref, draft: ref, critique: ref },
  })
  return view.id
}

function makeEstimator(total, done) {
  const started = Date.now()
  let count = 0
  return () => {
    count++
    const left = total - done - count
    if (left <= 0) return
    const perCase = (Date.now() - started) / count
    log(`about ${Math.ceil((perCase * left) / 60_000)} min left (${left} cases)`)
  }
}

/** Every case of one repeat; results land in `mstate.cases` as they finish. */
async function runRepeat(ctx, r, mstate, estimate) {
  for (const task of TASKS)
    for (const c of ctx.suite[task]) {
      const key = `${r}:${task}:${c.id}`
      if (mstate.cases[key]) continue
      log(`repeat ${r + 1}: ${task} ${c.id}`)
      const result = await RUNNERS[task](ctx, c)
      mstate.cases[key] = result
      mstate.projects[r] = ctx.projects
      ctx.save()
      log(`  ${task} ${c.id}: ${result.score.toFixed(1)}`)
      estimate()
    }
}

/** A repeat's task scores and overall from the stored case results. */
export function repeatFromCases(suite, r, cases) {
  const tasks = TASKS.map((task) => {
    const results = suite[task].map((c) => cases[`${r}:${task}:${c.id}`]).filter(Boolean)
    const tokens = results.reduce(
      (t, x) => ({ output: t.output + (x.tokens?.output ?? 0), ms: t.ms + (x.tokens?.ms ?? 0) }),
      { output: 0, ms: 0 },
    )
    return aggregateTask(task, results, {
      wallSeconds: results.reduce((n, x) => n + x.wallSeconds, 0),
      ...(tokens.ms > 0 ? { outputTokensPerSecond: tokens.output / (tokens.ms / 1000) } : {}),
    })
  })
  const drafting = suite.drafting.map((c) => cases[`${r}:drafting:${c.id}`]?.reliability ?? 0)
  return {
    seed: suite.seeds[r],
    tasks,
    overall: overallScore(tasks, suite.weights.overall),
    failures: Object.entries(cases)
      .filter(([k]) => k.startsWith(`${r}:`))
      .flatMap(([, x]) => x.failures ?? []),
    reliability: drafting.length ? median(drafting) : 0,
  }
}

/** Both repeats of a determinism check use the first seed. */
const sameSeed = (suite) => ({ ...suite, seeds: [suite.seeds[0], suite.seeds[0]] })

async function runModel({ args, suite: baseSuite, ref, state, app, gold, appVersion }) {
  const suite = args.determinism ? sameSeed(baseSuite) : baseSuite
  const model = parseModelRef(ref, args.baseUrl)
  const info = await modelInfo(model, suite.contextLength)
  if (info.contextLength && info.contextLength < suite.contextLength)
    log(
      `warning: ${model.ref} is loaded with a ${info.contextLength}-token context; the suite runs at ` +
        `${suite.contextLength}. Reload it with --context-length ${suite.contextLength} (lms load) ` +
        'or long stages will fail and count against it.',
    )
  const repeats = args.determinism ? 2 : (args.repeats ?? suite.repeats)
  const mstate = (state.models[model.ref] ??= {
    startedAt: new Date().toISOString(),
    cases: {},
    projects: {},
  })
  const userData = freshUserData('ttx-bench-')
  assertNoPromptOverrides(join(userData, 'prompts'), 'the user-data folder')
  linkModelsCache(userData)
  const env = model.tool === 'mock' ? { TTX_MOCK_PROVIDERS: '1' } : {}
  const { app: electronApp, invoke } = await launchApp({ userData, env })
  let embedder
  try {
    embedder = await setEmbedder(invoke, args.embedder)
    const total = repeats * TASKS.reduce((n, t) => n + suite[t].length, 0)
    const estimate = makeEstimator(total, Object.keys(mstate.cases).length)
    let providerId
    for (let r = 0; r < repeats; r++) {
      providerId = await routeModel(invoke, model, suite.seeds[r], suite.contextLength, providerId)
      const workDir = join(args.out, 'work', slug(model.ref), `r${r + 1}`)
      const ctx = {
        invoke,
        suite,
        gold,
        log,
        workDir,
        judge: !!args.judge,
        projects: { ...(mstate.projects[r] ?? {}) },
        save: () => saveState(args.out, state),
      }
      await runRepeat(ctx, r, mstate, estimate)
    }
  } finally {
    await electronApp.close()
    rmSync(userData, { recursive: true, force: true })
  }
  const run = buildRun({
    suite,
    model: info,
    embedder,
    mstate,
    repeats,
    hardware: await benchHardware(app),
    appVersion,
  })
  if (args.determinism) run.determinism = determinismOf(run.repeats, suite.seeds[0])
  if (args.judge) run.judge = await judgeRun(args, mstate)
  return run
}

/** FR-17: the optional local judge scores the first repeat's cited MSEL rows. */
async function judgeRun(args, mstate) {
  const model = parseJudgeRef(args.judge, args.baseUrl)
  const items = Object.entries(mstate.cases)
    .filter(([key]) => key.startsWith('0:drafting:'))
    .flatMap(([, c]) => c.judgeRows ?? [])
  log(`judging ${items.length} row(s) with ${model.ref}`)
  return runJudge({
    model: model.ref,
    items,
    calibration: loadCalibration(),
    call: localJudgeCall(model),
    prompt: loadJudgePrompt(),
  })
}

export function buildRun({ suite, model, embedder, mstate, repeats, hardware, appVersion }) {
  const reps = Array.from({ length: repeats }, (_, r) => repeatFromCases(suite, r, mstate.cases))
  const summary = summarizeRepeats(
    reps,
    reps.map((x) => x.reliability),
    suite.thresholds.unstableRange,
  )
  const hashes = Object.assign({}, ...Object.values(mstate.cases).map((x) => x.promptHashes ?? {}))
  const examples = [...new Set(TASKS.flatMap((t) => suite[t].map((c) => c.example)))].sort()
  return {
    formatVersion: 1,
    suite: suite.suite,
    suiteVersion: suite.suiteVersion,
    scoringVersion: SCORING_VERSION,
    appVersion,
    appCommit: appCommit(),
    promptHashes: hashes,
    corpusHashes: Object.fromEntries(examples.map((e) => [e, corpusHash(loadExample(e))])),
    embedder,
    model,
    hardware,
    startedAt: mstate.startedAt,
    repeats: reps.map(({ reliability: _r, ...rest }) => rest),
    ...summary,
  }
}

export function summaryMarkdown(run) {
  const lines = [
    `### ${run.model.ref} (${run.suite} v${run.suiteVersion}, ${run.repeats.length} repeat(s))`,
    '',
    '| Task | Median | Wall time (s) |',
    '|---|---|---|',
    ...TASKS.map((t) => {
      const wall = run.repeats.reduce(
        (n, r) => n + (r.tasks.find((x) => x.task === t)?.wallSeconds ?? 0),
        0,
      )
      return `| ${t} | ${run.median.tasks[t] ?? 0} | ${wall} |`
    }),
    `| **overall** | **${run.median.overall}** | |`,
    '',
    `Range ${run.range.overall[0]}–${run.range.overall[1]}${run.unstable ? ' (unstable)' : ''}; ` +
      `drafting reliability ${Math.round(run.median.draftingReliability * 100)}%; ` +
      `${run.repeats.reduce((n, r) => n + r.failures.length, 0)} failed stage(s).`,
    ...(run.determinism
      ? [
          '',
          run.determinism.identical
            ? `Determinism: both repeats at seed ${run.determinism.seed} scored the same.`
            : `Determinism: repeats at seed ${run.determinism.seed} differ in ${run.determinism.differing.join(', ')}.`,
        ]
      : []),
    ...(run.judge
      ? [
          '',
          `Judge ${run.judge.model}: plausibility ${run.judge.scores.plausibility} over ${run.judge.scores.rowsJudged} row(s); ` +
            (run.judge.published
              ? `agreement ${run.judge.kappa} with ${run.judge.calibrationRows} human-scored rows (publishable).`
              : `not publishable (agreement ${run.judge.kappa ?? 'unknown'}, ${run.judge.calibrationRows} calibration rows). Not part of the overall score.`),
        ]
      : []),
  ]
  return lines.join('\n')
}

async function main(argv) {
  const args = parseArgs(argv)
  args.out = resolve(args.out)
  const suite = loadSuite(args.suite)
  for (const ref of args.models) parseModelRef(ref, args.baseUrl) // refuse remote endpoints first
  await confirmEmbedderDownload(args)
  mkdirSync(args.out, { recursive: true })
  const app = await importMain('bench-app', 'scripts/lib/bench-app.ts')
  const state = readState(args.out, args.resume, suite)
  const gold = JSON.parse(readFileSync(join(ROOT, 'bench', 'gold', 'scenario-3.json'), 'utf8'))
  const appVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  for (const ref of args.models) {
    const run = app.BenchRun.parse(
      await runModel({ args, suite, ref, state, app, gold, appVersion }),
    )
    const file = join(args.out, runFileName(run.startedAt, run.model.ref, run.hardware))
    await writeFormatted(file, JSON.stringify(run))
    console.log(`\n${summaryMarkdown(run)}\n\nWrote ${file}`)
    delete state.models[run.model.ref]
    saveState(args.out, state)
  }
  if (args.clean) rmSync(join(args.out, 'work'), { recursive: true, force: true })
  console.log(
    'To publish a run, copy its file to docs/benchmarks/runs/ and open a pull request (docs/guides/model-benchmark.md).',
  )
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`bench: ${err?.message ?? err}`)
    process.exit(1)
  })
}
