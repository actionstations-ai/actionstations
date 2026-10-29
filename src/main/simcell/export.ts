// The persona cards as a facilitator document (spec 0429, export): personas.md next to
// scenario.md. It goes to facilitator/ in the distribution ZIP and never to players/.
import type { PersonaCard, PersonasFile } from '@shared/schemas'

const list = (items: readonly string[]): string =>
  items.length ? items.map((i) => `- ${i}`).join('\n') : '- None'

function whenText(w: PersonaCard['escalationRules'][number]['when']): string {
  switch (w.kind) {
    case 'time':
      return `exercise time reaches ${w.at}`
    case 'row_released':
      return `row ${w.rowId} is released`
    case 'no_reply':
      return `${w.minutes} minutes pass without a reply`
    case 'player_says':
      return `players say something like "${w.text}" (judged by the model)`
  }
}

function cardMarkdown(c: PersonaCard): string {
  const org = c.organization.name
    ? `${c.organization.name}${c.organization.fictional ? ' (fictional)' : ''}`
    : 'No organization named'
  return [
    `## ${c.displayName}`,
    '',
    `${c.roleTitle ? `${c.roleTitle}. ` : ''}${org}. Kind: ${c.kind}.${c.register ? ` Tone: ${c.register}.` : ''}`,
    '',
    '### Goals',
    list(c.goals.map((g) => g.text)),
    '',
    '### Deadlines',
    list(c.deadlines.map((d) => `By ${d.at}: wants ${d.wants} If missed: ${d.ifMissed}`)),
    '',
    '### Escalation rules',
    list(c.escalationRules.map((r) => `When ${whenText(r.when)}: ${r.then}`)),
    '',
    '### Knows',
    list(c.knowledge.knows),
    '',
    '### Does not know',
    list(c.knowledge.doesNotKnow),
    '',
    '### Must never reveal',
    list(c.knowledge.mustNotReveal),
    '',
    '### Concessions',
    list(c.concessions.map((x) => `${x.give} Only if: ${x.onlyIf || 'no condition set'}`)),
    '',
    '### Hard questions',
    list(c.hardQuestions),
    '',
  ].join('\n')
}

export function personasMarkdown(file: PersonasFile, scenarioTitle: string): string {
  return [
    `# Persona cards: ${scenarioTitle}`,
    '',
    'For controllers and the SimCell only. Do not hand this to players.',
    '',
    ...file.personas.map(cardMarkdown),
  ].join('\n')
}
