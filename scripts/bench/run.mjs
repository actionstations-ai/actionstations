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
//                 [--concurrency N] [--triage]
//
// Local endpoints only (127.0.0.1); there is no flag to allow a remote one.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { freshUserData, launchApp, waitForJob } from '../lib/app-driver.mjs'
import { importMain } from '../lib/bundle-main.mjs'
import { assertNoPromptOverrides, RUNNERS, runIdeation } from './cases.mjs'
import { determinismOf } from './determinism.mjs'
import {
  loadCalibration,
  loadJudgePrompt,
  localJudgeCall,
  parseJudgeRef,
  runJudge,
} from './judge.mjs'
import { corpusHash, loadExample, loadSuite, ROOT, runFileName, slug } from './corpus.mjs'
import { taskSetHash } from './taskset.mjs'
import { modelInfo, parseModelRef, providerConfig } from './model-info.mjs'
import {
  aggregateTask,
  overallScore,
  SCORING_VERSION,
  summarizeRepeats,
} from './score/composite.mjs'
import { earlyStopReason, floorMisses, runPool, speedFigure, workerCount } from './scheduler.mjs'
import { median } from './score/util.mjs'
import { writeFormatted } from './write.mjs'

export const LOCAL_EMBEDDER = 'Xenova/bge-small-en-v1.5'
export const TASKS = ['ideation', 'drafting', 'critique']
const MODELS_CACHE = join(ROOT, '.cache', 'bench', 'models')
/** The app's budget unit (src/main/setup/models.ts); RAM and VRAM are shown in GiB as sold. */
const GB = 1e9
const GIB = 2 ** 30

export const DEFAULT_CONCURRENCY = 3
const MAX_CONCURRENCY = 8

const log = (msg) => console.log(`[bench ${new Date().toISOString().slice(11, 19)}] ${msg}`)

export function parseArgs(argv) {
  const args = {
    suite: 'quick',
    out: '.tmp/bench',
    embedder: 'local',
    models: [],
    concurrency: DEFAULT_CONCURRENCY,
  }
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
    else if (a === '--concurrency') args.concurrency = Number(value(i++))
    else if (a === '--triage') args.triage = true
    else if (a === '--yes') args.yes = true
    else if (a === '--resume') args.resume = true
    else if (a === '--clean') args.clean = true
    else throw new Error(`Unknown argument ${a}`)
  }
  if (!args.models.length) throw new Error('--models is required (e.g. --models ollama:qwen3.5:9b)')
  if (!(
    Number.isInteger(args.concurrency) &&
    args.concurrency >= 1 &&
    args.concurrency <= MAX_CONCURRENCY
  ))
    throw new Error(`--concurrency is a whole number from 1 to ${MAX_CONCURRENCY}`)
  applyTriage(args, argv)
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

/** `--triage` is the standard suite at one repeat; it conflicts with anything else. */
function applyTriage(args, argv) {
  if (!args.triage) return
  if (argv.includes('--suite') && args.suite !== 'standard')
    throw new Error('--triage runs the standard suite; leave out --suite or use --suite standard')
  if (args.repeats !== undefined && args.repeats !== 1)
    throw new Error('--triage runs one repeat; leave out --repeats')
  if (args.determinism) throw new Error('--triage and --determinism cannot be combined')
  args.suite = 'standard'
  args.repeats = 1
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

/** The speed figure: the single-request pass when there is one, else the cases' own timing. */
function tokensPerSecond(tokens, speed) {
  const figure = speedFigure(speed ?? tokens)
  return figure === undefined ? {} : { outputTokensPerSecond: figure }
}

/** A repeat's task scores and overall from the stored case results. */
export function repeatFromCases(suite, r, cases, speed) {
  const tasks = TASKS.map((task) => {
    const results = suite[task].map((c) => cases[`${r}:${task}:${c.id}`]).filter(Boolean)
    const tokens = results.reduce(
      (t, x) => ({ output: t.output + (x.tokens?.output ?? 0), ms: t.ms + (x.tokens?.ms ?? 0) }),
      { output: 0, ms: 0 },
    )
    return aggregateTask(task, results, {
      wallSeconds: results.reduce((n, x) => n + x.wallSeconds, 0),
      ...tokensPerSecond(tokens, speed),
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

/** One app instance with its own throwaway settings folder, embedder and provider. */
async function startWorker(w, { args, model }) {
  const userData = freshUserData('ttx-bench-')
  assertNoPromptOverrides(join(userData, 'prompts'), 'the user-data folder')
  linkModelsCache(userData)
  const env = model.tool === 'mock' ? { TTX_MOCK_PROVIDERS: '1' } : {}
  const { app: electronApp, invoke } = await launchApp({ userData, env })
  const worker = { w, userData, electronApp, invoke, projects: {} }
  try {
    worker.embedder = await setEmbedder(invoke, args.embedder)
  } catch (err) {
    await stopWorker(worker)
    throw err
  }
  return worker
}

async function stopWorker(worker) {
  await worker.electronApp.close().catch(() => {})
  rmSync(worker.userData, { recursive: true, force: true })
}

/**
 * Cases are independent and each worker is its own app instance with its own project copies, so
 * parallel cases cannot touch each other's projects, job queue or index. Worker 0 starts first
 * because it may download the embedder into the shared cache.
 */
async function startWorkers(count, opts) {
  const workers = [await startWorker(0, opts)]
  try {
    workers.push(
      ...(await Promise.all(Array.from({ length: count - 1 }, (_, i) => startWorker(i + 1, opts)))),
    )
  } catch (err) {
    await Promise.all(workers.map(stopWorker))
    throw err
  }
  return workers
}

/** The stored-projects key: the repeat alone for one worker (as before), else repeat and worker. */
const projectsKey = (r, w, multi) => (multi ? `${r}.${w}` : r)

function caseContext(env, worker, r) {
  const { args, suite, gold, mstate, state, model, multi } = env
  const key = projectsKey(r, worker.w, multi)
  const base = join(args.out, 'work', slug(model.ref), `r${r + 1}`)
  worker.projects[key] ??= { ...(mstate.projects[key] ?? {}) }
  return {
    invoke: worker.invoke,
    suite,
    gold,
    log: multi ? (msg) => log(`[w${worker.w + 1}] ${msg}`) : log,
    workDir: multi ? join(base, `w${worker.w + 1}`) : base,
    judge: !!args.judge,
    projects: worker.projects[key],
    save: () => saveState(args.out, state),
    key,
  }
}

/** Route the worker's provider to the model with the repeat's seed. */
async function routeWorker(env, worker, r) {
  const { suite, model } = env
  worker.providerId = await routeModel(
    worker.invoke,
    model,
    suite.seeds[r],
    suite.contextLength,
    worker.providerId,
  )
}

/** Run one case on a worker with the repeat's seed; the result lands in `mstate.cases`. */
async function runCase(env, worker, { r, task, c }, estimate) {
  await routeWorker(env, worker, r)
  const ctx = caseContext(env, worker, r)
  ctx.log(`repeat ${r + 1}: ${task} ${c.id}`)
  const result = await RUNNERS[task](ctx, c)
  env.mstate.cases[`${r}:${task}:${c.id}`] = result
  env.mstate.projects[ctx.key] = ctx.projects
  ctx.save()
  ctx.log(`  ${task} ${c.id}: ${result.score.toFixed(1)}`)
  estimate()
}

/** Cases of one repeat not yet in the state, longest tasks first so they start early. */
function pendingCases(suite, r, cases) {
  return ['drafting', 'critique', 'ideation'].flatMap((task) =>
    suite[task].filter((c) => !cases[`${r}:${task}:${c.id}`]).map((c) => ({ r, task, c })),
  )
}

/**
 * One request on an idle model: the first ideation case again, unscored, so the speed figure
 * is not slowed by the other cases sharing the model's slots.
 */
async function speedPass(env, worker) {
  const c = env.suite.ideation[0]
  if (!c || env.mstate.speed) return
  await routeWorker(env, worker, 0)
  const ctx = caseContext(env, worker, 0)
  ctx.log('speed pass: one ideation request on its own')
  env.mstate.speed = (await runIdeation(ctx, c)).tokens
  ctx.save()
}

/** Repeats in order, with the early-stop check after repeat 2. Returns the repeats that ran. */
async function runRepeats(env, workers, repeats, estimate) {
  const { suite, mstate, args } = env
  const run = (r) =>
    runPool(pendingCases(suite, r, mstate.cases), workers.length, (item, w) =>
      runCase(env, workers[w], item, estimate),
    )
  for (let r = 0; r < repeats; r++) {
    await run(r)
    if (r !== 1 || args.determinism) continue
    const done = [0, 1].map((i) => repeatFromCases(suite, i, mstate.cases))
    const reason = earlyStopReason(done, repeats, suite.thresholds)
    if (!reason) continue
    log(`stopping after repeat 2: ${reason}`)
    mstate.stoppedEarly = { afterRepeat: 2, reason }
    return 2
  }
  return repeats
}

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
  const pending = Array.from({ length: repeats }, (_, r) =>
    pendingCases(suite, r, mstate.cases),
  ).flat().length
  const count = workerCount(args.concurrency, pending)
  const env = { args, suite, gold, mstate, state, model, multi: count > 1 }
  const total = repeats * TASKS.reduce((n, t) => n + suite[t].length, 0)
  const estimate = makeEstimator(total, Object.keys(mstate.cases).length)
  log(`${count} app instance(s) for ${pending} case(s)`)
  const workers = await startWorkers(count, { args, model })
  let ran
  try {
    ran = mstate.stoppedEarly
      ? mstate.stoppedEarly.afterRepeat
      : await runRepeats(env, workers, repeats, estimate)
    if (count > 1) await speedPass(env, workers[0])
  } finally {
    await Promise.all(workers.map(stopWorker))
  }
  const run = buildRun({
    suite,
    model: info,
    embedder: workers[0].embedder,
    mstate,
    repeats: ran,
    hardware: await benchHardware(app),
    appVersion,
    concurrency: count,
    triage: args.triage,
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

export function buildRun({
  suite,
  model,
  embedder,
  mstate,
  repeats,
  hardware,
  appVersion,
  concurrency,
  triage,
}) {
  const reps = Array.from({ length: repeats }, (_, r) =>
    repeatFromCases(suite, r, mstate.cases, mstate.speed),
  )
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
    taskSetHash: taskSetHash(suite.suite),
    corpusHashes: Object.fromEntries(examples.map((e) => [e, corpusHash(loadExample(e))])),
    embedder,
    model,
    hardware,
    startedAt: mstate.startedAt,
    ...(concurrency > 1 ? { concurrency } : {}),
    ...(triage ? { triage: true } : {}),
    ...(mstate.stoppedEarly ? { stoppedEarly: mstate.stoppedEarly } : {}),
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
    ...(run.stoppedEarly ? ['', `Stopped early: ${run.stoppedEarly.reason}.`] : []),
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

/** The triage verdict: pass or miss against the suite's floor (a published run needs 3 repeats). */
export function triageLine(run, thresholds) {
  const tasks = Object.entries(run.median.tasks).map(([task, score]) => ({ task, score }))
  const misses = floorMisses(tasks, run.median.draftingReliability, thresholds)
  return misses.length
    ? `Triage: misses the floor (${misses.join('; ')}).`
    : 'Triage: passes the floor. Run the standard suite with 3 repeats to publish.'
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
    console.log(
      `\n${summaryMarkdown(run)}${run.triage ? `\n\n${triageLine(run, suite.thresholds)}` : ''}\n\nWrote ${file}`,
    )
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
