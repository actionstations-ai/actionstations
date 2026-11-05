// The clinical care metrics on worked examples (spec 0452 FR-14): each shows its inputs, handles
// the choice ids the live forms record, and says n/a instead of zero when nothing was decided.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CaseStudyAnswer } from '@shared/schemas'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { ToolkitSchema } from '@shared/toolkits'
import { DecisionForm as LiveForm } from '@shared/schemas/decisions'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => resolve('.'),
    getPath: () => '/tmp',
    on: () => undefined,
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { runMetric, isMetricId, metricIds } = await import('./registry')
const { registerClinicalToolkit, CLINICAL_METRIC_IDS } =
  await import('../../toolkits/clinical/register')
const { liveFormsOf } = await import('../../toolkits/decision-forms')
const { unknownCapabilityWarnings } = await import('../../toolkits/capabilities')

registerClinicalToolkit()
registerClinicalToolkit()

const T0 = '2026-11-04T10:00:00.000Z'
const at = (min: number): string => new Date(Date.parse(T0) + min * 60_000).toISOString()
const ev = (
  id: string,
  kind: string,
  min: number,
  attrs: Record<string, unknown> = {},
): GroundTruthEvent => ({
  id,
  kind,
  time: at(min),
  attrs,
})
const dec = (
  id: string,
  kind: string,
  min: number,
  fields: Record<string, unknown>,
): MetricDecision => ({
  id,
  kind,
  time: at(min),
  fields,
})
const run = (
  id: string,
  bag: Parameters<typeof runMetric>[1],
  config: Record<string, unknown> = {},
) => runMetric({ id, config }, bag)
const summary = (r: ReturnType<typeof run>, label: string) =>
  r.summary.find((s) => s.label === label)?.value

describe('registration', () => {
  it('registers all nine metrics and the toolkit names no id the app lacks', () => {
    for (const id of CLINICAL_METRIC_IDS) expect(isMetricId(id), id).toBe(true)
    expect(
      metricIds().filter((id) => (CLINICAL_METRIC_IDS as readonly string[]).includes(id)),
    ).toHaveLength(9)
    const toolkit = ToolkitSchema.parse(
      JSON.parse(readFileSync(resolve('packs/toolkits/clinical_care.json'), 'utf8')),
    )
    expect(toolkit.metrics.map((m) => m.id).sort()).toEqual([...CLINICAL_METRIC_IDS].sort())
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('turns every toolkit decision form into a valid live form whose id is the metric decision kind', () => {
    const toolkit = ToolkitSchema.parse(
      JSON.parse(readFileSync(resolve('packs/toolkits/clinical_care.json'), 'utf8')),
    )
    const forms = liveFormsOf([toolkit]).map((f) => LiveForm.parse(f))
    expect(forms.map((f) => f.id)).toEqual([
      'assign_nurse',
      'call_rapid_response',
      'escalate_staffing_shortage',
      'set_evacuation_order',
      'triage_arrival',
      'isolate_or_cohort',
      'request_transfer',
      'disclose_event',
      'notify',
    ])
    const triage = forms
      .find((f) => f.id === 'triage_arrival')!
      .fields.find((f) => f.id === 'category')
    expect(triage).toMatchObject({ type: 'choice' })
    expect((triage as { options: { id: string }[] }).options.map((o) => o.id)).toContain(
      'immediate_red',
    )
  })
})

describe('handoff_quality', () => {
  it('counts complete, partial and missing SBARs from the recorded choice ids', () => {
    const r = run('handoff_quality', {
      decisions: [
        dec('1', 'call_rapid_response', 1, { patient: 'A', sbar_done: 'yes_complete' }),
        dec('2', 'call_rapid_response', 2, { patient: 'B', sbar_done: 'yes_parts_missing' }),
        dec('3', 'call_rapid_response', 3, { patient: 'C', sbar_done: 'no' }),
      ],
    })
    expect(summary(r, 'Calls with a complete SBAR')).toBe('1 of 3')
    expect(summary(r, 'Calls with parts missing')).toBe('1')
    expect(summary(r, 'Calls with no SBAR')).toBe('1')
  })

  it('says n/a when no call was made', () => {
    expect(summary(run('handoff_quality', {}), 'Calls with a complete SBAR')).toBe('n/a')
  })
})

describe('time_to_escalation', () => {
  const events = [
    ev('s1', 'abnormal_early_warning_score', 0, { patient: 'Marcus Delgado' }),
    ev('l1', 'critical_lab', 5, { test: 'Lactate' }),
  ]

  it('measures first abnormal score to the call for the same patient and critical lab to provider', () => {
    const r = run('time_to_escalation', {
      events,
      decisions: [
        dec('n0', 'notify', 3, { who: 'Charge nurse', what: 'x' }),
        dec('c1', 'call_rapid_response', 12, {
          patient: 'marcus delgado',
          sbar_done: 'yes_complete',
        }),
        dec('n1', 'notify', 9, { who: 'Covering provider', what: 'lactate 4.8' }),
      ],
    })
    expect(summary(r, 'Mean minutes, first abnormal score to call')).toBe('12 min')
    expect(summary(r, 'Escalated within 15 minutes')).toBe('1 of 1')
    expect(summary(r, 'Mean minutes, critical lab to provider notification')).toBe('4 min')
  })

  it('does not match a call for another patient, and says so', () => {
    const r = run('time_to_escalation', {
      events,
      decisions: [dec('c1', 'call_rapid_response', 12, { patient: 'Someone Else' })],
    })
    expect(summary(r, 'Abnormal scores escalated')).toBe('0 of 1')
    expect(summary(r, 'Mean minutes, first abnormal score to call')).toBe('n/a')
  })
})

describe('triage_accuracy', () => {
  const victims = [
    ev('v1', 'triage_victim', 0, { patient: 'T-1', tag: 'Immediate' }),
    ev('v2', 'triage_victim', 0, { patient: 'T-2', tag: 'Delayed' }),
    ev('v3', 'triage_victim', 0, { patient: 'T-3', tag: 'Minor' }),
    ev('v4', 'triage_victim', 0, { patient: 'T-4', tag: 'Delayed' }),
  ]

  it('counts correct, under-triage, over-triage and not triaged against the scripted key', () => {
    const r = run('triage_accuracy', {
      events: victims,
      decisions: [
        dec('1', 'triage_arrival', 2, { patient: 'T-1', category: 'immediate_red' }),
        dec('2', 'triage_arrival', 3, { patient: 'T-2', category: 'minor_green' }),
        dec('3', 'triage_arrival', 4, { patient: 'T-3', category: 'immediate_red' }),
      ],
    })
    expect(summary(r, 'Victims triaged')).toBe('3 of 4')
    expect(summary(r, 'Under-triage (a lower priority than the key)')).toBe('1')
    expect(summary(r, 'Over-triage (a higher priority than the key)')).toBe('1')
    expect(summary(r, 'Not triaged')).toBe('1')
    expect(summary(r, 'Correct')).toBe('1 of 3 (0.333)')
  })
})

describe('evacuation_order', () => {
  const key = ev('k', 'evacuation_priority', 0, {
    order: ['Elena Marsh', 'Walter Pruitt', 'Dana Whitfield', 'Raj Patel'],
  })

  it('scores a matching order 1 and a reversed order low, and counts the first patients', () => {
    const same = run('evacuation_order', {
      events: [key],
      decisions: [
        dec('d', 'set_evacuation_order', 5, {
          ranking: '1. Elena Marsh\n2. Walter Pruitt\n3. Dana Whitfield\n4. Raj Patel',
          reasons: 'dependency',
        }),
      ],
    })
    expect(summary(same, 'Agreement with the key order')).toBe('1.000')
    expect(summary(same, "Key's first 3 among the players' first 3")).toBe('3 of 3')
    const reversed = run('evacuation_order', {
      events: [key],
      decisions: [
        dec('d', 'set_evacuation_order', 5, {
          ranking: 'Raj Patel, Dana Whitfield, Walter Pruitt, Elena Marsh',
          reasons: '',
        }),
      ],
    })
    expect(summary(reversed, 'Agreement with the key order')).toBe('0.000')
    expect(summary(reversed, 'Reasons recorded')).toBe('No')
  })

  it('says n/a without an order', () => {
    expect(
      summary(run('evacuation_order', { events: [key] }), 'Agreement with the key order'),
    ).toBe('n/a')
  })
})

describe('staffing_ratio_exceedances', () => {
  it('counts assignments above the target and the minutes to the first escalation', () => {
    const r = run('staffing_ratio_exceedances', {
      decisions: [
        dec('a1', 'assign_nurse', 0, { patient: 'p1', nurse: 'RN 1', ratio: 5 }),
        dec('a2', 'assign_nurse', 10, { patient: 'p2', nurse: 'RN 2', ratio: 7 }),
        dec('a3', 'assign_nurse', 20, { patient: 'p3', nurse: 'RN 2', ratio: 8 }),
        dec('e1', 'escalate_staffing_shortage', 25, { to: 'house_supervisor', shortfall: 2 }),
      ],
    })
    expect(summary(r, 'Assignments above the target')).toBe('2 of 3')
    expect(summary(r, 'Highest ratio assigned')).toBe('8')
    expect(summary(r, 'Minutes from first exceedance to an escalation')).toBe('15 min')
  })

  it('reports no escalation when there was an exceedance and no call', () => {
    const r = run('staffing_ratio_exceedances', {
      decisions: [dec('a', 'assign_nurse', 0, { patient: 'p', nurse: 'n', ratio: 9 })],
    })
    expect(summary(r, 'Minutes from first exceedance to an escalation')).toBe('No escalation')
  })
})

describe('infection_control_decisions', () => {
  it('matches a decision to a case by room and compares action and precautions to the script', () => {
    const r = run('infection_control_decisions', {
      events: [
        ev('c1', 'infection_case', 0, {
          room: '408',
          expectedAction: 'Cohort together',
          expectedPrecautions: 'Contact',
        }),
        ev('c2', 'infection_case', 0, {
          room: '412',
          expectedAction: 'Single room isolation',
          expectedPrecautions: 'Contact',
        }),
      ],
      decisions: [
        dec('d1', 'isolate_or_cohort', 6, {
          patients: 'Rooms 408 and 410',
          action: 'cohort_together',
          precautions: 'contact',
        }),
        dec('d2', 'isolate_or_cohort', 8, {
          patients: 'Room 412',
          action: 'cohort_together',
          precautions: 'contact',
        }),
      ],
    })
    expect(summary(r, 'Cases with a decision')).toBe('2 of 2')
    expect(summary(r, 'Action and precautions as scripted')).toBe('1 of 2')
  })
})

describe('disclosure_timing', () => {
  it('compares the first conversation after the event with the target and names the lead', () => {
    const r = run('disclosure_timing', {
      events: [ev('h', 'harm_event', 0, { title: 'Insulin overdose' })],
      decisions: [
        dec('d', 'disclose_event', 45, {
          who_discloses: 'A. Brooks',
          to_whom: 'Patient',
          time: '10:45',
        }),
      ],
    })
    expect(summary(r, 'Disclosed within the target')).toBe('1 of 1')
    expect(summary(r, 'Mean minutes from event to disclosure')).toBe('45 min')
    expect(summary(r, 'Conversations with a named lead')).toBe('1 of 1')
  })

  it('counts a late disclosure as late and an event can set its own target', () => {
    const late = run('disclosure_timing', {
      events: [ev('h', 'harm_event', 0)],
      decisions: [dec('d', 'disclose_event', 90, { who_discloses: 'A. Brooks' })],
    })
    expect(summary(late, 'Disclosed within the target')).toBe('0 of 1')
    const custom = run('disclosure_timing', {
      events: [ev('h', 'harm_event', 0, { targetMinutes: 120 })],
      decisions: [dec('d', 'disclose_event', 90, { who_discloses: 'A. Brooks' })],
    })
    expect(summary(custom, 'Disclosed within the target')).toBe('1 of 1')
  })
})

describe('downtime_workflow_time', () => {
  it('measures the outage to the paper workflow decision of the configured kind', () => {
    const r = run('downtime_workflow_time', {
      events: [ev('o', 'downtime_start', 0, { system: 'EHR' })],
      decisions: [dec('d', 'start_downtime_workflow', 20, {})],
    })
    expect(summary(r, 'Mean minutes, outage to paper workflows')).toBe('20 min')
    expect(summary(r, 'Started within 30 minutes')).toBe('1 of 1')
  })
})

describe('clinical_judgment_profile', () => {
  const answer = (
    promptId: string,
    step: CaseStudyAnswer['step'],
    score: number,
  ): CaseStudyAnswer => ({
    stageId: 's1',
    promptId,
    step,
    response: [],
    score,
    answeredAt: T0,
  })

  it('averages each step over finished runs and names the lowest', () => {
    const r = run('clinical_judgment_profile', {
      datasets: {
        case_study_runs: [
          {
            id: 'r1',
            learner: 'A',
            mode: 'individual',
            answers: [answer('p1', 'recognize_cues', 1), answer('p2', 'take_action', 0.4)],
          },
          {
            id: 'r2',
            mode: 'group',
            answers: [answer('p1', 'recognize_cues', 0.5), answer('p2', 'take_action', 0.2)],
          },
        ],
      },
    })
    expect(summary(r, 'Overall score')).toBe('53%')
    expect(summary(r, 'Lowest step')).toBe('Take action (30%)')
    expect(r.caveats.join(' ')).toMatch(/not NCLEX|no claim of equivalence/)
  })

  it('says n/a with no runs', () => {
    expect(summary(run('clinical_judgment_profile', {}), 'Overall score')).toBe('n/a')
  })
})

describe('the judgment profile input provider', () => {
  it('reads only finished runs that are not previews', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { judgmentRunsProvider } = await import('../../toolkits/clinical/register')
    const store = await import('../../casestudy/store')
    const runs = await import('../../casestudy/run')
    const { draftFromTrajectory } = await import('../../casestudy/from-trajectory')
    const root = await mkdtemp(join(tmpdir(), 'judgment-'))
    try {
      await store.saveCaseStudy(root, draftFromTrajectory({ id: 'c1', kind: 'sepsis', seed: 2 }))
      const preview = await runs.startRun(root, {
        caseId: 'c1',
        mode: 'individual',
        acknowledged: true,
        preview: true,
      })
      await store.saveRun(root, { ...preview, finishedAt: '2026-11-04T11:00:00.000Z' })
      await store.reviewCaseStudy(root, 'c1', { by: 'R', note: '' })
      const open = await runs.startRun(root, {
        caseId: 'c1',
        mode: 'individual',
        acknowledged: true,
      })
      const done = await runs.startRun(root, {
        caseId: 'c1',
        mode: 'group',
        learner: 'Group A',
        acknowledged: true,
      })
      await store.saveRun(root, { ...done, finishedAt: '2026-11-04T11:30:00.000Z' })
      expect(open.finishedAt).toBeUndefined()
      const ref = { id: 'clinical_judgment_profile', config: {} }
      const bag = await judgmentRunsProvider({ root, scenarioId: 's', ref })
      const got = bag.datasets!.case_study_runs as { id: string; mode: string }[]
      expect(got.map((r) => r.id)).toEqual([done.id])
      expect(got[0]!.mode).toBe('group')
      const other = await judgmentRunsProvider({
        root,
        scenarioId: 's',
        ref: { ...ref, config: { caseId: 'nope' } },
      })
      expect(other.datasets!.case_study_runs).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('decisions as the session log records them', () => {
  it('reads structured decisions of the clinical forms into the metrics', async () => {
    const { decisionsFromLog } = await import('./inputs')
    const entry = (i: number, min: number, kind: string, fields: Record<string, unknown>) => ({
      i,
      at: at(min),
      kind: 'decision.submit',
      data: { structured: { kind, fields } },
    })
    const decisions = decisionsFromLog([
      entry(1, 2, 'triage_arrival', { patient: 'T-1', category: 'immediate_red' }),
      entry(2, 3, 'triage_arrival', { patient: 'T-2', category: 'minor_green' }),
      { i: 3, at: at(4), kind: 'note', data: {} },
    ])
    expect(decisions.map((d) => d.kind)).toEqual(['triage_arrival', 'triage_arrival'])
    const r = run('triage_accuracy', {
      events: [
        ev('v1', 'triage_victim', 0, { patient: 'T-1', tag: 'Immediate' }),
        ev('v2', 'triage_victim', 0, { patient: 'T-2', tag: 'Delayed' }),
      ],
      decisions,
    })
    expect(summary(r, 'Correct')).toBe('1 of 2 (0.500)')
  })
})
