// Reference shown in the editor's help panel. Helper names must match the helpers
// registered in main (src/main/prompts/template.ts); a main-side test checks the list.

export interface HelpItem {
  name: string
  usage: string
  description: string
}

export const SECTION_MARKERS: HelpItem[] = [
  {
    name: '@system',
    usage: '<!-- @system -->',
    description: 'Required. Role, rules and output contract sent as the system prompt.',
  },
  {
    name: '@context',
    usage: '<!-- @context -->',
    description:
      'Optional. Large, stable context (retrieved doctrine) that providers may cache between calls.',
  },
  {
    name: '@user',
    usage: '<!-- @user -->',
    description: 'Required. The task and its data, sent as the user turn.',
  },
]

export const MARKER_NOTE =
  'Each marker sits on its own line. Text before the first marker is a note for humans and is not sent.'

export const PROMPT_HELPER_HELP: HelpItem[] = [
  { name: 'json', usage: '{{json value}}', description: 'Pretty-printed JSON of a value.' },
  {
    name: 'join',
    usage: '{{join list ", "}}',
    description: 'Joins a list with a separator (default ", ").',
  },
  { name: 'eq', usage: '{{#if (eq a b)}}…{{/if}}', description: 'True when a equals b.' },
  { name: 'ne', usage: '{{#if (ne a b)}}…{{/if}}', description: 'True when a differs from b.' },
  {
    name: 'and',
    usage: '{{#if (and a b)}}…{{/if}}',
    description: 'True when every value is truthy.',
  },
  { name: 'or', usage: '{{#if (or a b)}}…{{/if}}', description: 'True when any value is truthy.' },
  { name: 'not', usage: '{{#if (not a)}}…{{/if}}', description: 'Negates a value.' },
  { name: 'inc', usage: '{{inc @index}}', description: 'Adds one (1-based numbering in loops).' },
  { name: 'upper', usage: '{{upper text}}', description: 'Upper-cases text.' },
  { name: 'lower', usage: '{{lower text}}', description: 'Lower-cases text.' },
  {
    name: 'default',
    usage: '{{default value "fallback"}}',
    description: 'Uses the fallback when the value is missing, empty text or an empty list.',
  },
  {
    name: 'bullets',
    usage: '{{bullets list}}',
    description: 'Markdown "- " list, one item per line.',
  },
  {
    name: 'indent',
    usage: '{{indent text 2}}',
    description: 'Indents every non-empty line by n spaces.',
  },
]

export const BUILTIN_HELP =
  'Built-in blocks: {{#if}}, {{#unless}}, {{#each}} (with @index), {{#with}}, {{lookup}}. Output is plain text (no HTML escaping). Unknown helpers are rejected when you save.'
