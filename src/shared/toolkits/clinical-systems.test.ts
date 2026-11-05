// The bundled clinical systems toolkit and the health informatics domain (spec 0451). Nursing
// and pharmacy toolkits reuse `clinical_systems`, so its id and the ids of its decision forms,
// figure kinds, metrics and lint rules are a contract these tests pin.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '../domains/schema'
import { toolkitKnowledge } from './compose'
import { ToolkitSchema } from './schema'

const packs = join(__dirname, '..', '..', '..', 'packs')
const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(join(packs, ...parts), 'utf8'))

const toolkit = ToolkitSchema.parse(readJson('toolkits', 'clinical_systems.json'))
const domain = DomainProfile.parse(readJson('domains', 'health_informatics.json'))

describe('clinical_systems toolkit', () => {
  it('keeps the id other fields depend on', () => {
    expect(toolkit.id).toBe('clinical_systems')
  })

  it('keeps stable decision form ids', () => {
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual([
      'declare_downtime',
      'set_restore_order',
      'message_disposition',
      'result_release',
      'record_merge',
      'isolate_devices',
      'notify',
      'return_to_normal',
      'reconcile_unit',
      'close_reconciliation',
    ])
  })

  it('names the figure kinds and lint rules the field code will provide', () => {
    expect(toolkit.figureKinds).toEqual(
      expect.arrayContaining([
        'interface_status_dashboard',
        'message_queue_series',
        'unit_status_board',
        'results_backlog',
        'reconciliation_progress',
        'downtime_timeline',
      ]),
    )
    expect(toolkit.lintRules).toEqual(['hl7v2_syntax', 'fhir_shape'])
  })

  it('asks every decision for a time so the metrics can order them', () => {
    for (const form of toolkit.decisionForms)
      expect(
        form.fields.some((f) => f.kind === 'time' && f.required),
        form.id,
      ).toBe(true)
  })

  it('tells the writer that patients are synthetic and clinical content is not advice', () => {
    const rules = toolkit.knowledge.realismRules.join(' ')
    expect(rules).toMatch(/real person's data/)
    expect(rules).toMatch(/not a clinical reference/)
  })

  it('fits the per-toolkit knowledge cap, so no rule is cut and others can stack on it', () => {
    const { text, truncated } = toolkitKnowledge([toolkit])
    expect(truncated).toEqual([])
    expect(text).toMatch(/Name no real hospital/)
    expect(text.length).toBeLessThan(2800)
  })

  it('suits the clinical domains', () => {
    expect(toolkit.appliesTo.domains).toEqual(
      expect.arrayContaining(['health_informatics', 'healthcare', 'nursing', 'pharmacy']),
    )
  })
})

describe('health_informatics domain', () => {
  it('suggests the toolkit, as do healthcare and public health', () => {
    for (const profile of [
      domain,
      readJson('domains', 'healthcare.json'),
      readJson('domains', 'public_health.json'),
    ])
      expect((profile as DomainProfile).suggestedToolkits).toContain('clinical_systems')
  })

  it('has unique role keys, the clinical IT roles and a public information role', () => {
    const keys = domain.roles.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(expect.arrayContaining(['cio', 'cmio', 'cnio', 'interface', 'him', 'pio']))
  })

  it('does not reuse the healthcare aliases', () => {
    const healthcare = DomainProfile.parse(readJson('domains', 'healthcare.json'))
    for (const alias of domain.aliases) expect(healthcare.aliases).not.toContain(alias)
  })

  it('lists its added threat families, each with a four-phase arc', () => {
    const added = domain.addedThreatFamilies ?? []
    expect(added.map((f) => f.id)).toEqual([
      'ehr_downtime',
      'interface_failure',
      'identity_overlay',
      'clinical_alert_fault',
      'device_network_loss',
      'clinical_third_party_failure',
    ])
    for (const family of added) expect(family.phaseArc, family.id).toHaveLength(4)
  })
})
