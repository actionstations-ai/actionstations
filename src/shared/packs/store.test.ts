// Pack store groups (#1152): kinds, fields and categories, and every included pack has a home.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PackKind } from '../schemas/pack'
import { ALL_CATEGORIES, categoryOf, monogram, packField, storeKind } from './store'

interface BundledEntry {
  id: string
  name: string
  domains?: string[]
  contents: Partial<Record<PackKind, string[]>>
}

const bundled = (
  JSON.parse(readFileSync(join(__dirname, '../../../packs/bundled.json'), 'utf8')) as {
    packs: BundledEntry[]
  }
).packs

describe('pack store groups', () => {
  it('tells fields, toolkits, reference libraries, templates and core apart', () => {
    const p = (kinds: PackKind[], extra = {}) => ({ id: 'x', kinds, domains: [], ...extra })
    expect(storeKind(p(['domains', 'templates', 'examples']))).toBe('field')
    expect(storeKind(p(['toolkits', 'templates']))).toBe('toolkit')
    expect(storeKind(p(['documents']))).toBe('library')
    expect(storeKind(p(['templates', 'prompts']))).toBe('templates')
    expect(storeKind(p(['templates', 'domains'], { core: true }))).toBe('core')
  })

  it('puts a toolkit with no domain in its field, and generic packs in General', () => {
    expect(packField({ id: 'ai.actionstations.weather', domains: [] })).toBe('meteorology')
    expect(categoryOf('meteorology').id).toBe('hazards')
    expect(packField({ id: 'org.example.social', domains: ['generic'] })).toBeUndefined()
    expect(categoryOf(undefined).id).toBe('general')
  })

  it('gives every included pack except Core a field and a category', () => {
    const homeless = bundled
      .filter((b) => b.id !== 'ai.actionstations.core')
      .filter((b) => categoryOf(packField({ id: b.id, domains: b.domains ?? [] })).id === 'general')
      .map((b) => b.id)
    expect(homeless).toEqual([])
  })

  it('lists each domain in one category only', () => {
    const domains = ALL_CATEGORIES.flatMap((c) => c.domains)
    expect(new Set(domains).size).toBe(domains.length)
  })

  it('makes a two-letter icon from the significant words', () => {
    expect(monogram('Nursing and clinical care')).toBe('NC')
    expect(monogram('Toolkit: spill and plume')).toBe('SP')
    expect(monogram('Airports')).toBe('A')
    expect(monogram('911 and emergency communications')).toBe('9E')
  })
})
