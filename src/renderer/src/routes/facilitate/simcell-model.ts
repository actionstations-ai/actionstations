// What the SimCell panel shows about a draft, kept pure (spec 0429 FR-7, FR-10, FR-11).
import type {
  CapabilityLevel,
  PersonaCard,
  SimcellDraft,
  SimcellFlagCode,
} from '@shared/schemas/persona'

export const FLAG_TITLES: Record<SimcellFlagCode, string> = {
  MUST_NOT_REVEAL: 'Reveals something it must not',
  CONCESSION_UNMET: 'Concession without its condition met',
  AGREEABLE_DRIFT: 'Agrees with no reason on the card',
  BROKE_CHARACTER: 'Breaks character',
  UNKNOWN_PERSON_NAME: 'Names a person who is not in the scenario',
  TOO_LONG: 'Too long for the channel',
  RULE_JUDGED_BY_MODEL: 'A rule was judged by the model',
  LIMITED_MODEL: 'Model passed only some checks',
}

export const LEVEL_TEXT: Record<CapabilityLevel, string> = {
  suited: 'Suited',
  limited: 'Limited',
  not_suited: 'Not suited',
}

export const LEVEL_ADVICE: Record<CapabilityLevel, string> = {
  suited: 'Drafts appear on their own when players write.',
  limited: 'Drafts only when you ask, with a warning on each.',
  not_suited: 'Drafting is off. Write replies by hand, or route SimCell replies to a larger model.',
}

export interface Chip {
  kind: 'Goal' | 'Deadline' | 'Rule' | 'Concession'
  id: string
  text: string
}

/** The goals, deadlines, rules and concessions a draft applied, as text from the card. */
export function appliedChips(draft: SimcellDraft, card: PersonaCard | undefined): Chip[] {
  if (!card) return []
  const out: Chip[] = []
  for (const id of draft.applied.goals) {
    const g = card.goals.find((x) => x.id === id)
    if (g) out.push({ kind: 'Goal', id, text: g.text })
  }
  for (const id of draft.applied.deadlines) {
    const d = card.deadlines.find((x) => x.id === id)
    if (d) out.push({ kind: 'Deadline', id, text: `By ${d.at}: ${d.wants}` })
  }
  for (const id of draft.applied.rules) {
    const r = card.escalationRules.find((x) => x.id === id)
    if (r) out.push({ kind: 'Rule', id, text: r.then })
  }
  for (const id of draft.applied.concessions) {
    const c = card.concessions.find((x) => x.id === id)
    if (c) out.push({ kind: 'Concession', id, text: `${c.give} Only if: ${c.onlyIf || 'not set'}` })
  }
  return out
}

/** "3 min" for the age of an unanswered message; under a minute reads "just now". */
export function ageLabel(since: number | string, now: number): string {
  const at = typeof since === 'number' ? since : Date.parse(since)
  const minutes = Math.floor((now - at) / 60_000)
  return minutes < 1 ? 'just now' : `${minutes} min`
}

/** "Name (Organization)" as players will see the sender. */
export function senderLabel(card: PersonaCard): string {
  const org = card.organization.name.trim()
  return org ? `${card.displayName} (${org})` : card.displayName
}

/** Oldest first: the message that has waited longest is at the top. */
export function byAge<T extends { createdAt: string }>(drafts: readonly T[]): T[] {
  return [...drafts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
