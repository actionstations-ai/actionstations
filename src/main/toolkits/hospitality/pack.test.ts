// The bundled hospitality pack (#825, #829): the domain parses with its families and arcs, the
// outbreak-at-sea toolkit parses with its knowledge inside the prompt cap, its templates exist
// with a taxonomy block and a preview that satisfies the schema, and the lint rules it names ship.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'
import { TemplateMeta } from '../../render/templates'
import { fieldLintRuleIds } from '../lint-rules'
import { GUEST_LINT_RULES } from './guest-lint'
import { OUTBREAK_LINT_RULES } from './lint'

const ROOT = join(__dirname, '../../../..')
const json = (p: string): unknown => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const domain = DomainProfile.parse(json('packs/domains/hospitality.json'))
const toolkit = ToolkitSchema.parse(json('packs/toolkits/outbreak_at_sea.json'))

const OWN_TEMPLATES = [
  'age_cumulative_report',
  'boarding_decision_memo',
  'guest_letter',
  'outbreak_response_checklist',
  'port_health_notification',
]

describe('hospitality domain', () => {
  it('has the three variants as role teams, borrowing the hotel basics by reference', () => {
    const teams = domain.roles.map((r) => r.team).join('|')
    expect(teams).toMatch(/cruise/)
    expect(teams).toMatch(/hotel and resort/)
    expect(teams).toMatch(/Tourism Board/)
    const lodging = (
      json('packs/domains/commercial_facilities.json') as { roles: { key: string }[] }
    ).roles.map((r) => r.key)
    for (const r of domain.roles) expect(lodging, r.key).not.toContain(r.key)
  })

  it('adds the six families with a usable arc and defaults to the outbreak', () => {
    const added = (domain.addedThreatFamilies ?? []).map((f) => f.id)
    expect(added).toEqual([
      'outbreak_at_sea',
      'resort_hurricane',
      'guest_death_or_injury',
      'reservation_cyber',
      'lobby_security',
      'tower_fire',
    ])
    expect(domain.threatFamilies[0]).toBe('outbreak_at_sea')
    for (const f of domain.addedThreatFamilies ?? []) {
      expect(f.phaseArc.length, f.id).toBeGreaterThanOrEqual(4)
      expect(f.decisionPointExamples.length, f.id).toBeGreaterThanOrEqual(3)
      for (const p of f.phaseArc) expect(p.beats.length, `${f.id}/${p.title}`).toBeGreaterThan(0)
    }
  })

  it('walks the outbreak arc in the dossier order', () => {
    const arc = domain.addedThreatFamilies!.find((f) => f.id === 'outbreak_at_sea')!.phaseArc
    expect(arc.map((p) => p.title)).toEqual([
      'First cluster in the medical log',
      'Threshold crossed',
      'Response, reports and guest communication',
      'Arrival and the next voyage',
      'Investigation and close-out',
    ])
  })

  it('keeps weapons and attacker methods out of the guidance', () => {
    const text = JSON.stringify(domain.addedThreatFamilies).toLowerCase()
    expect(text).not.toMatch(/exploit|payload|detonat|ammunition|how to build/)
  })

  it('suggests its toolkits and the media environment', () => {
    expect(domain.suggestedToolkits).toEqual(
      expect.arrayContaining(['outbreak_at_sea', 'epidemiology', 'weather', 'media_environment']),
    )
  })

  it('is listed by the media environment toolkit', () => {
    const media = ToolkitSchema.parse(json('packs/toolkits/media_environment.json'))
    expect(media.appliesTo.domains).toContain('hospitality')
  })
})

describe('outbreak_at_sea toolkit file', () => {
  it('fits the knowledge cap without cutting a line and carries the report points', () => {
    const out = toolkitKnowledge([toolkit])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('24 to 36 hours')
    expect(out.text).toContain('3 percent or more')
  })

  it('names the lint rules the app ships', () => {
    expect([...toolkit.lintRules].sort()).toEqual([...OUTBREAK_LINT_RULES].sort())
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(toolkit.lintRules))
  })

  it('is suggested to the congregate-setting domains it suits, and they suggest it', () => {
    for (const id of ['port_maritime', 'airport', 'campus', 'healthcare', 'hospitality']) {
      expect(toolkit.appliesTo.domains, id).toContain(id)
      const d = DomainProfile.parse(json(`packs/domains/${id}.json`))
      expect(d.suggestedToolkits, id).toContain('outbreak_at_sea')
    }
  })
})

const guest = ToolkitSchema.parse(json('packs/toolkits/guest_emergency.json'))
const GUEST_TEMPLATES = [
  'alleged_crime_report',
  'floor_evacuation_status',
  'guest_casualty_notification_checklist',
  'guest_hotline_script',
  'hurricane_guest_departure_plan',
  'man_overboard_checklist',
  'muster_accounting_report',
  'pms_outage_board',
]

describe('guest_emergency toolkit file', () => {
  it('fits the knowledge cap and carries the crime reporting rule', () => {
    const out = toolkitKnowledge([guest])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('as soon as possible')
  })

  it('names the lint rules the app ships', () => {
    expect([...guest.lintRules].sort()).toEqual([...GUEST_LINT_RULES].sort())
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(guest.lintRules))
  })

  it('is suggested by the domains it suits', () => {
    for (const id of ['hospitality', 'commercial_facilities', 'port_maritime', 'stadium_venue']) {
      expect(guest.appliesTo.domains, id).toContain(id)
      const d = DomainProfile.parse(json(`packs/domains/${id}.json`))
      expect(d.suggestedToolkits, id).toContain('guest_emergency')
    }
  })
})

describe('hospitality templates', () => {
  it('are exactly the toolkit inject types', () => {
    expect([...toolkit.injectTypes].sort()).toEqual([...OWN_TEMPLATES].sort())
    expect([...guest.injectTypes].sort()).toEqual([...GUEST_TEMPLATES].sort())
  })

  it.each([...OWN_TEMPLATES, ...GUEST_TEMPLATES])(
    '%s has a valid meta, a preview its schema accepts and a golden',
    (id) => {
      const dir = join(ROOT, 'templates/injects', id)
      for (const f of ['template.html', 'style.css', 'schema.json', 'preview.json', 'meta.json'])
        expect(existsSync(join(dir, f)), `${id}/${f}`).toBe(true)
      const meta = TemplateMeta.parse(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')))
      expect(meta.type).toBe(id)
      expect(meta.taxonomy).toBeDefined()
      expect(readdirSync(join(dir, '__golden__')).length).toBeGreaterThan(0)
      const schema = JSON.parse(readFileSync(join(dir, 'schema.json'), 'utf8'))
      const preview = JSON.parse(readFileSync(join(dir, 'preview.json'), 'utf8'))
      const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema)
      expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
    },
  )
})
