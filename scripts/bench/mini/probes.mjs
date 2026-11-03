// The Mini's model calls (#604, #606): each probe re-runs one pipeline stage of a bundled
// example's hand-corrected scenario through the app's own IPC (generate:rerun-stage), so the
// upstream inputs (phase plan, roles, MSEL, corpus) are identical for every model. There is no
// time cap on a call: the provider adapter streams the reply and ends it only when the model
// stalls or loops (src/main/providers/stream-guard.ts, limits in the suite's `stream`). Every
// probe runs once per repeat (two, each with its own seed and its own project copy).
// Scoring is score.mjs.
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { applyDefects } from '../defects.mjs'
import { assertNoPromptOverrides } from '../cases.mjs'
import { loadDefects, loadExample, scenarioIdFor } from '../corpus.mjs'
import { critiqueCase } from '../score/composite.mjs'
import { critiqueNotes } from '../score/critique.mjs'
import { lintFindings } from '../score/lint.mjs'
import { waitForJob } from '../../lib/app-driver.mjs'
import {
  runObservation,
  scoreFormat,
  scoreLongContext,
  scoreLongOutput,
  scoreRepeat,
  scoreReview,
  stretchPhase,
} from './score.mjs'

const MINUTE = 60_000
/** A job is waited for as long as it runs; only the stream guard ends a call. */
const NO_CAP = 24 * 60 * MINUTE

/** The provider options that switch the stream guard on, from the suite's `stream` block. */
export function streamGuardOptions(suite) {
  const s = suite.stream
  return {
    streamGuard: {
      firstTokenMs: s.firstTokenSeconds * 1000,
      stallMs: s.stallSeconds * 1000,
      loopMinChars: s.loopMinChars,
      loopMinRepeats: s.loopMinRepeats,
    },
  }
}

/** A project copy of an example for one probe (`tag` keeps probes on separate copies), indexed. */
export async function openProject(ctx, exampleId, tag) {
  const known = ctx.projects[tag]
  if (known && existsSync(join(known, 'project.json'))) {
    await ctx.invoke('project:open', { path: known })
    return known
  }
  const parentDir = join(ctx.workDir, tag)
  mkdirSync(parentDir, { recursive: true })
  const { path } = await ctx.invoke('examples:open', { slug: exampleId, parentDir })
  assertNoPromptOverrides(join(path, 'prompts'), `project ${exampleId}`)
  const { jobId } = await ctx.invoke('index:rebuild', { projectPath: path })
  const job = await waitForJob(ctx.invoke, jobId, `index ${tag}`, 20 * MINUTE, {
    log: ctx.log,
    allowError: true,
    pollMs: ctx.pollMs ?? 2000,
  })
  if (job.status !== 'done') throw new Error(`index ${tag} ${job.status}: ${job.error ?? ''}`)
  ctx.projects[tag] = path
  return path
}

/** Re-run one stage and describe the call: wall time, success, tokens, repair rounds, error. */
export async function rerunCall(ctx, { projectPath, scenarioId, stage, itemId }) {
  const t0 = Date.now()
  const { jobId } = await ctx.invoke('generate:rerun-stage', {
    projectPath,
    scenarioId,
    stage,
    ...(itemId ? { itemId } : {}),
  })
  const label = itemId ? `${stage} ${itemId}` : stage
  const job = await waitForJob(ctx.invoke, jobId, label, NO_CAP, {
    log: ctx.log,
    allowError: true,
    pollMs: ctx.pollMs ?? 2000,
  })
  const seconds = (Date.now() - t0) / 1000
  const scenario = await ctx.invoke('scenarios:get', { projectPath, scenarioId })
  if (job.status !== 'done')
    return { obs: { ok: false, seconds, error: job.error ?? job.status }, scenario }
  const seen = runObservation(scenario, stage, itemId)
  return { obs: { ...seen, ok: seen.ok, seconds }, scenario }
}

const withNote = (probe, obs) => ({
  ...probe,
  seconds: Math.round(obs.seconds * 10) / 10,
  ...(obs.inputTokens ? { inputTokens: obs.inputTokens } : {}),
  ...(obs.outputTokens ? { outputTokens: obs.outputTokens } : {}),
})

async function probeFormat(ctx, spec, r) {
  const example = loadExample(spec.example)
  const projectPath = await openProject(ctx, spec.example, `format-r${r}`)
  const scenarioId = scenarioIdFor(example, spec.scenario)
  const { obs } = await rerunCall(ctx, { projectPath, scenarioId, stage: spec.stage })
  return { obs, probe: withNote(scoreFormat(obs), obs) }
}

async function probeLongOutput(ctx, spec, r) {
  const example = loadExample(spec.example)
  const projectPath = await openProject(ctx, spec.example, `long-output-r${r}`)
  const scenarioId = scenarioIdFor(example, spec.scenario)
  const { obs, scenario } = await rerunCall(ctx, { projectPath, scenarioId, stage: spec.stage })
  const doc = obs.ok
    ? await ctx.invoke('scenarios:doc-get', { projectPath, scenarioId, kind: 'handbook' })
    : { markdown: '' }
  const probe = scoreLongOutput({
    obs,
    handbookMd: doc.markdown,
    simcellScripts: scenario.simcellScripts?.length,
    suite: ctx.suite,
  })
  return { obs, probe: withNote(probe, obs) }
}

/**
 * The long-prompt probe: the last phase, stretched to `phaseMinutes` so the model must write a
 * full phase of 15 to 20 rows, with every earlier phase's rows in the prompt.
 */
async function probeLongContext(ctx, spec, r) {
  const example = loadExample(spec.example)
  const projectPath = await openProject(ctx, spec.example, `long-context-r${r}`)
  const scenarioId = scenarioIdFor(example, spec.scenario)
  const stored = await ctx.invoke('scenarios:get', { projectPath, scenarioId })
  const phase = stored.phases.find((p) => p.index === spec.phaseIndex)
  if (!phase) throw new Error(`${spec.example}: no phase ${spec.phaseIndex}`)
  if (spec.phaseMinutes)
    await ctx.invoke('scenarios:save', {
      projectPath,
      scenario: stretchPhase(stored, phase.id, spec.phaseMinutes),
      note: `Mini: phase ${phase.index + 1} stretched to ${spec.phaseMinutes} minutes`,
    })
  const { obs, scenario } = await rerunCall(ctx, {
    projectPath,
    scenarioId,
    stage: spec.stage,
    itemId: phase.id,
  })
  if (!obs.ok) return { obs, probe: withNote(scoreLongContext({ obs }), obs) }
  const after = {
    ...scenario,
    warnings: await ctx.invoke('scenarios:lint', { projectPath, scenarioId }),
  }
  const grounding = await ctx
    .invoke('grounding:scenario', { projectPath, scenarioId })
    .catch(() => undefined)
  const probe = scoreLongContext({
    obs,
    scenario: after,
    phaseId: phase.id,
    grounding,
    suite: ctx.suite,
    gold: ctx.gold,
  })
  return { obs, probe: withNote(probe, obs) }
}

/** The review probe: plant the case's defects, run critique, score with the full benchmark's scorer. */
export async function probeReview(ctx, c, tag, what) {
  const projectPath = await openProject(ctx, c.example, tag)
  const defects = loadDefects(c.defects)
  const scenarioId = scenarioIdFor(loadExample(c.example), defects.scenario)
  const stored = await ctx.invoke('scenarios:get', { projectPath, scenarioId })
  const { scenario, planted } = applyDefects(stored, defects)
  await ctx.invoke('scenarios:save', {
    projectPath,
    scenario,
    note: `Benchmark ${c.id}: planted defects`,
  })
  const { obs, scenario: after } = await rerunCall(ctx, {
    projectPath,
    scenarioId,
    stage: 'critique',
  })
  if (!obs.ok) return { obs, probe: withNote(scoreReview({ obs, what }), obs) }
  const lints = lintFindings(await ctx.invoke('scenarios:lint', { projectPath, scenarioId }))
  const critique = critiqueCase({
    notes: critiqueNotes(after.warnings),
    planted,
    lints,
    rowCount: scenario.msel.length,
    suite: ctx.suite,
    before: scenario.msel,
    after: after.msel,
  })
  return { obs, probe: withNote(scoreReview({ obs, critique, what }), obs) }
}

/** One repeat: every probe in order, cheapest first. */
async function runRepeat(ctx, r, { heldOut, heldOutCase }) {
  const spec = ctx.suite.probes
  const calls = []
  const probes = {}
  const take = async (key, run) => {
    ctx.log(`repeat ${r + 1}: probe ${key}`)
    const { obs, probe } = await run()
    probes[key] = probe
    calls.push({ key, ...obs })
    ctx.log(`  ${key}: ${probe.ok ? Math.round(probe.score) : `failed (${probe.reason})`}`)
  }
  await take('format', () => probeFormat(ctx, spec.format, r))
  await take('longContext', () => probeLongContext(ctx, spec.longContext, r))
  await take('longOutput', () => probeLongOutput(ctx, spec.longOutput, r))
  await take('review', () =>
    probeReview(ctx, ctx.suite.critique[0], `review-r${r}`, 'The review call'),
  )
  if (heldOut && heldOutCase)
    await take('heldOutReview', () =>
      probeReview(ctx, heldOutCase, `held-out-r${r}`, 'The held-out review call'),
    )
  return { probes, calls }
}

/**
 * Every repeat of every probe. A probe that throws (not a model failure: a missing example, an
 * app error) stops the run. `ctx.beforeRepeat(r, seed)` lets the runner set the repeat's seed.
 * Returns the repeats with their scored probes, calls and per-repeat result, and the prompt hashes.
 */
export async function runProbes(ctx, { heldOut = false, heldOutCase } = {}) {
  const repeats = []
  for (let r = 0; r < ctx.suite.repeats; r++) {
    const seed = ctx.suite.seeds[r]
    await ctx.beforeRepeat?.(r, seed)
    const { probes, calls } = await runRepeat(ctx, r, { heldOut, heldOutCase })
    const result = scoreRepeat({ probes, calls, suite: ctx.suite })
    repeats.push({ seed, probes, calls, result })
  }
  const promptHashes = Object.fromEntries(
    repeats
      .flatMap((x) => x.calls)
      .filter((c) => c.promptHash)
      .map((c) => [c.stage ?? c.key, c.promptHash]),
  )
  return { repeats, promptHashes }
}
