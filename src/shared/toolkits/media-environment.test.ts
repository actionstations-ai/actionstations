// The bundled media environment toolkit and crisis communications domain (spec 0458): the files
// parse, every domain suggests the toolkit, and a brief about the press proposes it.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '../domains/schema'
import { ToolkitSchema, suggestToolkits } from './index'
import { INJECT_TYPE_IDS } from '../taxonomy'

const json = (p: string) => JSON.parse(readFileSync(resolve(p), 'utf8'))
const toolkit = ToolkitSchema.parse(json('packs/toolkits/media_environment.json'))
const domainFiles = readdirSync(resolve('packs/domains')).filter((f) => f.endsWith('.json'))

describe('media_environment toolkit', () => {
  it('has decisions for every communications decision named in the spec', () => {
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual([
      'issue_holding_statement',
      'approve_release',
      'respond_to_reporter',
      'issue_correction',
      'schedule_press_conference',
      'escalate',
      'request_platform_action',
      'hold_or_publish',
      'request_second_source',
    ])
  })

  it('reuses existing inject types rather than copying them', () => {
    for (const t of ['tweet', 'news_article', 'press_release', 'reporter_email'])
      expect(toolkit.injectTypes).toContain(t)
    for (const t of toolkit.injectTypes) expect(INJECT_TYPE_IDS, t).toContain(t)
  })

  it('states that fictional names and simulated models are the rule', () => {
    const rules = toolkit.knowledge.realismRules.join(' ')
    expect(rules).toMatch(/teaching models/)
    expect(rules).toMatch(/never a real person/)
    expect(toolkit.knowledge.productConventions.join(' ')).toMatch(/fictional/)
  })

  it('applies to every bundled domain profile', () => {
    for (const file of domainFiles) {
      const id = file.replace(/\.json$/, '')
      if (id === 'generic') continue
      expect(toolkit.appliesTo.domains, id).toContain(id)
    }
  })
})

describe('domain profiles suggest the toolkit', () => {
  it.each(domainFiles)('%s lists media_environment', (file) => {
    const profile = DomainProfile.parse(json(`packs/domains/${file}`))
    expect(profile.suggestedToolkits).toContain('media_environment')
  })
})

describe('crisis_comms domain profile', () => {
  const profile = DomainProfile.parse(json('packs/domains/crisis_comms.json'))

  it('adds the five threat families and defaults to organizational crisis', () => {
    expect(profile.threatFamilies[0]).toBe('organizational_crisis')
    expect((profile.addedThreatFamilies ?? []).map((f) => f.id)).toEqual([
      'organizational_crisis',
      'disaster_public_information',
      'information_disorder',
      'newsroom_breaking_news',
      'comms_service_degradation',
    ])
    for (const f of profile.addedThreatFamilies ?? []) {
      expect(f.phaseArc.length, f.id).toBe(4)
      expect(() => new RegExp(f.lint.decisionMustMention?.pattern ?? '', 'i')).not.toThrow()
    }
  })

  it('has roles for the four variants', () => {
    const teams = new Set(profile.roles.map((r) => r.team))
    for (const t of ['Communications team', 'Joint information center', 'Newsroom'])
      expect(teams.has(t), t).toBe(true)
    expect(profile.roles.some((r) => /spokesperson/i.test(r.name))).toBe(true)
    expect(profile.roles.some((r) => /verification/i.test(r.name))).toBe(true)
  })
})

describe('suggesting the toolkit', () => {
  const base = { available: [toolkit], active: [] as string[], domainId: 'generic' }

  it('proposes it when the brief mentions a rumor or a viral post', () => {
    const got = suggestToolkits({ ...base, text: 'A rumor about the closure spreads online.' })
    expect(got).toEqual([{ toolkitId: 'media_environment', reason: 'The brief mentions "rumor".' }])
  })

  it('proposes it for a holding statement and a press conference', () => {
    const got = suggestToolkits({ ...base, text: 'Practice a holding statement before the call.' })
    expect(got[0]?.reason).toContain('holding statement')
  })

  it('does not propose it for an unrelated brief on a domain that does not suggest it', () => {
    expect(suggestToolkits({ ...base, text: 'A pump fails at the plant.' })).toEqual([])
  })
})
