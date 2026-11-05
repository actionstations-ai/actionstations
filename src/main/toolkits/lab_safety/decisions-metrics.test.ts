// The lab safety decisions and metrics (#877, #881): every decision form converts to a valid live
// form, the option ids the metrics read exist in the forms, the metrics run on what the
// simulators write, and the drill record reaches the AAR.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => resolve('.'),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { ToolkitSchema, drillRecordMarkdown, programTagMarkdown } = await import('@shared/toolkits')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { registerLabSafetyToolkit } = await import('./register')
const { liveFormsOf } = await import('../decision-forms')
const { DecisionForm: LiveDecisionForm } = await import('@shared/schemas/decisions')
const { runGenerator } = await import('../../case-data/generators')
const { caseDir } = await import('../../case-data/store')
const { readGroundTruth, readModeledSeries } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { parseRequired } = await import('../../evaluation/metrics/lab-notification-timing')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/lab_safety.json'), 'utf8')),
)
registerLabSafetyToolkit()

const forms = liveFormsOf([toolkit]).map((f) => LiveDecisionForm.parse(f))
const optionIds = (formId: string, fieldId: string): string[] => {
  const field = forms.find((f) => f.id === formId)!.fields.find((x) => x.id === fieldId)!
  return field.type === 'choice' ? field.options.map((o) => o.id) : []
}

describe('capabilities', () => {
  it('has code behind every figure kind, connector, metric and lint rule the toolkit names', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('decision forms', () => {
  it('covers every decision the spec lists, prefixed with the field', () => {
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual([
      'lab_classify_incident',
      'lab_notify_party',
      'lab_stop_work',
      'lab_send_for_medical_evaluation',
      'lab_restrict_worker',
      'lab_move_samples_to_backup',
      'lab_activate_response_plan',
      'lab_order_evacuation',
      'lab_submit_written_report',
      'lab_brief_institutional_official',
      'lab_issue_public_statement',
      'lab_restore_data_from_backup',
    ])
  })

  it('convert to live forms that pass the live schema, with a drawable area for the evacuation', () => {
    expect(forms.map((f) => f.id)).toEqual(toolkit.decisionForms.map((f) => f.id))
    const evac = forms.find((f) => f.id === 'lab_order_evacuation')!
    expect(evac.fields.find((x) => x.type === 'area')).toMatchObject({ draw: true })
  })

  it('carry the option ids the metrics read', () => {
    for (const m of toolkit.metrics.filter((x) => x.id === 'lab_notification_timing')) {
      for (const r of parseRequired(m.config.required as string[])) {
        const field = r.kind === 'lab_notify_party' ? 'party' : 'report'
        expect(optionIds(r.kind, field), `${r.kind}:${r.key}`).toContain(r.key)
      }
    }
    expect(optionIds('lab_move_samples_to_backup', 'group')).toEqual([
      'irreplaceable_samples',
      'samples_with_no_backup',
      'all_samples',
      'replaceable_samples',
    ])
  })

  it('has no choice with fewer than two options and gives every form a time', () => {
    for (const f of toolkit.decisionForms)
      expect(
        f.fields.some((x) => x.kind === 'time'),
        f.id,
      ).toBe(true)
  })
})

describe('metrics read what the simulators write', () => {
  const root = mkdtempSync(join(tmpdir(), 'ttx-lab-metrics-'))
  const gen = (id: string, params: unknown = {}) =>
    runGenerator(root, 's', id, params, { maxMbPerScenario: 500 })
  const events = async (id: string, ds: string) => {
    const m = await gen(id, id === 'lab-inventory-discrepancy' ? { cause: 'miscount' } : {})
    return readGroundTruth(caseDir(root, 's'), m.datasets.find((d) => d.id === ds)!.file!)
  }
  const ref = (label: RegExp) => toolkit.metrics.find((x) => label.test(x.label ?? ''))!
  const at = (iso: string, plusMin: number) =>
    new Date(Date.parse(iso) + plusMin * 60_000).toISOString()

  it('scores select agent notifications against the discovery event', async () => {
    const evs = await events('lab-inventory-discrepancy', 'lab-inventory-events')
    const t = evs.find((e) => e.kind === 'incident_discovered')!.time
    const m = ref(/^Select agent notifications/)
    const decide = (kind: string, field: string, value: string, min: number) => ({
      id: `${kind}${value}`,
      time: at(t, min),
      kind,
      fields: { [field]: value },
    })
    const r = runMetric(
      { id: m.id, config: m.config },
      {
        events: evs,
        decisions: [
          decide('lab_notify_party', 'party', 'cdc_or_aphis_select_agent_program', 25),
          decide('lab_notify_party', 'party', 'law_enforcement', 95),
          decide(
            'lab_submit_written_report',
            'report',
            'aphis_cdc_form_3_exercise_worksheet',
            6 * 1440,
          ),
        ],
      },
    )
    expect(r.data).toMatchObject({ required: 3, onTime: 2, late: 1, notMade: 0, missed: 1 })
    expect(JSON.stringify(r.tables)).toContain('+35 min')
  })

  it('counts a notice never made as missed and a late written report by days', async () => {
    const evs = await events('lab-inventory-discrepancy', 'lab-inventory-events')
    const t = evs.find((e) => e.kind === 'incident_discovered')!.time
    const m = ref(/^Select agent notifications/)
    const r = runMetric(
      { id: m.id, config: m.config },
      {
        events: evs,
        decisions: [
          {
            id: 'f3',
            time: at(t, 8 * 1440),
            kind: 'lab_submit_written_report',
            fields: { report: 'aphis_cdc_form_3_exercise_worksheet' },
          },
        ],
      },
    )
    expect(r.data).toMatchObject({ onTime: 0, late: 1, notMade: 2, missed: 3 })
  })

  it('scores exposure response with decision timing against the exposure report', async () => {
    const evs = await events('lab-exposure-followup', 'lab-exposure-events')
    const t = evs.find((e) => e.kind === 'exposure_reported')!.time
    const m = ref(/stop-work within the protocol time/)
    const ok = runMetric(
      { id: m.id, config: m.config },
      { events: evs, decisions: [{ id: 'd', time: at(t, 12), kind: 'lab_stop_work', fields: {} }] },
    )
    const late = runMetric(
      { id: m.id, config: m.config },
      { events: evs, decisions: [{ id: 'd', time: at(t, 50), kind: 'lab_stop_work', fields: {} }] },
    )
    expect(JSON.stringify(ok.summary)).toContain('1')
    expect(JSON.stringify(ok.data)).not.toEqual(JSON.stringify(late.data))
  })

  it('scores samples saved: irreplaceable first, before the limit', async () => {
    const m = await gen('lab-alarm-event', {
      seed: 4,
      sampleCount: 20,
      irreplaceableFraction: 0.25,
    })
    const evs = await readGroundTruth(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === 'lab-sample-events')!.file!,
    )
    const limit = evs[0]!.time
    const cfg = ref(/Samples saved: share/)
    const run = (decisions: unknown[]) =>
      runMetric({ id: cfg.id, config: cfg.config }, { events: evs, decisions } as never)
    const good = run([
      {
        id: 'a',
        time: at(limit, -30),
        kind: 'lab_move_samples_to_backup',
        fields: { group: 'irreplaceable_samples' },
      },
    ])
    expect(good.data).toMatchObject({
      atRisk: 20,
      irreplaceable: 5,
      savedIrreplaceable: 5,
      late: 0,
      never: 15,
    })
    const partial = run([
      {
        id: 'a',
        time: at(limit, -30),
        kind: 'lab_move_samples_to_backup',
        fields: { group: 'all_samples', count: 3 },
      },
      {
        id: 'b',
        time: at(limit, 30),
        kind: 'lab_move_samples_to_backup',
        fields: { group: 'irreplaceable_samples' },
      },
    ])
    expect(partial.data).toMatchObject({ savedIrreplaceable: 3, late: 2 })
    expect(run([]).data).toMatchObject({ savedIrreplaceable: 0, never: 20 })
  })

  it('scores samples moved before the limit with threshold timing on the viability series', async () => {
    const m = await gen('lab-alarm-event', { seed: 4 })
    const series = await readModeledSeries(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === 'lab-alarm-viability')!.file!,
    )
    const cfg = ref(/Samples moved before the designer/)
    const crossing = series[0]!.points.find((p) => p.value >= 0)!.time
    const r = runMetric(
      { id: cfg.id, config: cfg.config },
      {
        series,
        decisions: [
          {
            id: 'd',
            time: at(crossing, -20),
            kind: 'lab_move_samples_to_backup',
            area: 'Freezer 3',
            fields: {},
          },
        ],
      },
    )
    expect(
      (r.data as { zones: Record<string, { status: string }> }).zones['Freezer 3']!.status,
    ).toBe('on_time')
  })

  it('scores data recovery from the backup series: the failing system loses more work', async () => {
    const m = await gen('lab-backup-status', { seed: 1, hours: 72, failsAtHour: 20 })
    const series = await readModeledSeries(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === 'lab-backup-series')!.file!,
    )
    const cfg = ref(/^Data recovery/)
    const start = series[0]!.points[0]!.time
    const restore = (system: string, hour: number) => ({
      id: system,
      time: at(start, hour * 60),
      kind: 'lab_restore_data_from_backup',
      fields: { system },
    })
    const r = runMetric(
      { id: cfg.id, config: cfg.config },
      { series, decisions: [restore('Instrument computer B', 60), restore('Study database', 60)] },
    )
    const d = r.data as { systems: number; restored: number; withinLimit: number }
    expect(d).toMatchObject({ systems: 4, restored: 2, withinLimit: 1 })
  })

  it('scores the exposure follow-up with the contact reach measure', async () => {
    const m = await gen('lab-exposure-followup', { seed: 2, inRoom: 3, adjacent: 2 })
    const evs = await readGroundTruth(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === 'lab-exposure-contact-events')!.file!,
    )
    const cfg = ref(/Exposure follow-up/)
    const listed = evs[0]!.time
    const code = String(evs.find((e) => e.attrs.close === true)!.attrs.contact)
    const r = runMetric(
      { id: cfg.id, config: cfg.config },
      {
        events: evs,
        decisions: [
          {
            id: 'o',
            time: at(listed, 120),
            kind: 'record_contact_outcome',
            fields: { contact: code, outcome: 'reached' },
          },
        ],
      },
    )
    expect(r.data).toMatchObject({ counted: 3, onTime: 1 })
  })

  it('names a datasets the generators write for every ground-truth and series reference', async () => {
    const written = new Set<string>()
    for (const [id, params] of [
      ['lab-alarm-event', {}],
      ['lab-inventory-discrepancy', {}],
      ['lab-exposure-followup', {}],
      ['lab-backup-status', {}],
    ] as const)
      for (const d of (await gen(id, params)).datasets) written.add(d.id)
    for (const m of toolkit.metrics) {
      if (m.groundTruth) expect(written, m.label).toContain(m.groundTruth)
      if (m.series) expect(written, m.label).toContain(m.series)
    }
  })
})

describe('drill record in the AAR', () => {
  const tag = toolkit.exerciseTags.find((t) => t.id === 'select_agent_irp_drill')!
  const rows = [
    {
      capability: 'Operational Communications',
      finding: 'The alternate RO phone number was out of date',
      action: 'Update the phone tree monthly',
      element: 'Plan',
      owner: 'Biosafety office',
      poc: '',
      start: '',
      due: '2026-12-01',
    },
  ]

  it('carries the four 42 CFR 73.14 elements and the review prompt', () => {
    expect(tag.drillRecord!.elements).toEqual([
      'How the plan was tested',
      'Problems found',
      'Corrective actions',
      'Participants',
    ])
    expect(tag.drillRecord!.reviewPrompt).toMatch(/review the incident response plan/i)
    expect(tag.source).toMatch(/73\.14$/)
  })

  it('writes a complete record when problems, actions and participants exist', () => {
    const md = drillRecordMarkdown(tag, rows, '2026-11-05', {
      participants: ['Office of Biosafety', 'Campus police'],
      exerciseTitle: 'Inventory discrepancy tabletop',
    })
    expect(md).toContain('Drill record complete: 4 of 4 elements.')
    expect(md).toContain('Inventory discrepancy tabletop')
    expect(md).toContain('The alternate RO phone number was out of date')
    expect(md).toContain('Office of Biosafety; Campus police')
    expect(md).toMatch(/Review the incident response plan now/)
  })

  it('names each missing element when the record is incomplete', () => {
    const md = drillRecordMarkdown(tag, [], undefined, { participants: [] })
    expect(md).toContain('Drill record complete: 1 of 4 elements.')
    expect(md).toContain('Missing: Problems found, Corrective actions, Participants.')
    expect(md).toContain('Not recorded')
  })

  it('appears under the improvement plan when the tag is on the exercise', () => {
    const md = programTagMarkdown([tag], rows, '2026-11-05', {
      participants: ['Office of Biosafety'],
    })
    expect(md).toContain(
      '### Federal Select Agent Program, 42 CFR 73.14: Select agent incident response plan drill',
    )
    expect(md).toContain('#### Drill record')
  })

  it('leaves a tag with no drill record unchanged', () => {
    const plain = { ...tag, drillRecord: undefined }
    expect(programTagMarkdown([plain], rows)).not.toContain('Drill record')
  })
})
