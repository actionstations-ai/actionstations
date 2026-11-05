// The flooding domain and toolkit content (spec 0454 FR-1..FR-4): valid against the schemas,
// consistent with each other, and within the generator's knowledge budget.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { toolkitKnowledge, ToolkitSchema, KNOWLEDGE_PER_TOOLKIT_CAP } from '@shared/toolkits'

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(p), 'utf8'))
const domain = DomainProfile.parse(read('packs/domains/flooding.json'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/flooding.json'))

describe('flooding domain', () => {
  it('lists every added family it uses and the default is a flood family', () => {
    const added = (domain.addedThreatFamilies ?? []).map((f) => f.id)
    expect(added).toEqual(
      expect.arrayContaining([
        'flood_river',
        'flood_flash',
        'flood_levee_breach',
        'flood_urban',
        'flood_ice_jam',
        'flood_post_wildfire',
        'flood_service_degradation',
      ]),
    )
    expect(domain.threatFamilies[0]).toBe('flood_river')
  })
  it('gives each added family a four-phase arc', () => {
    for (const f of domain.addedThreatFamilies ?? []) expect(f.phaseArc).toHaveLength(4)
  })
  it('suggests the flooding toolkit', () => {
    expect(domain.suggestedToolkits).toContain('flooding')
  })
})

describe('flooding toolkit', () => {
  it('ships a template folder for every inject type it adds', () => {
    for (const t of toolkit.injectTypes) {
      expect(existsSync(resolve(`templates/injects/${t}/template.html`)), t).toBe(true)
      const meta = read(`templates/injects/${t}/meta.json`) as { taxonomy?: unknown }
      expect(meta.taxonomy, `${t} needs a taxonomy block`).toBeTruthy()
    }
  })
  it('fits the knowledge budget without cutting a line', () => {
    const { text, truncated } = toolkitKnowledge([toolkit])
    expect(truncated).toEqual([])
    expect(text.length).toBeLessThan(KNOWLEDGE_PER_TOOLKIT_CAP)
  })
  it('states the category and tag rules the generator must follow', () => {
    const rules = toolkit.knowledge.realismRules.join(' ')
    expect(rules).toMatch(/own category table/)
    expect(rules).toMatch(/CATASTROPHIC/)
    expect(rules).toMatch(/bankfull/)
  })
})
