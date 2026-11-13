#!/usr/bin/env node
// Tabletop Mini Benchmark runner (#604, #606, docs/specs/0445-tabletop-mini-benchmark.md,
// docs/guides/model-benchmark.md). Four model calls on fixed inputs, each run twice, with no
// time cap on a call (a stalled or looping reply ends it), scored as Quality x Completion with
// review damage and draft time alongside, a band ("Recommended", "Usable with editing", "Not
// recommended") and one run file per model.
//
//   pnpm build:app
//   pnpm bench:mini -- --models lmstudio:qwen/qwen3.5-9b,lmstudio:google/gemma-3-12b
//   pnpm bench -- --suite mini --models ollama:qwen3.5:9b          (same thing)
//
//   --models <a,b,…>   one or more refs; run one after the other
//   --out <dir>        run files and work folder (default .tmp/bench-mini)
//   --held-out         add the maintainers' held-out review probe (needs bench/defects-held-out)
//   --no-load          do not load and unload LM Studio models; they are already loaded
//   --stop-server      run `lms server stop` after the last model
//   --base-url, --embedder local|hash, --yes, --clean   as for pnpm bench
//
// For an LM Studio model the runner loads it at the suite's context length, runs the Mini and
// unloads it, so a list of models is one command. Local endpoints only.
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { importMain } from '../../lib/bundle-main.mjs'
import { corpusHash, loadExample, loadSuite, ROOT, runFileName, slug } from '../corpus.mjs'
import { modelInfo, parseModelRef } from '../model-info.mjs'
import { taskSetHash } from '../taskset.mjs'
import { writeFormatted } from '../write.mjs'
import { runProbes, streamGuardOptions } from './probes.mjs'
import { MINI_SCORING_VERSION, miniResult } from './score.mjs'
import { LEVEL_LABEL, summaryMarkdown, verdictOf } from './verdict.mjs'

const log = (msg) => console.log(`[mini ${new Date().toISOString().slice(11, 19)}] ${msg}`)

export function parseMiniArgs(argv) {
  const args = { suite: 'mini', out: '.tmp/bench-mini', embedder: 'local', models: [], load: true }
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
    else if (a === '--suite') {
      if (value(i++) !== 'mini') throw new Error('the Mini runs only --suite mini')
    } else if (a === '--out') args.out = value(i++)
    else if (a === '--base-url') args.baseUrl = value(i++)
    else if (a === '--embedder') args.embedder = value(i++)
    else if (a === '--held-out') args.heldOut = true
    else if (a === '--no-load') args.load = false
    else if (a === '--stop-server') args.stopServer = true
    else if (a === '--yes') args.yes = true
    else if (a === '--clean') args.clean = true
    else throw new Error(`Unknown argument ${a}`)
  }
  if (!args.models.length) throw new Error('--models is required (e.g. --models ollama:qwen3.5:9b)')
  if (!['local', 'hash'].includes(args.embedder)) throw new Error('--embedder is local or hash')
  return args
}

// ---- LM Studio: one load per model --------------------------------------------------------------

const lmsBinary = (env = process.env) => env.LMS_BIN || join(homedir(), '.lmstudio', 'bin', 'lms')

/** The `lms` argument lists for a model: load at the suite's context, then unload. */
export function lmsCommands(model, contextLength) {
  return {
    load: ['load', model.name, '--context-length', String(contextLength), '-y'],
    unload: ['unload', model.name],
    serverStart: ['server', 'start'],
    serverStop: ['server', 'stop'],
  }
}

const defaultLms = (args) => execFileSync(lmsBinary(), args, { stdio: 'inherit' })

/** Load the model when this run manages LM Studio; returns what to call afterwards. */
export function manageModel(model, contextLength, { load, exec = defaultLms }) {
  if (!load || model.tool !== 'lmstudio') return { done: () => {} }
  const cmd = lmsCommands(model, contextLength)
  log(`loading ${model.name} at ${contextLength} tokens`)
  exec(cmd.load)
  return {
    done: () => {
      log(`unloading ${model.name}`)
      try {
        exec(cmd.unload)
      } catch (err) {
        log(`could not unload ${model.name}: ${err?.message ?? err}`)
      }
    },
  }
}

// ---- one model ---------------------------------------------------------------------------------

/** The run file for a finished model: scores, timing, verdict and what identifies the task set. */
export function buildMiniRun({
  suite,
  model,
  embedder,
  hardware,
  appVersion,
  appCommit,
  startedAt,
  result,
}) {
  const summary = miniResult({ repeats: result.repeats, suite })
  const repeats = result.repeats.map((r) => ({
    seed: r.seed,
    probes: Object.fromEntries(Object.entries(r.probes).map(([k, p]) => [k, probeRecord(p)])),
    ...r.result,
  }))
  const examples = [
    ...new Set([
      ...Object.values(suite.probes).map((p) => p.example),
      ...suite.critique.map((c) => c.example),
    ]),
  ].sort()
  return {
    formatVersion: 1,
    kind: 'mini',
    suite: 'mini',
    suiteVersion: suite.suiteVersion,
    scoringVersion: MINI_SCORING_VERSION,
    appVersion,
    appCommit,
    promptHashes: result.promptHashes ?? {},
    corpusHashes: Object.fromEntries(examples.map((e) => [e, corpusHash(loadExample(e))])),
    taskSetHash: taskSetHash('mini'),
    embedder,
    model,
    hardware,
    startedAt,
    stream: suite.stream,
    repeats,
    result: summary,
    verdict: verdictOf({
      result: summary,
      repeats: result.repeats.map((r) => r.result),
      bands: suite.bands,
    }),
  }
}

const probeRecord = (p) => ({
  ok: p.ok,
  firstTry: p.firstTry,
  score: Math.round(p.score * 10) / 10,
  criteria: p.criteria,
  metrics: p.metrics,
  ...(p.seconds !== undefined ? { seconds: p.seconds } : {}),
  ...(p.inputTokens ? { inputTokens: p.inputTokens } : {}),
  ...(p.outputTokens ? { outputTokens: p.outputTokens } : {}),
  ...(p.reason ? { reason: p.reason } : {}),
  ...(p.failure ? { failure: p.failure } : {}),
})

async function runModel({ args, suite, heldOutCase, ref, bench, app, gold, appVersion }) {
  const { startWorker, stopWorker, routeModel, benchHardware, appCommit } = bench
  const model = parseModelRef(ref, args.baseUrl)
  const managed = manageModel(model, suite.contextLength, args)
  try {
    const info = await modelInfo(model, suite.contextLength)
    const startedAt = new Date().toISOString()
    const worker = await startWorker(0, { args, model })
    try {
      const guard = streamGuardOptions(suite)
      const beforeRepeat = async (_r, seed) => {
        worker.providerId = await routeModel(
          worker.invoke,
          model,
          seed,
          suite.contextLength,
          worker.providerId,
          guard,
        )
      }
      const ctx = {
        invoke: worker.invoke,
        suite,
        gold,
        log,
        beforeRepeat,
        workDir: join(args.out, 'work', slug(model.ref)),
        projects: {},
      }
      mkdirSync(ctx.workDir, { recursive: true })
      const result = await runProbes(ctx, { heldOut: !!args.heldOut, heldOutCase })
      return app.MiniRun.parse(
        buildMiniRun({
          suite,
          model: info,
          embedder: worker.embedder,
          hardware: await benchHardware(app),
          appVersion,
          appCommit: appCommit(),
          startedAt,
          result,
        }),
      )
    } finally {
      await stopWorker(worker)
    }
  } finally {
    managed.done()
  }
}

export async function main(argv) {
  const args = parseMiniArgs(argv)
  args.out = resolve(args.out)
  const suite = loadSuite('mini')
  const heldOutCase = args.heldOut ? loadSuite('mini-held-out').critique[0] : undefined
  for (const ref of args.models) parseModelRef(ref, args.baseUrl) // refuse remote endpoints first
  const bench = await import('../run.mjs')
  await bench.confirmEmbedderDownload(args)
  mkdirSync(args.out, { recursive: true })
  const app = await importMain('bench-app', 'scripts/lib/bench-app.ts')
  const gold = JSON.parse(readFileSync(join(ROOT, 'bench', 'gold', 'scenario-3.json'), 'utf8'))
  const appVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  const summary = []
  for (const ref of args.models) {
    try {
      const run = await runModel({ args, suite, heldOutCase, ref, bench, app, gold, appVersion })
      const file = join(args.out, `mini-${runFileName(run.startedAt, run.model.ref, run.hardware)}`)
      await writeFormatted(file, JSON.stringify(run))
      console.log(`\n${summaryMarkdown(run)}\n\nWrote ${file}\n`)
      summary.push(`${ref}: ${LEVEL_LABEL[run.verdict.level]} (${run.result.score.value})`)
    } catch (err) {
      log(`${ref} stopped: ${err?.message ?? err}`)
      summary.push(`${ref}: no result (${err?.message ?? err})`)
    }
  }
  if (args.stopServer) {
    try {
      defaultLms(['server', 'stop'])
    } catch {
      // The server may not be running.
    }
  }
  if (args.clean) rmSync(join(args.out, 'work'), { recursive: true, force: true })
  if (args.models.length > 1) console.log(`Summary\n${summary.map((s) => `- ${s}`).join('\n')}`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`bench:mini: ${err?.message ?? err}`)
    process.exit(1)
  })
}
