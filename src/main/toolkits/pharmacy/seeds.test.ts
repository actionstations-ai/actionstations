// Historical seeds (spec 0463 FR-7): every fact has a source, every seed says what was not
// established, and the generator block labels the seed as history.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { PHARMACY_SEEDS, seedById, seedPromptBlock } from './seeds'

const domain = DomainProfile.parse(
  JSON.parse(readFileSync(resolve('packs/domains/pharmacy.json'), 'utf8')),
)

describe('pharmacy historical seeds', () => {
  it('attributes every fact and states what is not established', () => {
    for (const s of PHARMACY_SEEDS) {
      expect(s.facts.length, s.id).toBeGreaterThan(0)
      for (const f of s.facts) expect(f.source.length, `${s.id}: ${f.fact}`).toBeGreaterThan(5)
      expect(s.unverified.length, s.id).toBeGreaterThan(0)
      expect(s.checkedOn).toMatch(/^2026-\d\d-\d\d$/)
    }
  })

  it('fits a family the domain defines and has a unique id', () => {
    const families = (domain.addedThreatFamilies ?? []).map((f) => f.id)
    for (const s of PHARMACY_SEEDS) expect(families, s.id).toContain(s.family)
    expect(new Set(PHARMACY_SEEDS.map((s) => s.id)).size).toBe(PHARMACY_SEEDS.length)
  })

  it('carries the dated facts of the dossier', () => {
    const text = JSON.stringify(PHARMACY_SEEDS)
    expect(text).toContain('October 8, 2024')
    expect(text).toContain('February 21, 2024')
    expect(text).toContain('within one business day')
    expect(text).toContain('within 45 days')
  })

  it('tells the generator it is history and keeps the exercising organization fictional', () => {
    const block = seedPromptBlock(seedById('iv-fluid-shortage-2024')!)
    expect(block).toContain('This is history')
    expect(block).toContain('do not invent narrative details as fact')
    expect(block).toContain('fictional')
  })
})
