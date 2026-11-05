// The governance domain (spec 0459 FR-1, FR-2): a sector-neutral profile for the people who decide
// for a whole organization, and six scenario families for disclosure, ransom, continuity,
// supplier, succession and confidential-information exercises.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '../toolkits'
import {
  builtinProfile,
  bundledProfiles,
  chooseThreatFamily,
  profileThreatFamilies,
  resolveThreat,
} from './index'

const governance = () => bundledProfiles().find((p) => p.id === 'governance')!
const family = (id: string) => governance().addedThreatFamilies!.find((f) => f.id === id)!

const FAMILY_IDS = [
  'gov_cyber_disclosure',
  'gov_ransom_decision',
  'gov_continuity_loss',
  'gov_supplier_cloud_outage',
  'gov_key_person_succession',
  'gov_confidential_information',
]

describe('governance domain profile', () => {
  it('carries the board, executive, legal, resilience and academic roles', () => {
    const keys = governance().roles.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of [
      'chair',
      'audit',
      'ceo',
      'cfo',
      'gc',
      'disc',
      'ciso',
      'bcm',
      'ir',
      'instructor',
    ])
      expect(keys, key).toContain(key)
    const teams = new Set(governance().roles.map((r) => r.team))
    for (const team of [
      'Board',
      'Executive team',
      'Legal and disclosure',
      'Resilience',
      'Academic case',
    ])
      expect(teams.has(team), team).toBe(true)
  })

  it('names the outside parties the dossier lists', () => {
    const parties = governance().outsideParties.join(' | ').toLowerCase()
    for (const party of ['the sec', 'insurer', 'auditor', 'outside counsel', 'law enforcement'])
      expect(parties, party).toContain(party)
  })

  it('resolves the dossier aliases to governance and leaves banks on financial services', () => {
    for (const alias of [
      'board of directors',
      'audit committee',
      'business continuity',
      'general counsel',
      'disclosure committee',
    ])
      expect(builtinProfile(alias).id, alias).toBe('governance')
    expect(builtinProfile('bank').id).toBe('financial_services')
  })

  it('uses the SEC clock that exists today and suggests the media toolkit', () => {
    expect(governance().regulations).toContain('sec_8k_105')
    expect(governance().suggestedToolkits).toContain('media_environment')
  })

  it('says the aid is not legal advice and the company is fictional', () => {
    expect(governance().description).toMatch(/not legal advice/)
    expect(governance().description).toMatch(/fictional/)
  })
})

describe('governance threat families', () => {
  it('adds the six families, none of them a built-in id', () => {
    expect(governance().addedThreatFamilies!.map((f) => f.id)).toEqual(FAMILY_IDS)
  })

  it('lists them first, with the disclosure decision as the default', () => {
    const ids = profileThreatFamilies(governance()).map((f) => f.id)
    expect(ids.slice(0, FAMILY_IDS.length)).toEqual(FAMILY_IDS)
    expect(resolveThreat(governance(), undefined).id).toBe('gov_cyber_disclosure')
  })

  it('gives each family a four-phase arc, decisions and a purpose mix', () => {
    for (const f of governance().addedThreatFamilies!) {
      expect(f.phaseArc, f.id).toHaveLength(4)
      for (const phase of f.phaseArc) expect(phase.beats.length).toBeGreaterThanOrEqual(3)
      expect(f.decisionPointExamples.length).toBeGreaterThanOrEqual(3)
      expect(Object.keys(f.purposeMix ?? {}).length).toBeGreaterThanOrEqual(3)
      expect(f.promptGuidance).toMatch(/fictional/)
    }
  })

  it('follows the dossier arc for a disclosure decision', () => {
    expect(family('gov_cyber_disclosure').phaseArc.map((p) => p.title)).toEqual([
      'Detection and first facts',
      'Scope and materiality determination',
      'Board, filing and notices',
      'Investors and review',
    ])
  })

  it('states the disclosure rules the generator must follow', () => {
    const text = family('gov_cyber_disclosure').promptGuidance!
    expect(text).toMatch(/Never state that the investigation must finish/)
    expect(text).toMatch(/Item 8\.01 drafts do not claim materiality/)
    expect(family('gov_ransom_decision').promptGuidance).toMatch(
      /Never name a real ransomware group/,
    )
  })

  it('infers the family from the words of a brief', () => {
    const p = governance()
    const pick = (brief: string) => chooseThreatFamily(p, brief)
    expect(pick('Is the incident material? Item 1.05 and the disclosure committee')).toBe(
      'gov_cyber_disclosure',
    )
    expect(pick('The board must decide on a ransom payment and sanctions screening')).toBe(
      'gov_ransom_decision',
    )
    expect(pick('Loss of the data center and the recovery time objective')).toBe(
      'gov_continuity_loss',
    )
    expect(pick('A cloud region outage and a single point of failure')).toBe(
      'gov_supplier_cloud_outage',
    )
    expect(pick('The CEO is unavailable: interim ceo and the authority matrix')).toBe(
      'gov_key_person_succession',
    )
    expect(pick('A subpoena arrives and counsel issues a legal hold')).toBe(
      'gov_confidential_information',
    )
  })
})

describe('media environment toolkit', () => {
  it('applies to the governance domain', () => {
    const toolkit = ToolkitSchema.parse(
      JSON.parse(readFileSync(resolve('packs/toolkits/media_environment.json'), 'utf8')),
    )
    expect(toolkit.appliesTo.domains).toContain('governance')
  })
})
