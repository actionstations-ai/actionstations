// The draft-aar job (#419, FR-4): build the exercise record, run the `aar` stage once (twice
// when the first reply carries no JSON: the record is then sent condensed, as the critique
// does), map the output onto aar.json and render documents/aar.md. The model drafts; nothing it
// proposes is confirmed here. The record leaves the project folder only as this prompt, to the
// text provider the project routes drafting to (Project rules 3 and 4).
import { capabilityName, coreCapability } from '@shared/core-capabilities'
import {
  CAPABILITY_ELEMENT_LABELS,
  CAPABILITY_ELEMENTS,
  recordIsEmpty,
  type Aar,
} from '@shared/schemas/aar'
import type { AarOutput } from '@shared/schemas/generation'
import { conductOf, type Scenario } from '@shared/schemas/scenario'
import { citationLabel } from '../generate/docs'
import { domainContext } from '../generate/domain'
import { pipelineDeps, type PipelineDeps, type SearchIndex } from '../generate/deps'
import { stripKeysDeep } from '../generate/mappers'
import { runStage, StageFailure, type StageResult } from '../generate/stage'
import { baseVars } from '../generate/vars'
import type { JobContext } from '../jobs/manager'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { ratingsGuide, recordBlock, recordCounts, type CondenseLevel } from './condense'
import { planSectionLabel } from './markdown'
import {
  AAR_UNSUPPORTED_FINDING,
  applyAar,
  CITATION_DROPPED,
  scenarioCitations,
  type ApplyResult,
} from './mapper'
import { buildExerciseRecord, type BuiltRecord } from './record'
import { readAar, syncAarDocument, writeAar } from './store'

export interface DraftOptions {
  instructions?: string
  sessionId?: string
}

/** Plan sections the condensed retry keeps (the full request retrieves eight). */
const TIGHT_SECTIONS = 3
const STAGE = 'aar' as const

/** The capabilities the exercise set out to test, with their EEG tasks, for the prompt. */
function capabilityVars(s: Scenario) {
  const evaluation = s.evaluation ?? { objectiveCapabilities: [], eegs: [] }
  const ids = [
    ...new Set([
      ...evaluation.objectiveCapabilities.map((p) => p.capability),
      ...evaluation.eegs.map((e) => e.capability),
    ]),
  ]
  return ids.map((id) => {
    const eeg = evaluation.eegs.find((e) => e.capability === id)
    const objectives = evaluation.objectiveCapabilities
      .filter((p) => p.capability === id)
      .map((p) => s.objectives.find((o) => o.id === p.objectiveId))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => o.name || o.text)
    return {
      id,
      name: capabilityName(id),
      definition: coreCapability(id)?.definition ?? '',
      objectives,
      target: eeg?.target ?? '',
      tasks: (eeg?.criticalTasks ?? []).map((t) => ({
        id: t.id,
        task: t.task,
        source: planSectionLabel(t.citation),
        rows: t.rowIds,
      })),
    }
  })
}

/** Distinct EEG section headings, for the retrieval queries. */
function eegSections(s: Scenario): string[] {
  const seen = new Set<string>()
  for (const e of s.evaluation?.eegs ?? [])
    for (const t of e.criticalTasks) {
      const last = t.citation.headingPath.split('›').at(-1)?.trim()
      if (last) seen.add(last)
    }
  return [...seen].slice(0, 6)
}

export interface DraftEnv {
  deps: PipelineDeps
  index: SearchIndex
  built: BuiltRecord
  previous: Aar | null
  opts: DraftOptions
  ctx: JobContext
  root: string
}

async function openDraftEnv(
  root: string,
  scenarioId: string,
  opts: DraftOptions,
  ctx: JobContext,
): Promise<DraftEnv> {
  const deps = await pipelineDeps()
  const [built, index, previous] = await Promise.all([
    buildExerciseRecord(root, scenarioId, opts),
    deps.openIndex(root),
    readAar(root, scenarioId),
  ])
  return { deps, index, built, previous, opts, ctx, root }
}

/** The prompt variables for one attempt; `level` decides how much of the record goes in. */
export async function draftVars(
  env: DraftEnv,
  level: CondenseLevel,
): Promise<Record<string, unknown>> {
  const { scenario, record } = env.built
  const project = await env.deps.loadProject(env.root)
  const domain = domainContext(project, scenario)
  return {
    ...baseVars({
      project,
      scenario,
      domain,
      ...(env.opts.instructions ? { instructions: env.opts.instructions } : {}),
    }),
    capabilities: capabilityVars(scenario),
    eegSections: eegSections(scenario),
    scenarioSections: scenarioCitations(scenario).map((c) => ({
      key: c.key,
      label: citationLabel(c.citation),
    })),
    record: recordBlock(record, scenario, level),
    recordCounts: recordCounts(record),
    ratingsGuide: ratingsGuide(),
    elements: CAPABILITY_ELEMENTS.map((e) => `${e} (${CAPABILITY_ELEMENT_LABELS[e]})`).join(', '),
  }
}

async function callStage(env: DraftEnv, level: CondenseLevel): Promise<StageResult<AarOutput>> {
  const result = await runStage<AarOutput>({
    stage: STAGE,
    promptName: 'aar',
    projectPath: env.root,
    vars: await draftVars(env, level),
    ctx: env.ctx,
    deps: env.deps,
    index: env.index,
    ...(level === 'tight' ? { maxRetrieved: TIGHT_SECTIONS } : {}),
  })
  return { ...result, output: stripKeysDeep(result.output) }
}

/** What a draft that got no JSON twice reports: the record is too long for the context. */
export function aarContextError(detail: string): string {
  return (
    `The draft got no JSON from the model, also with a condensed record (${detail.trim()}). ` +
    'The exercise record is probably too long for the context window the model was loaded ' +
    'with: load it with a larger context (64k tokens holds a 4-hour exercise) or pick a model ' +
    'with a longer context, then draft again.'
  )
}

/** One call; a reply with no JSON is retried once with the condensed record (NFR-1). */
async function callWithCondensedRetry(env: DraftEnv): Promise<StageResult<AarOutput>> {
  try {
    return await callStage(env, 'full')
  } catch (err) {
    if (!(err instanceof StageFailure) || !err.noJson) throw err
    env.ctx.log(
      'aar: the model returned no JSON; retrying with a condensed record (shorter notes, 3 plan sections)',
      'warn',
      { stage: STAGE },
    )
    try {
      const r = await callStage(env, 'tight')
      r.run.inputTokens = (r.run.inputTokens ?? 0) + (err.run.inputTokens ?? 0)
      r.run.outputTokens = (r.run.outputTokens ?? 0) + (err.run.outputTokens ?? 0)
      return r
    } catch (again) {
      if (!(again instanceof StageFailure) || !again.noJson) throw again
      again.run.error = aarContextError(again.run.error?.split('\n').at(-1) ?? '')
      throw new StageFailure(again.run, true)
    }
  }
}

function logMapping(applied: ApplyResult, ctx: JobContext): void {
  const extra = { stage: STAGE }
  for (const u of applied.unsupported)
    ctx.log(
      `${AAR_UNSUPPORTED_FINDING}: "${u.title}" (${capabilityName(u.capability)}) cited no evidence the record has; dropped`,
      'warn',
      extra,
    )
  if (applied.unknownRefs.length)
    ctx.log(
      `aar: evidence refs not in the record, dropped: ${applied.unknownRefs.join(', ')}`,
      'warn',
      extra,
    )
  if (applied.droppedCitations.length)
    ctx.log(
      `${CITATION_DROPPED}: aar cited ${applied.droppedCitations.join(', ')}, which was not among the sections shown; dropped`,
      'warn',
      extra,
    )
  for (const key of applied.unknownRoles)
    ctx.log(
      `aar: proposed owner "${key}" is not a role key; left for a person to set`,
      'warn',
      extra,
    )
  for (const id of applied.unknownCapabilities)
    ctx.log(`aar: "${id}" is not one of the 32 Core Capabilities; dropped`, 'warn', extra)
  if (applied.keptLocked)
    ctx.log(`aar: ${applied.keptLocked} locked item(s) kept from the previous draft`, 'info', extra)
  if (applied.keptRatings)
    ctx.log(
      `aar: ${applied.keptRatings} confirmed rating(s) kept from the previous draft`,
      'info',
      extra,
    )
}

/** Build the Aar from the mapped output and what the previous draft held. */
export function assembleAar(
  applied: ApplyResult,
  out: AarOutput,
  env: Pick<DraftEnv, 'built' | 'previous'>,
  run: Aar['provenance'][number],
  now = nowIso(),
): Aar {
  const { record, scenario } = env.built
  const prev = env.previous
  // Exercise details a planner typed for the HSEEP documents (#420) seed the first draft; a
  // person's later edits to the report win over them.
  const conduct = conductOf(scenario)
  const exerciseDate = prev?.exerciseDate ?? conduct.dates[0]
  const sourcesUsed = (['facilitator', 'evaluation', 'live', 'surveys'] as const).filter(
    (s) => record.sources[s],
  )
  return {
    formatVersion: 1,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    ...(exerciseDate ? { exerciseDate } : {}),
    executiveSummaryMd: out.executiveSummaryMd.trim(),
    sourcesUsed,
    ...(record.liveSessionId ? { liveSessionId: record.liveSessionId } : {}),
    capabilities: applied.capabilities,
    participantFeedbackMd: record.sources.surveys ? (out.participantFeedbackMd ?? '').trim() : '',
    participatingOrganizations:
      prev?.participatingOrganizations ?? conduct.participatingOrganizations,
    acronyms: prev?.acronyms ?? conduct.acronyms,
    provenance: [...(prev?.provenance ?? []), run].slice(-20),
  }
}

/** Draft (or re-draft) the AAR/IP for a scenario. */
export async function draftAar(
  root: string,
  scenarioId: string,
  opts: DraftOptions,
  ctx: JobContext,
): Promise<Aar> {
  ctx.progress(0.05, 'Reading the exercise record', { stage: STAGE })
  const env = await openDraftEnv(root, scenarioId, opts, ctx)
  const { record, scenario } = env.built
  for (const w of record.warnings) ctx.log(`aar: ${w}`, 'warn', { stage: STAGE })
  if (recordIsEmpty(record))
    throw new AppError(
      'VALIDATION',
      'Nothing to draft from yet: add hot wash items, notes or a decision on the Facilitate screen, rate some injects, or run live play, then draft the AAR/IP.',
    )
  const counts = recordCounts(record)
  ctx.log(
    `aar: record has ${counts.notes} note(s), ${counts.hotwash} hot wash item(s), ${counts.decisions} decision(s), ${counts.observations} observation(s), ${counts.votes} vote(s), ${counts.messages} message(s), ${counts.surveys} survey summary(ies)${record.liveSessionId ? `; live session ${record.liveSessionId}` : ''}`,
    'info',
    { stage: STAGE },
  )
  ctx.progress(0.2, 'Drafting the After-Action Report', { stage: STAGE })
  const r = await callWithCondensedRetry(env)
  ctx.throwIfCancelled()
  const applied = applyAar(r.output, {
    scenario,
    record,
    retrieved: r.retrieved,
    scenarioCitations: scenarioCitations(scenario),
    previous: env.previous,
    newId,
  })
  logMapping(applied, ctx)
  const aar = assembleAar(applied, r.output, env, r.run)
  ctx.progress(0.9, 'Writing the draft', { stage: STAGE })
  const saved = await writeAar(root, scenarioId, aar, {
    by: 'ai',
    note: env.previous ? 'Re-drafted from the exercise record' : 'Drafted from the exercise record',
  })
  await syncAarDocument(
    root,
    scenarioId,
    saved,
    'full',
    { by: 'ai', note: 'AAR/IP draft' },
    scenario,
  )
  ctx.progress(1, 'AAR/IP draft ready', { stage: STAGE })
  return saved
}
