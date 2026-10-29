// One persona's view of the exercise (spec 0429 FR-9). A pure function over an allow-list:
// the persona's card, its own thread, the exercise clock and the events of the MSEL rows linked
// to it that have been released. Nothing else reaches the prompt: not other personas' threads,
// not expected actions, not controller notes, not the plan text.
import type { PersonaCard, PersonaChannel, Scenario } from '@shared/schemas'
import { exerciseMinutes } from '@shared/schemas'
import { channelLimit, describeLimit } from './checks'

export const THREAD_LINES = 20
const LINE_CHARS = 1000

export interface ThreadLine {
  who: 'player' | 'persona'
  text: string
  exerciseTime: string
  /** Epoch ms. */
  at: number
}

export interface ContextInput {
  card: PersonaCard
  scenario: Pick<Scenario, 'msel'>
  /** MSEL row ids already released to players. */
  releasedRowIds: ReadonlySet<string>
  /** This persona's thread only. */
  thread: readonly ThreadLine[]
  clock: { minutes: number; label: string }
  channel: PersonaChannel
  /** Why the draft is being written, in plain words. */
  trigger: string
  playerMessage?: string
  instruction?: string
  nowMs?: number
}

const clip = (s: string, n = LINE_CHARS): string => (s.length > n ? `${s.slice(0, n)}…` : s)

/** Whether the persona sent the last line of the thread and nobody has answered for `minutes`. */
export function silentFor(thread: readonly ThreadLine[], minutes: number, nowMs: number): boolean {
  const last = thread.at(-1)
  return !!last && last.who === 'persona' && nowMs - last.at >= minutes * 60_000
}

function whenText(
  rule: PersonaCard['escalationRules'][number]['when'],
  input: ContextInput,
): { when: string; status: string } {
  const { clock, releasedRowIds, thread } = input
  switch (rule.kind) {
    case 'time':
      return {
        when: `exercise time reaches ${rule.at}`,
        status: clock.minutes >= exerciseMinutes(rule.at) ? 'true now' : 'not yet',
      }
    case 'row_released':
      return {
        when: `the event ${rule.rowId} has been released`,
        status: releasedRowIds.has(rule.rowId) ? 'true now' : 'not yet',
      }
    case 'no_reply':
      return {
        when: `${rule.minutes} minutes pass without a reply from the players`,
        status: silentFor(thread, rule.minutes, input.nowMs ?? Date.now()) ? 'true now' : 'not yet',
      }
    case 'player_says':
      return {
        when: `the players say something like "${rule.text}"`,
        status: 'judge from the player message',
      }
  }
}

/** The events of linked, released rows: what the persona could have seen happen. */
function visibleEvents(input: ContextInput): { time: string; event: string }[] {
  const linked = new Set(input.card.linkedRowIds)
  return input.scenario.msel
    .filter((r) => linked.has(r.id) && input.releasedRowIds.has(r.id))
    .map((r) => ({ time: r.time, event: clip(r.event, 600) }))
}

/** The template variables for `simcell_reply`. */
export function buildPersonaView(input: ContextInput): Record<string, unknown> {
  const { card, clock } = input
  return {
    persona: {
      displayName: card.displayName,
      roleTitle: card.roleTitle,
      organization: card.organization.name || 'an organization outside the players',
      kind: card.kind,
      register: card.register,
      goals: card.goals,
      deadlines: card.deadlines.map((d) => ({
        ...d,
        status: clock.minutes >= exerciseMinutes(d.at) ? 'passed' : 'not yet',
      })),
      escalationRules: card.escalationRules.map((r) => ({
        id: r.id,
        then: r.then,
        ...whenText(r.when, input),
      })),
      knows: card.knowledge.knows,
      doesNotKnow: card.knowledge.doesNotKnow,
      mustNotReveal: card.knowledge.mustNotReveal,
      concessions: card.concessions,
      hardQuestions: card.hardQuestions,
    },
    clock: { label: clock.label },
    thread: input.thread.slice(-THREAD_LINES).map((l) => ({
      exerciseTime: l.exerciseTime,
      who: l.who === 'player' ? 'Players' : card.displayName,
      text: clip(l.text),
    })),
    events: visibleEvents(input),
    trigger: input.trigger,
    channel: input.channel,
    limit: describeLimit(channelLimit(input.channel)),
    playerMessage: input.playerMessage ? clip(input.playerMessage, 2000) : '',
    instruction: input.instruction ? clip(input.instruction, 300) : '',
  }
}
