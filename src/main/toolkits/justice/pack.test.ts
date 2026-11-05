// The justice domain and toolkit content (spec 0465 FR-1, FR-2, FR-7): valid against the schemas,
// consistent with each other, carrying the level of detail rule, and within the knowledge budget.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { KNOWLEDGE_PER_TOOLKIT_CAP, toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'
import { JUSTICE_LINT_RULES } from './register-lint'

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(p), 'utf8'))
const domain = DomainProfile.parse(read('packs/domains/justice.json'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/justice.json'))

const FAMILIES = [
  'justice_active_assailant',
  'justice_barricaded_subject',
  'justice_missing_child',
  'justice_civil_unrest',
  'justice_corrections_incident',
  'justice_evidence_integrity',
  'justice_service_degradation',
]

describe('justice domain', () => {
  it('defines the seven families, the active assailant one first', () => {
    expect((domain.addedThreatFamilies ?? []).map((f) => f.id)).toEqual(FAMILIES)
    expect(domain.threatFamilies.slice(0, 7)).toEqual(FAMILIES)
    expect(domain.threatFamilies[0]).toBe('justice_active_assailant')
  })

  it('gives every family an arc, decision points and the level of detail rule', () => {
    for (const f of domain.addedThreatFamilies ?? []) {
      expect(f.phaseArc.length, f.id).toBeGreaterThanOrEqual(4)
      expect(f.decisionPointExamples.length, f.id).toBeGreaterThanOrEqual(2)
      expect(f.promptGuidance, f.id).toMatch(/coordination level/)
      expect(f.promptGuidance, f.id).toMatch(/Never write entry or breaching methods/)
      expect(f.promptGuidance!.length, f.id).toBeLessThanOrEqual(2000)
    }
  })

  it('walks the active assailant arc from first reports to review', () => {
    const arc = domain.addedThreatFamilies!.find((f) => f.id === 'justice_active_assailant')!
    expect(arc.phaseArc.map((p) => p.title)).toEqual([
      'First reports',
      'Command and unified command',
      'Rescue coordination and mutual aid',
      'Public information and family reunification',
      'Investigation, notification and review',
    ])
  })

  it('orders court ransomware from detection to review', () => {
    const arc = domain.addedThreatFamilies!.find((f) => f.id === 'justice_service_degradation')!
    expect(arc.phaseArc.map((p) => p.title)).toEqual([
      'Detection',
      'Shutdown decisions',
      'Closure and notification',
      'Fallback operations',
      'Restoration in priority order',
      'Review',
    ])
  })

  it('has the roles of the five settings and aliases for the field words', () => {
    const teams = domain.roles.map((r) => r.team).join('|')
    for (const t of ['Incident command', 'Dispatch', 'Corrections', 'Court', 'Outside parties'])
      expect(teams).toContain(t)
    for (const a of ['police', 'sheriff', 'jail', 'court', 'property_room'])
      expect(domain.aliases).toContain(a)
  })

  it('suggests the justice toolkit, dispatch and the media environment', () => {
    expect(domain.suggestedToolkits).toEqual(['justice', 'dispatch', 'media_environment'])
  })
})

describe('justice toolkit', () => {
  it('has the stable id other fields reuse and names the three guardrail rules', () => {
    expect(toolkit.id).toBe('justice')
    expect([...toolkit.lintRules].sort()).toEqual([...JUSTICE_LINT_RULES].sort())
  })

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

  it('states the level of detail rule and the no-notoriety rule to the generator', () => {
    const { text } = toolkitKnowledge([toolkit])
    expect(text).toMatch(/Coordination level only/)
    expect(text).toMatch(/never name or describe the person responsible/i)
    expect(text).toMatch(/no technique, scripts or dialogue/)
  })

  it('carries the date or source of each rule it teaches', () => {
    const find = (term: string) => toolkit.knowledge.glossary.find((g) => g.term.startsWith(term))!
    expect(find('AMBER').definition).toMatch(/amberalert\.ojp\.gov/)
    expect(find('AMBER').definition).toMatch(/States set their own/)
    expect(find('Unified command').definition).toMatch(/Jan 2024/)
    expect(find('Essential function').definition).toMatch(/NCSC/)
  })

  it('is proposed to the domains that reuse unified command', () => {
    for (const d of ['justice', 'municipal', 'k12_schools', 'campus', 'transit', 'airport'])
      expect(toolkit.appliesTo.domains).toContain(d)
  })

  it('is in the media environment toolkit and suggests it', () => {
    const media = ToolkitSchema.parse(read('packs/toolkits/media_environment.json'))
    expect(media.appliesTo.domains).toContain('justice')
    expect(domain.suggestedToolkits).toContain('media_environment')
  })
})
