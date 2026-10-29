// Pure helpers for the persona card editor (spec 0429).
import type { PersonaCard } from '@shared/schemas/persona'

/** What stops a card from drafting well, in plain words. */
export function cardProblems(card: PersonaCard): string[] {
  const out: string[] = []
  if (!card.goals.length) out.push('Add at least one goal. Drafting needs it.')
  for (const c of card.concessions)
    if (!c.onlyIf.trim()) out.push(`The concession "${c.give.slice(0, 40)}" needs a condition.`)
  if (card.kind === 'attacker' && !card.knowledge.doesNotKnow.length)
    out.push(
      'An attacker should not know how the attack was carried out. List that under what it does not know.',
    )
  return out
}

/** Merge a proposal over the cards: a card from the same script is replaced, others are kept. */
export function mergeProposal(current: PersonaCard[], proposal: PersonaCard[]): PersonaCard[] {
  const replaced = new Set(proposal.map((p) => p.source?.simcellScriptIndex))
  const kept = current.filter(
    (c) => c.source === undefined || !replaced.has(c.source.simcellScriptIndex),
  )
  return [...kept, ...proposal]
}
