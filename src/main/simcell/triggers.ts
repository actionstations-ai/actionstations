// Persona clocks (spec 0429 FR-8). When a deadline passes or an escalation rule becomes true,
// the persona drafts a message of its own. This module only says which triggers are due; each
// one fires once per session, and the draft still waits for a person.
import { exerciseMinutes, type PersonaCard } from '@shared/schemas'
import { silentFor, type ThreadLine } from './context'

export interface TriggerState {
  clockMinutes: number
  releasedRowIds: ReadonlySet<string>
  /** Each persona's own thread. */
  threads: ReadonlyMap<string, readonly ThreadLine[]>
  /** Keys already fired this session. */
  fired: ReadonlySet<string>
  nowMs: number
}

export interface DueTrigger {
  key: string
  personaId: string
  kind: 'deadline' | 'escalation'
  /** The deadline or rule id on the card. */
  id: string
  /** Plain words for the prompt. */
  why: string
}

export const triggerKey = (personaId: string, kind: DueTrigger['kind'], id: string): string =>
  `${personaId}:${kind === 'deadline' ? 'deadline' : 'rule'}:${id}`

function ruleDue(
  rule: PersonaCard['escalationRules'][number],
  card: PersonaCard,
  st: TriggerState,
) {
  const w = rule.when
  if (w.kind === 'time') return st.clockMinutes >= exerciseMinutes(w.at)
  if (w.kind === 'row_released') return st.releasedRowIds.has(w.rowId)
  if (w.kind === 'no_reply') return silentFor(st.threads.get(card.id) ?? [], w.minutes, st.nowMs)
  return false // player_says is judged on a player's message, never by the clock
}

export function dueTriggers(cards: readonly PersonaCard[], st: TriggerState): DueTrigger[] {
  const due: DueTrigger[] = []
  for (const card of cards) {
    if (!card.goals.length) continue
    for (const d of card.deadlines) {
      const key = triggerKey(card.id, 'deadline', d.id)
      if (!st.fired.has(key) && st.clockMinutes >= exerciseMinutes(d.at))
        due.push({
          key,
          personaId: card.id,
          kind: 'deadline',
          id: d.id,
          why: `The deadline at ${d.at} has passed. The character wanted: ${d.wants}`,
        })
    }
    for (const r of card.escalationRules) {
      const key = triggerKey(card.id, 'escalation', r.id)
      if (!st.fired.has(key) && ruleDue(r, card, st))
        due.push({
          key,
          personaId: card.id,
          kind: 'escalation',
          id: r.id,
          why: `An escalation rule is now true. The character then: ${r.then}`,
        })
    }
  }
  return due
}
