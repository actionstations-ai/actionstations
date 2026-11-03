// The Mini's model calls (#604): each probe re-runs one pipeline stage of a bundled example's
// hand-corrected scenario through the app's own IPC (generate:rerun-stage), so the upstream
// inputs (phase plan, roles, MSEL, corpus) are identical for every model. A call that outlives
// the suite's per-call cap is cancelled and recorded as a failure. Scoring is score.mjs.
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
  scoreReview,
  speedOf,
} from './score.mjs'

const MINUTE = 60_000
/** Each probe works on its own project copy so one model's output never feeds another call. */
const TAGS = { format: 'format', longOutput: 'long-output' }

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

/** Wait for a job up to the cap; on timeout cancel it. Returns { job, capped }. */
export async function waitCapped(ctx, jobId, label, capSeconds) {
  const opts = { log: ctx.log, allowError: true, pollMs: ctx.pollMs ?? 2000 }
  try {
    return {
      job: await waitForJob(ctx.invoke, jobId, label, capSeconds * 1000, opts),
      capped: false,
    }
  } catch (err) {
    if (!/timed out/.test(String(err?.message))) throw err
    await ctx.invoke('jobs:cancel', { jobId }).catch(() => {})
    const job = await waitForJob(ctx.invoke, jobId, `${label} (cancelling)`, 60_000, opts).catch(
      () => ({ status: 'cancelled' }),
    )
    return { job, capped: true }
  }
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
  const { job, capped } = await waitCapped(ctx, jobId, label, ctx.capSeconds)
  const seconds = (Date.now() - t0) / 1000
  const scenario = await ctx.invoke('scenarios:get', { projectPath, scenarioId })
  if (job.status !== 'done' || capped)
    return { obs: { ok: false, seconds, capped, error: job.error ?? job.status }, scenario }
  const seen = runObservation(scenario, stage, itemId)
  return { obs: { ...seen, ok: seen.ok, seconds, capped: false }, scenario }
}

const withNote = (probe, obs) => ({
  ...probe,
  seconds: Math.round(obs.seconds * 10) / 10,
  ...(obs.inputTokens ? { inputTokens: obs.inputTokens } : {}),
  ...(obs.outputTokens ? { outputTokens: obs.outputTokens } : {}),
})

async function probeFormat(ctx, spec) {
  const example = loadExample(spec.example)
  const projectPath = await openProject(ctx, spec.example, TAGS.format)
  const scenarioId = scenarioIdFor(example, spec.scenario)
  const { obs } = await rerunCall(ctx, { projectPath, scenarioId, stage: spec.stage })
  return { obs, probe: withNote(scoreFormat(obs), obs) }
}

async function probeLongOutput(ctx, spec) {
  const example = loadExample(spec.example)
  const projectPath = await openProject(ctx, spec.example, TAGS.longOutput)
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

async function probeLongContext(ctx, spec) {
  const example = loadExample(spec.example)
  const projectPath = await openProject(ctx, spec.example, 'long-context')
  const scenarioId = scenarioIdFor(example, spec.scenario)
  const stored = await ctx.invoke('scenarios:get', { projectPath, scenarioId })
  const phase = stored.phases.find((p) => p.index === spec.phaseIndex)
  if (!phase) throw new Error(`${spec.example}: no phase ${spec.phaseIndex}`)
  const { obs, scenario } = await rerunCall(ctx, {
    projectPath,
    scenarioId,
    stage: spec.stage,
    itemId: phase.id,
  })
  let after = scenario
  let grounding
  if (obs.ok) {
    after = {
      ...scenario,
      warnings: await ctx.invoke('scenarios:lint', { projectPath, scenarioId }),
    }
    grounding = await ctx
      .invoke('grounding:scenario', { projectPath, scenarioId })
      .catch(() => undefined)
  }
  const probe = obs.ok
    ? scoreLongContext({
        obs,
        scenario: after,
        phaseId: phase.id,
        grounding,
        suite: ctx.suite,
        gold: ctx.gold,
      })
    : scoreLongContext({ obs })
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

/**
 * Every probe in order, cheapest first. A probe that throws (not a model failure: a missing
 * example, an app error) stops the run. Returns the scored probes, the timing and the calls.
 */
export async function runProbes(ctx, { heldOut = false, heldOutCase } = {}) {
  const spec = ctx.suite.probes
  const calls = []
  const probes = {}
  const take = async (key, run) => {
    ctx.log(`probe ${key}`)
    const { obs, probe } = await run()
    probes[key] = probe
    calls.push({ key, ...obs })
    ctx.log(`  ${key}: ${probe.ok ? Math.round(probe.score) : `failed (${probe.reason})`}`)
  }
  await take('format', () => probeFormat(ctx, spec.format))
  await take('longContext', () => probeLongContext(ctx, spec.longContext))
  await take('longOutput', () => probeLongOutput(ctx, spec.longOutput))
  await take('review', () => probeReview(ctx, ctx.suite.critique[0], 'review', 'The review call'))
  if (heldOut && heldOutCase)
    await take('heldOutReview', () =>
      probeReview(ctx, heldOutCase, 'held-out', 'The held-out review call'),
    )
  const longPrompt = calls.find((c) => c.key === 'longContext' && c.ok)
  const promptHashes = Object.fromEntries(
    calls.filter((c) => c.promptHash).map((c) => [c.stage ?? c.key, c.promptHash]),
  )
  return { probes, calls, promptHashes, speed: speedOf({ calls, longPrompt }) }
}
