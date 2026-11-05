// Toolkit schema and composition (spec 0448 FR-1, FR-2, FR-3).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  KNOWLEDGE_PER_TOOLKIT_CAP,
  KNOWLEDGE_TOTAL_CAP,
  ToolkitSchema,
  mergedOutsideParties,
  suggestToolkits,
  toolkitInjectTypeIds,
  toolkitKnowledge,
  type Toolkit,
} from './index'

const fixture = (): unknown =>
  JSON.parse(readFileSync(resolve('tests/fixtures/toolkits/test_field.json'), 'utf8'))

const make = (over: Record<string, unknown> = {}): Toolkit =>
  ToolkitSchema.parse({ id: 'alpha', name: 'Alpha', description: 'd', ...over })

describe('ToolkitSchema', () => {
  it('parses the fixture with every FR-1 part', () => {
    const t = ToolkitSchema.parse(fixture())
    expect(t.id).toBe('test_field')
    expect(t.injectTypes).toEqual(['test_bulletin'])
    expect(t.connectors).toEqual(['test_archive'])
    expect(t.decisionForms[0]?.fields).toHaveLength(3)
    expect(t.metrics[0]).toMatchObject({ id: 'decision_timing', config: { windowMinutes: 30 } })
    expect(t.lintRules).toEqual(['bulletin_syntax'])
  })

  it('needs only id, name and description; the rest defaults to empty', () => {
    const t = make()
    expect(t).toMatchObject({
      appliesTo: { keywords: [], domains: [] },
      injectTypes: [],
      outsideParties: [],
      knowledge: { glossary: [], productConventions: [], realismRules: [] },
    })
  })

  it.each(['Bad Id', '1abc', 'has-dash', ''])('refuses the id %j', (id) => {
    expect(ToolkitSchema.safeParse({ id, name: 'n', description: 'd' }).success).toBe(false)
  })

  it('refuses a choice field with fewer than two choices', () => {
    const r = ToolkitSchema.safeParse({
      id: 'a',
      name: 'n',
      description: 'd',
      decisionForms: [
        {
          id: 'f',
          label: 'F',
          fields: [{ id: 'x', label: 'X', kind: 'choice', choices: ['one'] }],
        },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('refuses repeated field ids in one form', () => {
    const field = { id: 'x', label: 'X', kind: 'text' }
    const r = ToolkitSchema.safeParse({
      id: 'a',
      name: 'n',
      description: 'd',
      decisionForms: [{ id: 'f', label: 'F', fields: [field, field] }],
    })
    expect(r.success).toBe(false)
  })
})

describe('toolkitKnowledge', () => {
  it('lists terms, conventions and rules under the toolkit name', () => {
    const { text, truncated } = toolkitKnowledge([ToolkitSchema.parse(fixture())])
    expect(text).toContain('Test field (test_field)')
    expect(text).toContain('- Bulletin: A short notice')
    expect(text).toContain('Product conventions:')
    expect(text).toContain('- A warning is never issued without an area.')
    expect(truncated).toEqual([])
  })

  it('is empty for toolkits without knowledge', () => {
    expect(toolkitKnowledge([make()])).toEqual({ text: '', truncated: [] })
  })

  it('caps one toolkit at whole lines and reports it', () => {
    const rules = Array.from({ length: 100 }, (_, i) => `Rule ${i}: ${'x'.repeat(100)}`)
    const { text, truncated } = toolkitKnowledge([make({ knowledge: { realismRules: rules } })])
    expect(text.length).toBeLessThanOrEqual(KNOWLEDGE_PER_TOOLKIT_CAP + 50)
    expect(text.endsWith('x'.repeat(100))).toBe(true)
    expect(truncated).toEqual(['alpha'])
  })

  it('caps the whole block across toolkits', () => {
    const rules = Array.from({ length: 30 }, (_, i) => `Rule ${i}: ${'y'.repeat(100)}`)
    const many = ['a', 'b', 'c', 'd'].map((id) =>
      make({ id, name: id.toUpperCase(), knowledge: { realismRules: rules } }),
    )
    const { text, truncated } = toolkitKnowledge(many)
    expect(text.length).toBeLessThanOrEqual(KNOWLEDGE_TOTAL_CAP)
    expect(truncated.length).toBeGreaterThan(0)
    expect(text).toContain('A (a)')
  })
})

describe('composition lists', () => {
  const t = ToolkitSchema.parse(fixture())

  it('adds the toolkit outside parties after the domain ones, without repeats', () => {
    expect(mergedOutsideParties(['Press', 'harbor watch desk'], [t])).toEqual([
      'Press',
      'harbor watch desk',
      'Port authority liaison',
    ])
  })

  it('adds inject types the domain does not list', () => {
    expect(toolkitInjectTypeIds(['email'], [t])).toEqual(['test_bulletin'])
    expect(toolkitInjectTypeIds(['test_bulletin'], [t])).toEqual([])
  })
})

describe('suggestToolkits', () => {
  const field = ToolkitSchema.parse(fixture())
  const other = make({ id: 'other', name: 'Other', appliesTo: { keywords: ['flood'] } })
  const base = { available: [field, other], active: [], domainId: 'airport' }

  it('proposes a toolkit whose hazard word the brief mentions, with the word in the reason', () => {
    const s = suggestToolkits({ ...base, text: 'A Gale hits the harbor at dawn.' })
    expect(s).toEqual([{ toolkitId: 'test_field', reason: 'The brief mentions "gale".' }])
  })

  it('matches whole words only', () => {
    expect(suggestToolkits({ ...base, text: 'A galeforce speech.' })).toEqual([])
    expect(suggestToolkits({ ...base, text: 'Dense sea fog, again.' })).toHaveLength(1)
  })

  it('proposes the domain suggested toolkits whatever the brief says', () => {
    const s = suggestToolkits({
      ...base,
      text: 'A ransomware attack.',
      domainLabel: 'Airport',
      profileSuggested: ['other'],
    })
    expect(s).toEqual([{ toolkitId: 'other', reason: 'Suggested for Airport exercises.' }])
  })

  it('proposes a toolkit that lists the domain in appliesTo', () => {
    const s = suggestToolkits({ ...base, domainId: 'transit', text: 'nothing' })
    expect(s.map((x) => x.toolkitId)).toEqual(['test_field'])
  })

  it('lists brief matches before domain suggestions', () => {
    const s = suggestToolkits({
      ...base,
      text: 'flood on the apron',
      profileSuggested: ['test_field'],
    })
    expect(s.map((x) => x.toolkitId)).toEqual(['other', 'test_field'])
  })

  it('skips toolkits already on and ones the user dismissed', () => {
    const text = 'gale and flood'
    expect(
      suggestToolkits({ ...base, text, active: ['test_field'] }).map((x) => x.toolkitId),
    ).toEqual(['other'])
    expect(
      suggestToolkits({ ...base, text, dismissed: ['other'] }).map((x) => x.toolkitId),
    ).toEqual(['test_field'])
  })

  it('treats regex characters in a keyword as plain text', () => {
    const odd = make({ id: 'odd', appliesTo: { keywords: ['c++ (gale)'] } })
    expect(suggestToolkits({ ...base, available: [odd], text: 'c++ (gale) warning' })).toHaveLength(
      1,
    )
    expect(suggestToolkits({ ...base, available: [odd], text: 'c gale' })).toHaveLength(0)
  })
})
