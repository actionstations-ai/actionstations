// Spec 0450 FR-12 to FR-14 (#677): the four earth science toolkits offer the structured decisions
// in live play, configure the timing measures the registry runs, and tie their critical tasks to
// the seven Core Capabilities the spec names.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { DecisionForm } from '@shared/schemas/decisions'
import { CORE_CAPABILITY_IDS } from '@shared/core-capabilities'
import { ToolkitSchema, capabilityNotesFor, type Toolkit } from '@shared/toolkits'
import { isMetricId } from '../../evaluation/metrics/registry'
import { unknownCapabilityWarnings } from '../capabilities'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { liveFormsOf } = await import('../decision-forms')

const IDS = ['seismic', 'tsunami', 'volcanic', 'debris_flow']
const toolkit = (id: string): Toolkit =>
  ToolkitSchema.parse(JSON.parse(readFileSync(resolve('packs/toolkits', `${id}.json`), 'utf8')))
const all = IDS.map(toolkit)
const formIds = all.flatMap((t) => t.decisionForms.map((f) => f.id))

describe('FR-12 decisions', () => {
  it('cover the seven decisions the spec lists across the toolkits', () => {
    expect(formIds).toEqual(
      expect.arrayContaining([
        'change_alert_level',
        'issue_tsunami_message',
        'order_evacuation',
        'close_route',
        'close_road',
        'early_warning_action',
        'place_building_placard',
        'public_statement',
      ]),
    )
  })

  it.each(IDS)('%s forms become live forms the schema accepts', (id) => {
    const t = toolkit(id)
    const forms = liveFormsOf([t], 'Harlan Spur')
    expect(forms).toHaveLength(t.decisionForms.length)
    for (const f of forms) expect(() => DecisionForm.parse(f)).not.toThrow()
  })
})

describe('FR-13 timing metrics', () => {
  it.each(IDS)('%s names only metrics the app runs', (id) => {
    const t = toolkit(id)
    expect(t.metrics.length).toBeGreaterThan(0)
    for (const m of t.metrics) expect(isMetricId(m.id), m.id).toBe(true)
    expect(unknownCapabilityWarnings(t).filter((w) => w.includes('metric'))).toEqual([])
  })

  it('configure threshold timing for shaking, first wave, lahar and rainfall, and decision timing for alerts and tsunami messages', () => {
    const kinds = (id: string, metric: string) =>
      toolkit(id).metrics.find((m) => m.id === metric)?.config
    expect(kinds('seismic', 'threshold_timing')).toMatchObject({
      actionKind: 'early_warning_action',
    })
    expect(kinds('tsunami', 'threshold_timing')).toMatchObject({ actionKind: 'order_evacuation' })
    expect(kinds('volcanic', 'threshold_timing')).toMatchObject({ actionKind: 'order_evacuation' })
    expect(kinds('debris_flow', 'threshold_timing')).toMatchObject({ actionKind: 'close_road' })
    expect(kinds('volcanic', 'decision_timing')).toMatchObject({ eventKinds: ['eruption_onset'] })
    expect(kinds('tsunami', 'decision_timing')).toMatchObject({
      eventKinds: ['first_wave_observed'],
    })
  })
})

describe('FR-14 core capabilities', () => {
  const SPEC = [
    'public_information_and_warning',
    'situational_assessment',
    'operational_coordination',
    'mass_care_services',
    'critical_transportation',
    'infrastructure_systems',
    'mass_search_and_rescue_operations',
  ]

  it('name only real Core Capabilities, each with critical tasks', () => {
    for (const t of all)
      for (const c of t.capabilities) {
        expect(CORE_CAPABILITY_IDS as readonly string[], `${t.id}: ${c.coreCapability}`).toContain(
          c.coreCapability,
        )
        expect(c.criticalTasks.length, `${t.id}: ${c.coreCapability}`).toBeGreaterThan(0)
      }
  })

  it('give every capability in the spec critical tasks from at least one toolkit', () => {
    for (const id of SPEC)
      expect(capabilityNotesFor(all, id).criticalTasks.length, id).toBeGreaterThan(0)
  })

  it('give public information and warning tasks to every toolkit', () => {
    for (const t of all)
      expect(
        capabilityNotesFor([t], 'public_information_and_warning').criticalTasks.length,
      ).toBeGreaterThan(0)
  })
})
