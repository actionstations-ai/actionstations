// The AI incidents domain and toolkit content (spec 0467 FR-1..FR-3): valid against the
// schemas, consistent with each other, within the generator's knowledge budget, and proposed
// where the spec says.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile, THREAT_FAMILY_IDS } from '@shared/domains/schema'
import {
  KNOWLEDGE_PER_TOOLKIT_CAP,
  suggestToolkits,
  toolkitKnowledge,
  ToolkitSchema,
} from '@shared/toolkits'

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(p), 'utf8'))
const domain = DomainProfile.parse(read('packs/domains/ai_incidents.json'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/ai_incidents.json'))

const FAMILIES = [
  'ai_synthetic_impersonation_fraud',
  'ai_synthetic_media_about_org',
  'ai_system_malfunction',
  'ai_data_poisoning',
  'ai_vendor_breach',
  'ai_service_degradation',
]

describe('ai_incidents domain', () => {
  it('adds the six families of the spec and the default is the fraud family', () => {
    expect((domain.addedThreatFamilies ?? []).map((f) => f.id)).toEqual(FAMILIES)
    expect(domain.threatFamilies[0]).toBe('ai_synthetic_impersonation_fraud')
    for (const id of domain.threatFamilies)
      expect([...FAMILIES, ...THREAT_FAMILY_IDS]).toContain(id)
  })

  it('gives each added family a four-phase arc with beats and decision examples', () => {
    for (const f of domain.addedThreatFamilies ?? []) {
      expect(f.phaseArc, f.id).toHaveLength(4)
      for (const p of f.phaseArc)
        expect(p.beats.length, `${f.id}/${p.title}`).toBeGreaterThanOrEqual(2)
      expect(f.decisionPointExamples.length, f.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('has the roles of the dossier in five teams (the four variants plus communications and legal)', () => {
    const abbreviations = domain.roles.map((r) => r.abbreviation)
    for (const a of ['AIGOV', 'CISO', 'FRAUD', 'TREAS', 'T&S', 'MLENG', 'PROD', 'COMMS', 'LEGAL'])
      expect(abbreviations).toContain(a)
    for (const a of ['VENDOR', 'EXEC', 'VICTIM', 'BOARD']) expect(abbreviations).toContain(a)
    expect(new Set(domain.roles.map((r) => r.team))).toEqual(
      new Set([
        'Security and fraud',
        'AI governance and product',
        'Trust and safety',
        'Communications and legal',
        'Executive and board',
      ]),
    )
  })

  it('suggests the AI incidents toolkit and the media environment', () => {
    expect(domain.suggestedToolkits).toContain('ai_incidents')
    expect(domain.suggestedToolkits).toContain('media_environment')
  })

  it('lists only inject types that have a template folder', () => {
    for (const t of domain.injectTypes)
      expect(existsSync(resolve('templates/injects', t, 'template.html')), t).toBe(true)
  })
})

describe('ai_incidents toolkit', () => {
  it('fits the knowledge budget without cutting a line', () => {
    const { text, truncated } = toolkitKnowledge([toolkit])
    expect(truncated).toEqual([])
    expect(text.length).toBeLessThan(KNOWLEDGE_PER_TOOLKIT_CAP)
  })

  it('states the rules about detectors, callbacks and legal scope', () => {
    const rules = toolkit.knowledge.realismRules.join(' ')
    expect(rules).toMatch(/detector said so/)
    expect(rules).toMatch(/directory number/)
    expect(rules).toMatch(/role question/)
    expect(toolkit.knowledge.glossary.map((g) => g.term)).toContain('Provider and deployer')
  })

  it('ships a template folder with a taxonomy block for every inject type it adds', () => {
    for (const t of toolkit.injectTypes) {
      expect(existsSync(resolve(`templates/injects/${t}/template.html`)), t).toBe(true)
      const meta = read(`templates/injects/${t}/meta.json`) as { taxonomy?: unknown }
      expect(meta.taxonomy, `${t} needs a taxonomy block`).toBeTruthy()
    }
  })
})

describe('where the toolkit is proposed', () => {
  it('is suggested by every domain the spec names (FR-13)', () => {
    for (const d of [
      'financial_services',
      'elections',
      'campus',
      'healthcare',
      'municipal',
      'emergency_communications',
      'telecom',
      'data_center_it',
      'crisis_comms',
    ]) {
      const profile = DomainProfile.parse(read(`packs/domains/${d}.json`))
      expect(profile.suggestedToolkits, d).toContain('ai_incidents')
      expect(toolkit.appliesTo.domains, d).toContain(d)
    }
  })

  it('is proposed when a brief mentions a deepfake, a chatbot or an AI vendor', () => {
    for (const text of [
      'A deepfake video call asks finance to move money',
      'Our customer chatbot gave harmful advice',
      'The AI vendor reported a breach',
    ]) {
      const s = suggestToolkits({ text, domainId: 'generic', active: [], available: [toolkit] })
      expect(
        s.map((x) => x.toolkitId),
        text,
      ).toEqual(['ai_incidents'])
    }
  })

  it('is listed by the media environment, which every bundled domain must list', () => {
    const media = ToolkitSchema.parse(read('packs/toolkits/media_environment.json'))
    expect(media.appliesTo.domains).toContain('ai_incidents')
    expect(readdirSync(resolve('packs/domains'))).toContain('ai_incidents.json')
  })
})
