// One stage call: retrieval plan → prompt render → provider call with a JSON schema →
// zod validation → one repair round (errors + bad output sent back) → typed output plus a
// StageRun record for provenance.
import { z } from 'zod'
import {
  CitationKey,
  OverviewOutput,
  STAGE_OUTPUT_SCHEMAS,
  type PromptFile,
  type Stage,
  type StageRun,
  type StageOutputSchemaName,
} from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { AppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { extractJson, jsonSpec } from '../providers/json'
import type { ChatMessage, ChatRequest, ChatResponse, TextProvider } from '../providers/types'
import type { PipelineDeps, SearchIndex } from './deps'
import {
  doctrineBlock,
  renderQueries,
  retrieveForStage,
  retrievedVars,
  type RetrievedChunk,
} from './retrieval'
import { asTask } from './task-errors'

export interface StageCall {
  stage: Stage
  itemId?: string
  /** Prompt file stem; defaults to the stage name. */
  promptName?: string
  projectPath: string
  vars: Record<string, unknown>
  ctx: JobContext
  deps: PipelineDeps
  index: SearchIndex
  /** At most this many retrieved sections go into the prompt (a smaller request, #347). */
  maxRetrieved?: number
}

export interface StageResult<T> {
  output: T
  retrieved: RetrievedChunk[]
  run: StageRun
  prompt: PromptFile
}

const REPAIR_ROUNDS = 1

/** Carries the failed StageRun so the engine can persist it before surfacing the error. */
export class StageFailure extends AppError {
  /** `noJson`: the last reply carried no JSON at all (often a context window too small). */
  constructor(
    readonly run: StageRun,
    readonly noJson = false,
  ) {
    super(
      'VALIDATION',
      `Stage ${run.stage}${run.itemId ? ` (${run.itemId})` : ''} failed: ${run.error}`,
    )
    this.name = 'StageFailure'
  }
}

function schemaFor(prompt: PromptFile): { name: StageOutputSchemaName; schema: z.ZodType } {
  const name = prompt.frontmatter.outputSchema
  if (!name || !(name in STAGE_OUTPUT_SCHEMAS)) {
    throw new AppError(
      'VALIDATION',
      `Prompt "${prompt.name}" has no valid outputSchema (${name ?? 'missing'})`,
    )
  }
  const key = name as StageOutputSchemaName
  return { name: key, schema: STAGE_OUTPUT_SCHEMAS[key] }
}

/**
 * Schemas that require at least one citation key cannot be satisfied when nothing was
 * retrieved (the prompt also says never to invent keys). With no keys, accept an empty list.
 */
const WITHOUT_CITATIONS: Partial<Record<StageOutputSchemaName, z.ZodType>> = {
  OverviewOutput: OverviewOutput.extend({
    coreSectionsTested: z.array(z.object({ citation: CitationKey, why: z.string() })),
  }),
}

function schemaWhen(
  base: { name: StageOutputSchemaName; schema: z.ZodType },
  retrieved: RetrievedChunk[],
): { name: StageOutputSchemaName; schema: z.ZodType } {
  const relaxed = retrieved.length ? undefined : WITHOUT_CITATIONS[base.name]
  return relaxed ? { name: base.name, schema: relaxed } : base
}

function formatIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 25)
    .map((i) => `- ${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('\n')
}

type Parsed =
  { ok: true; data: unknown } | { ok: false; issues: string; raw: string; noJson?: boolean }

export const NO_JSON = 'no JSON object found in the reply'

/**
 * Why a reply carried no JSON, when the response says: an empty reply or one cut off at the
 * length limit usually means the prompt filled the model's context window (#347).
 */
function noJsonReason(res: ChatResponse): string {
  const tokens = res.usage.inputTokens ? ` after ${res.usage.inputTokens} prompt tokens` : ''
  if (res.finishReason === 'length')
    return `${NO_JSON} (the reply was cut off at the length limit${tokens})`
  if (!res.text.trim()) return `${NO_JSON} (the model returned an empty reply${tokens})`
  return NO_JSON
}

function parseOutput(res: ChatResponse, schema: z.ZodType): Parsed {
  const candidate = res.json !== undefined ? res.json : extractJson(res.text)
  if (candidate === undefined) {
    return { ok: false, issues: `- (root): ${noJsonReason(res)}`, raw: res.text, noJson: true }
  }
  const parsed = schema.safeParse(candidate)
  if (parsed.success) return { ok: true, data: parsed.data }
  return { ok: false, issues: formatIssues(parsed.error), raw: JSON.stringify(candidate) }
}

const repairMessage = (issues: string): string =>
  `Your previous reply did not match the required JSON schema:\n${issues}\n\n` +
  'Return the complete corrected JSON object only, with every required field, no commentary.'

interface Conversation {
  provider: TextProvider
  base: Omit<ChatRequest, 'messages'>
  messages: ChatMessage[]
  onToken: (text: string) => void
}

function newRun(
  call: StageCall,
  prompt: PromptFile,
  hash: string,
  model: string,
  providerId: string,
): StageRun {
  return {
    stage: call.stage,
    ...(call.itemId ? { itemId: call.itemId } : {}),
    startedAt: nowIso(),
    providerRef: { providerId, model },
    model,
    promptRef: `${prompt.name}@${prompt.source}`,
    promptHash: hash,
    status: 'running',
    repairAttempts: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  }
}

function account(run: StageRun, res: ChatResponse): void {
  run.inputTokens = (run.inputTokens ?? 0) + res.usage.inputTokens
  run.outputTokens = (run.outputTokens ?? 0) + res.usage.outputTokens
  run.costUsd = (run.costUsd ?? 0) + (res.costUsd ?? 0)
  if (res.model) run.model = res.model
}

/** Call the model, validate, and on failure send the errors back once. */
async function callWithRepair(
  conv: Conversation,
  schema: z.ZodType,
  run: StageRun,
  call: StageCall,
): Promise<Parsed> {
  const { ctx, stage, itemId } = call
  const extra = { stage, ...(itemId ? { itemId } : {}) }
  const chat = (): Promise<ChatResponse> =>
    conv.provider.chat({ ...conv.base, messages: conv.messages }, conv.onToken)
  let res = await chat()
  account(run, res)
  let parsed = parseOutput(res, schema)
  for (let round = 0; !parsed.ok && round < REPAIR_ROUNDS; round++) {
    ctx.throwIfCancelled()
    ctx.log(
      `${stage}: output failed validation, asking for a repair\n${parsed.issues}`,
      'warn',
      extra,
    )
    run.repairAttempts += 1
    conv.messages.push(
      { role: 'assistant', content: parsed.raw },
      { role: 'user', content: repairMessage(parsed.issues) },
    )
    ctx.token(stage, '\n\n[repair round]\n', itemId)
    res = await chat()
    account(run, res)
    parsed = parseOutput(res, schema)
  }
  return parsed
}

/** Run one stage end to end. Throws StageFailure when the repair round also fails. */
export async function runStage<T>(call: StageCall): Promise<StageResult<T>> {
  const { stage, itemId, ctx, deps, projectPath } = call
  const prompt = await deps.loadPrompt(call.promptName ?? stage, projectPath)
  const fm = prompt.frontmatter
  const queries = renderQueries(fm.retrieval.queries, call.vars)
  const retrieved = await asTask('embed', () =>
    retrieveForStage(call.index, queries, fm.retrieval.k, ctx.signal),
  )
  if (call.maxRetrieved !== undefined) retrieved.splice(call.maxRetrieved)
  const { name, schema } = schemaWhen(schemaFor(prompt), retrieved)
  const rendered = deps.renderPrompt(prompt, {
    ...call.vars,
    retrieved: retrievedVars(retrieved),
    doctrine: doctrineBlock(retrieved),
    citationKeys: retrieved.map((r) => r.key),
  })
  const { provider, model, providerId } = await asTask(fm.task, () =>
    deps.resolveTextProvider(fm.task, projectPath),
  )
  const run = newRun(call, prompt, rendered.hash, model, providerId)
  const extra = { stage, ...(itemId ? { itemId } : {}) }
  ctx.log(`${stage}: ${retrieved.length} sections retrieved; ${providerId}/${model}`, 'info', extra)
  const conv: Conversation = {
    provider,
    base: {
      model,
      system: rendered.system,
      ...(rendered.cacheableContext ? { cacheableContext: rendered.cacheableContext } : {}),
      ...(fm.modelHints.temperature !== undefined
        ? { temperature: fm.modelHints.temperature }
        : {}),
      ...(fm.modelHints.maxTokens !== undefined ? { maxTokens: fm.modelHints.maxTokens } : {}),
      json: jsonSpec(name, schema),
      signal: ctx.signal,
    },
    messages: [{ role: 'user', content: rendered.user }],
    onToken: (text) => ctx.token(stage, text, itemId),
  }
  const parsed = await asTask(fm.task, () => callWithRepair(conv, schema, run, call), providerId)
  run.finishedAt = nowIso()
  if (!parsed.ok) {
    run.status = 'error'
    run.error = `Output did not match ${name} after ${run.repairAttempts} repair attempt(s):\n${parsed.issues}`
    throw new StageFailure(run, !!parsed.noJson)
  }
  run.status = 'ok'
  return { output: parsed.data as T, retrieved, run, prompt }
}
