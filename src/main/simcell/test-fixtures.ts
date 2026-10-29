// Shared fixtures for the SimCell tests: a persona card, the shipped reply prompt, and a stub
// text provider that returns canned JSON.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PersonaCard, type PromptFile, type SimcellDraftOutput } from '@shared/schemas'
import { parsePromptRaw } from '../prompts/format'
import type { ChatRequest, ChatResponse, TextProvider } from '../providers/types'

export const SECRET = 'the night-shift supervisor'

export const reporter: PersonaCard = PersonaCard.parse({
  id: 'p1-reporter',
  displayName: 'Dana Whitlock',
  roleTitle: 'Reporter',
  organization: { name: 'Harbor Ledger', fictional: true },
  kind: 'reporter',
  register: 'plain-spoken',
  goals: [{ id: 'g1', text: 'Publish a first report before the evening edition.' }],
  deadlines: [
    {
      id: 'd1',
      at: '1:30',
      wants: 'A written statement from the operator.',
      ifMissed: 'Publishes without comment.',
    },
  ],
  escalationRules: [
    {
      id: 'r1',
      when: { kind: 'no_reply', minutes: 10 },
      then: 'Calls again and mentions a source.',
    },
    {
      id: 'r2',
      when: { kind: 'row_released', rowId: 'I-05' },
      then: 'Asks about the outage cause.',
    },
  ],
  knowledge: {
    knows: ['Passengers are posting about delays.'],
    doesNotKnow: ['What caused the outage.'],
    mustNotReveal: [SECRET],
  },
  concessions: [
    {
      id: 'c1',
      give: 'Will hold the story for one hour.',
      onlyIf: 'The players give a written statement with a time for the next update.',
    },
  ],
  hardQuestions: ['Is anyone in danger?'],
  linkedRowIds: ['I-05'],
})

export function replyPrompt(): PromptFile {
  const raw = readFileSync(resolve('prompts/simcell_reply.md'), 'utf8')
  const parsed = parsePromptRaw(raw, 'simcell_reply', 'prompts/simcell_reply.md')
  return {
    name: 'simcell_reply',
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    source: 'default',
  }
}

export const answer = (over: Partial<SimcellDraftOutput> = {}): SimcellDraftOutput => ({
  text: 'We need your written statement by 1:30, or we publish what we have.',
  intent: 'stall',
  applied: { goals: ['g1'], deadlines: ['d1'], rules: [], concessions: [] },
  controllerNote: 'Pushes for the statement.',
  ...over,
})

/** A provider that answers each call with the next canned reply (the last one repeats). */
export function stubProvider(
  replies: (unknown | ((req: ChatRequest) => unknown))[],
): TextProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  let n = 0
  return {
    id: 'stub',
    kind: 'mock',
    config: { id: 'stub', kind: 'mock', label: 'Stub', options: {}, enabled: true },
    requests,
    async listModels() {
      return []
    },
    async health() {
      return { ok: true, latencyMs: 0 }
    },
    async chat(req): Promise<ChatResponse> {
      requests.push(req)
      const next = replies[Math.min(n++, replies.length - 1)]
      const value = typeof next === 'function' ? (next as (r: ChatRequest) => unknown)(req) : next
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      return {
        text,
        ...(typeof value === 'string' ? {} : { json: value }),
        model: 'stub-model',
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: 'stop',
        latencyMs: 0,
      }
    },
  }
}
