// One benchmark case per task, driven through the app's existing IPC (#434, FR-6 to FR-8):
// ideation (generate:ideas), MSEL drafting (generate:scenario up to the critique and revision
// passes, no injects or media) and critique of a scenario with planted defects
// (generate:rerun-stage critique). `ctx` carries invoke, the suite, the gold statistics, the
// work folder and the projects opened so far.
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { waitForJob } from '../lib/app-driver.mjs'
import { applyDefects } from './defects.mjs'
import { caseBrief, loadDefects, loadExample, scenarioIdFor } from './corpus.mjs'
import { critiqueCase, draftingCase, ideationCase } from './score/composite.mjs'
import { critiqueNotes } from './score/critique.mjs'
import { droppedIdeaKeys } from './score/ideation.mjs'
import { lintFindings } from './score/lint.mjs'
import { reliability } from './score/reliability.mjs'

const MINUTE = 60_000
const JOB_TIMEOUT = {
  index: 20 * MINUTE,
  ideas: 60 * MINUTE,
  draft: 240 * MINUTE,
  critique: 60 * MINUTE,
}

const wait = (ctx, jobId, label, timeoutMs) =>
  waitForJob(ctx.invoke, jobId, label, timeoutMs, {
    log: ctx.log,
    allowError: true,
    pollMs: ctx.pollMs ?? 5000,
  })

/** Refuse prompt overrides: a benchmark runs the shipped prompts only (FR-5). */
export function assertNoPromptOverrides(dir, where) {
  if (existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.md')))
    throw new Error(
      `${where} has prompt overrides (${dir}); the benchmark runs the shipped prompts only`,
    )
}

/** The example's project, opened once per repeat (examples:open copies it) and indexed. */
export async function openExample(ctx, exampleId) {
  const known = ctx.projects[exampleId]
  if (known && existsSync(join(known, 'project.json'))) {
    await ctx.invoke('project:open', { path: known })
    return known
  }
  const parentDir = join(ctx.workDir, exampleId)
  mkdirSync(parentDir, { recursive: true })
  const { path } = await ctx.invoke('examples:open', { slug: exampleId, parentDir })
  assertNoPromptOverrides(join(path, 'prompts'), `project ${exampleId}`)
  const { jobId } = await ctx.invoke('index:rebuild', { projectPath: path })
  const job = await wait(ctx, jobId, `index ${exampleId}`, JOB_TIMEOUT.index)
  if (job.status !== 'done') throw new Error(`index ${exampleId} ${job.status}: ${job.error ?? ''}`)
  ctx.projects[exampleId] = path
  return path
}

const clip = (s) => String(s ?? '').slice(0, 500)

/** Output tokens the ideate job logged ("ideate: 6 ideas, 1200 in / 900 out tokens"). */
export function ideateTokens(entries) {
  for (const e of entries) {
    const m = /ideate: \d+ ideas, (\d+) in \/ (\d+) out tokens/.exec(e.message ?? '')
    if (m) return { input: Number(m[1]), output: Number(m[2]) }
  }
  return { input: 0, output: 0 }
}

export async function runIdeation(ctx, c) {
  const projectPath = await openExample(ctx, c.example)
  const t0 = Date.now()
  const { jobId } = await ctx.invoke('generate:ideas', {
    projectPath,
    brief: {},
    count: ctx.suite.ideationCount,
  })
  const job = await wait(ctx, jobId, `ideas ${c.id}`, JOB_TIMEOUT.ideas)
  const { entries } = await ctx.invoke('jobs:log', { jobId })
  const ok = job.status === 'done'
  const ideas = ok ? await ctx.invoke('generate:ideas-result', { projectPath }) : []
  const scored = ideationCase({ ideas, dropped: droppedIdeaKeys(entries), suite: ctx.suite })
  const seconds = (Date.now() - t0) / 1000
  return {
    caseId: c.id,
    ...scored,
    wallSeconds: seconds,
    tokens: { output: ideateTokens(entries).output, ms: seconds * 1000 },
    failures: ok ? [] : [{ caseId: c.id, stage: 'ideate', error: clip(job.error) }],
  }
}

/** Failed stage runs (and a job error no run explains) as run-file failures. */
function stageFailures(caseId, scenario, job) {
  const failed = scenario.provenance
    .filter((r) => r.status === 'error')
    .map((r) => ({
      caseId,
      stage: r.itemId ? `${r.stage}:${r.itemId}` : r.stage,
      error: clip(r.error),
    }))
  if (job.status !== 'done' && !failed.length)
    failed.push({ caseId, stage: 'job', error: clip(job.error ?? job.status) })
  return failed
}

const tokenTotals = (runs) =>
  runs.reduce(
    (t, r) => {
      if (!r.outputTokens || !r.finishedAt) return t
      const ms = Date.parse(r.finishedAt) - Date.parse(r.startedAt)
      return ms > 0 ? { output: t.output + r.outputTokens, ms: t.ms + ms } : t
    },
    { output: 0, ms: 0 },
  )

const promptHashes = (runs) =>
  Object.fromEntries(runs.filter((r) => r.promptHash).map((r) => [r.stage, r.promptHash]))

export async function runDrafting(ctx, c) {
  const projectPath = await openExample(ctx, c.example)
  const brief = caseBrief(loadExample(c.example), c.scenario)
  const t0 = Date.now()
  const { jobId, scenarioId } = await ctx.invoke('generate:scenario', { projectPath, brief })
  const job = await wait(ctx, jobId, `draft ${c.id}`, JOB_TIMEOUT.draft)
  const scenario = await ctx.invoke('scenarios:get', { projectPath, scenarioId })
  const lints = await ctx.invoke('scenarios:lint', { projectPath, scenarioId })
  const scored = draftingCase({ scenario, lints, gold: ctx.gold, suite: ctx.suite })
  return {
    caseId: c.id,
    ...scored,
    reliability: reliability(scenario).successRate,
    wallSeconds: (Date.now() - t0) / 1000,
    tokens: tokenTotals(scenario.provenance),
    largestPrompt: Math.max(0, ...scenario.provenance.map((r) => r.inputTokens ?? 0)),
    promptHashes: promptHashes(scenario.provenance),
    failures: stageFailures(c.id, scenario, job),
  }
}

export async function runCritique(ctx, c) {
  const projectPath = await openExample(ctx, c.example)
  const defects = loadDefects(c.defects)
  const scenarioId = scenarioIdFor(loadExample(c.example), defects.scenario)
  const stored = await ctx.invoke('scenarios:get', { projectPath, scenarioId })
  const { scenario, planted } = applyDefects(stored, defects)
  await ctx.invoke('scenarios:save', {
    projectPath,
    scenario,
    note: `Benchmark ${c.id}: planted defects`,
  })
  const t0 = Date.now()
  const { jobId } = await ctx.invoke('generate:rerun-stage', {
    projectPath,
    scenarioId,
    stage: 'critique',
  })
  const job = await wait(ctx, jobId, `critique ${c.id}`, JOB_TIMEOUT.critique)
  const after = await ctx.invoke('scenarios:get', { projectPath, scenarioId })
  const lints = lintFindings(await ctx.invoke('scenarios:lint', { projectPath, scenarioId }))
  const scored = critiqueCase({
    notes: critiqueNotes(after.warnings),
    planted,
    lints,
    rowCount: scenario.msel.length,
    suite: ctx.suite,
  })
  const runs = after.provenance.filter((r) => r.stage === 'critique')
  return {
    caseId: c.id,
    ...scored,
    wallSeconds: (Date.now() - t0) / 1000,
    tokens: tokenTotals(runs),
    promptHashes: promptHashes(runs),
    failures: stageFailures(c.id, { provenance: runs }, job),
  }
}

export const RUNNERS = { ideation: runIdeation, drafting: runDrafting, critique: runCritique }
