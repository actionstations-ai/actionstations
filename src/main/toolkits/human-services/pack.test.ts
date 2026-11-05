// The bundled human services pack (spec 0464): the domain and the safeguards toolkit parse and
// agree, the knowledge fits the prompt cap uncut, the templates exist and their previews
// validate, the safeguards reach the briefing, the Exercise Plan and the handbook.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it, vi } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { safeguardNotice, toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'
import { TemplateMeta } from '../../render/templates'
import { unknownCapabilityWarnings } from '../capabilities'
import { HS_SAFEGUARD_RULES } from './register-lint'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { hseepFixtureModel } = await import('../../../../tests/fixtures/export/model')
const { hseepBlocks, textOf } = await import('../../export/hseep')
const { briefingWithNotice } = await import('../../export/safeguards')

const ROOT = join(__dirname, '../../../..')
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/behavioral_safeguards.json'))
const domain = DomainProfile.parse(read('packs/domains/human_services.json'))

const OWN_TEMPLATES = ['content_notice_card', 'facilitator_wellbeing_check', 'pfa_handout']

describe('behavioral_safeguards toolkit file', () => {
  it('has a stable id and fits the knowledge cap without cutting a line', () => {
    expect(toolkit.id).toBe('behavioral_safeguards')
    const out = toolkitKnowledge([toolkit])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('died by suicide')
    expect(out.text).toContain('EXERCISE')
  })

  it('names the lint rules the app ships and has code for every capability', () => {
    expect(toolkit.lintRules.sort()).toEqual(HS_SAFEGUARD_RULES.map((r) => r.id).sort())
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('lists the eight core actions of psychological first aid with a source', () => {
    const pfa = toolkit.knowledge.glossary.find((g) => g.term.startsWith('Psychological first aid'))
    expect(pfa?.definition).toMatch(/NCTSN/)
    for (const a of ['contact and engagement', 'safety and comfort', 'stabilization'])
      expect(pfa?.definition).toContain(a)
  })
})

describe('human_services domain', () => {
  it('parses, suggests the safeguards and the media environment toolkits', () => {
    expect(domain.id).toBe('human_services')
    expect(domain.suggestedToolkits).toEqual(
      expect.arrayContaining(['behavioral_safeguards', 'media_environment']),
    )
  })

  it('adds the six threat families, each with a four phase arc, and defaults to the surge', () => {
    const ids = (domain.addedThreatFamilies ?? []).map((f) => f.id)
    expect(ids).toEqual([
      'hs_crisis_surge',
      'hs_shelter_operations',
      'hs_reunification',
      'hs_displaced_children',
      'hs_responder_stress',
      'hs_service_degradation',
    ])
    expect(domain.threatFamilies[0]).toBe('hs_crisis_surge')
    for (const f of domain.addedThreatFamilies ?? []) expect(f.phaseArc, f.id).toHaveLength(4)
  })

  it('carries the safe messaging guard in every crisis-adjacent family', () => {
    const guarded = ['hs_crisis_surge', 'hs_responder_stress', 'hs_service_degradation']
    for (const f of domain.addedThreatFamilies ?? [])
      if (guarded.includes(f.id)) expect(f.promptGuidance, f.id).toMatch(/never describe methods/)
  })

  it('has the mass care, crisis line, reunification and child welfare role teams', () => {
    const teams = new Set(domain.roles.map((r) => r.team))
    for (const t of ['Crisis line', 'Mass care', 'Reunification', 'Child welfare'])
      expect(teams.has(t), t).toBe(true)
  })

  it('lists the six Core Capabilities of the spec', () => {
    expect(domain.coreCapabilities).toEqual([
      'mass_care_services',
      'public_information_and_warning',
      'operational_communications',
      'operational_coordination',
      'situational_assessment',
      'health_and_social_services',
    ])
  })
})

describe('safeguards', () => {
  it('turn on for a crisis scenario and stay off for an unrelated one', () => {
    const on = safeguardNotice([toolkit], 'A 988 surge after a community tragedy')
    expect(on?.toolkitIds).toEqual(['behavioral_safeguards'])
    expect(on?.stopAndStepOut[0]).toMatch(/step out/)
    expect(safeguardNotice([toolkit], 'A river flood with a forecast crest')).toBeUndefined()
  })

  it('open the briefing once with the content notice', () => {
    const notice = safeguardNotice([toolkit], 'suicide')
    const once = briefingWithNotice('# Briefing\n\nWelcome.', notice)
    expect(once.startsWith('## Content notice')).toBe(true)
    expect(briefingWithNotice(once, notice)).toBe(once)
    expect(briefingWithNotice('# Briefing', undefined)).toBe('# Briefing')
  })

  it('reach the Exercise Plan for players and the handbook for facilitators', () => {
    const model = { ...hseepFixtureModel(), safeguards: safeguardNotice([toolkit], 'suicide') }
    const plan = textOf(hseepBlocks(model, 'explan'))
    expect(plan).toContain('Content Notice')
    expect(plan).toContain('step out')
    const book = textOf(hseepBlocks(model, 'handbook_hseep'))
    expect(book).toContain('Wellbeing Check')
    expect(book).toContain('Stop and Step Out')
    expect(textOf(hseepBlocks(hseepFixtureModel(), 'explan'))).not.toContain('Content Notice')
  })
})

describe('templates', () => {
  it.each(OWN_TEMPLATES)('%s has a valid meta, a preview its schema accepts', (id) => {
    const dir = join(ROOT, 'templates/injects', id)
    for (const f of ['template.html', 'style.css', 'schema.json', 'preview.json', 'meta.json'])
      expect(existsSync(join(dir, f)), `${id}/${f}`).toBe(true)
    const meta = TemplateMeta.parse(read(`templates/injects/${id}/meta.json`))
    expect(meta.type).toBe(id)
    expect(meta.taxonomy).toBeDefined()
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(
      read(`templates/injects/${id}/schema.json`),
    )
    const preview = read(`templates/injects/${id}/preview.json`)
    expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
    expect(toolkit.injectTypes).toContain(id)
  })

  it('shows only fictional numbers and the EXERCISE marking on the handout', () => {
    const preview = JSON.stringify(read('templates/injects/pfa_handout/preview.json'))
    expect(preview).toContain('555-0142')
    expect(preview).not.toMatch(/\b988\b/)
    const html = readFileSync(join(ROOT, 'templates/injects/pfa_handout/template.html'), 'utf8')
    expect(html).toContain('EXERCISE')
  })
})
