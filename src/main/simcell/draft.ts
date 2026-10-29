// Drafting one in-character reply (spec 0429 FR-6, FR-7, FR-10). The persona's view is rendered
// into `simcell_reply`, the routed `roleplay` text provider is called with a JSON schema, one
// repair round follows an invalid reply, and the checks add their flags. The result is a
// queued draft: nothing here sends anything.
import {
  SimcellDraft,
  SimcellDraftOutput,
  type CapabilityLevel,
  type PersonaCard,
  type PersonaChannel,
  type SimcellFlag,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import type { z } from 'zod'
import { renderPrompt, type RenderedPrompt } from '../prompts'
import { extractJson, jsonSpec } from '../providers/json'
import type { ChatMessage, ChatResponse, TextProvider } from '../providers/types'
import { runChecks } from './checks'
import { buildPersonaView, type ContextInput } from './context'
import type { PromptFile } from '@shared/schemas'

export interface DraftEnv {
  provider: TextProvider
  model: string
  providerId: string
  prompt: PromptFile
  /** Names that may appear in a reply besides the persona: roles, organizations, facts. */
  knownNames: readonly string[]
  /** Where the request is from, for the outbound gate. */
  projectPath?: string
  signal?: AbortSignal
}

export interface DraftRequest {
  card: PersonaCard
  context: Omit<ContextInput, 'card'>
  trigger: SimcellDraft['trigger']
  threadId: string
  inReplyTo?: string
  callId?: string
  /** The model's capability level; a limited model's drafts carry a warning. */
  level?: CapabilityLevel
}

const REPAIR =
  'Your previous reply did not match the required JSON schema:\n%ISSUES%\n\n' +
  'Return the complete corrected JSON object only, with every required field, no commentary.'

function parse<T>(
  res: ChatResponse,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; issues: string } {
  const candidate = res.json !== undefined ? res.json : extractJson(res.text)
  if (candidate === undefined)
    return { ok: false, issues: '- (root): no JSON object found in the reply' }
  const parsed = schema.safeParse(candidate)
  if (parsed.success) return { ok: true, data: parsed.data }
  const issues = parsed.error.issues
    .slice(0, 15)
    .map((i) => `- ${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('\n')
  return { ok: false, issues }
}

export interface JsonCall<T> {
  provider: TextProvider
  model: string
  rendered: RenderedPrompt
  name: string
  schema: z.ZodType<T>
  task: 'roleplay' | 'draft'
  stage: 'simcell_reply' | 'simcell_personas'
  projectPath?: string
  signal?: AbortSignal
}

/** One model call with one repair round (ADR-0007). Returns the parsed output and the model name. */
export async function chatJson<T>(call: JsonCall<T>): Promise<{ output: T; model: string }> {
  const fm = call.rendered.frontmatter
  const messages: ChatMessage[] = [{ role: 'user', content: call.rendered.user }]
  let model = call.model
  for (let round = 0; round < 2; round++) {
    const res = await call.provider.chat({
      model: call.model,
      system: call.rendered.system,
      messages,
      json: jsonSpec(call.name, call.schema),
      ...(fm.modelHints.temperature !== undefined
        ? { temperature: fm.modelHints.temperature }
        : {}),
      ...(fm.modelHints.maxTokens !== undefined ? { maxTokens: fm.modelHints.maxTokens } : {}),
      ...(call.signal ? { signal: call.signal } : {}),
      outbound: {
        ...(call.projectPath ? { projectPath: call.projectPath } : {}),
        task: call.task,
        stage: call.stage,
        excerpts: [],
      },
    })
    if (res.model) model = res.model
    const parsed = parse(res, call.schema)
    if (parsed.ok) return { output: parsed.data, model }
    messages.push(
      { role: 'assistant', content: res.text || '{}' },
      { role: 'user', content: REPAIR.replace('%ISSUES%', parsed.issues) },
    )
    if (round === 1)
      throw new AppError(
        'VALIDATION',
        `The model's reply did not match the ${call.name} format:\n${parsed.issues}`,
      )
  }
  throw new AppError('VALIDATION', 'The model returned no usable reply')
}

/** The reply call for a persona: render `simcell_reply` and ask the roleplay model. */
export function callRoleplay(
  env: DraftEnv,
  vars: Record<string, unknown>,
): Promise<{ output: SimcellDraftOutput; model: string }> {
  return chatJson({
    provider: env.provider,
    model: env.model,
    rendered: renderPrompt(env.prompt, vars),
    name: 'SimcellDraftOutput',
    schema: SimcellDraftOutput,
    task: 'roleplay',
    stage: 'simcell_reply',
    ...(env.projectPath ? { projectPath: env.projectPath } : {}),
    ...(env.signal ? { signal: env.signal } : {}),
  })
}

const only = (ids: readonly string[], valid: ReadonlySet<string>): string[] =>
  ids.filter((id) => valid.has(id))

/** Keep only ids that exist on the card, so the chips on a draft always point at something real. */
function cleanApplied(
  output: SimcellDraftOutput,
  card: PersonaCard,
): SimcellDraftOutput['applied'] {
  return {
    goals: only(output.applied.goals, new Set(card.goals.map((g) => g.id))),
    deadlines: only(output.applied.deadlines, new Set(card.deadlines.map((d) => d.id))),
    rules: only(output.applied.rules, new Set(card.escalationRules.map((r) => r.id))),
    concessions: only(output.applied.concessions, new Set(card.concessions.map((c) => c.id))),
  }
}

function assertDraftable(card: PersonaCard): void {
  if (!card.goals.length)
    throw new AppError(
      'VALIDATION',
      `Add at least one goal to ${card.displayName} before drafting.`,
    )
}

export async function draftReply(env: DraftEnv, req: DraftRequest): Promise<SimcellDraft> {
  assertDraftable(req.card)
  const vars = buildPersonaView({ ...req.context, card: req.card })
  const { output, model } = await callRoleplay(env, vars)
  const channel: PersonaChannel = req.context.channel
  const flags: SimcellFlag[] = runChecks({
    output,
    card: req.card,
    channel,
    knownNames: env.knownNames,
  })
  if (req.level === 'limited')
    flags.push({
      code: 'LIMITED_MODEL',
      message: 'This model passed only some of the SimCell checks. Read the draft closely.',
    })
  return SimcellDraft.parse({
    id: newId(),
    personaId: req.card.id,
    threadId: req.threadId,
    ...(req.inReplyTo ? { inReplyTo: req.inReplyTo } : {}),
    ...(req.context.playerMessage
      ? { inReplyToText: req.context.playerMessage.slice(0, 4000) }
      : {}),
    trigger: req.trigger,
    text: output.text.trim(),
    intent: output.intent,
    applied: cleanApplied(output, req.card),
    ...(output.concessionEvidence ? { concessionEvidence: output.concessionEvidence } : {}),
    controllerNote: output.controllerNote,
    flags,
    providerRef: { providerId: env.providerId, model },
    createdAt: nowIso(),
    status: 'queued',
    ...(req.callId ? { callId: req.callId } : {}),
  })
}
