// The pharmacy metrics (spec 0463 FR-11): each runs on the events a generator wrote and decisions
// of the toolkit forms (choice fields as option ids, as live play stores them), reruns the model
// where it can, shows its inputs, and says n/a when there is nothing to compare with.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { PHARMACY_GENERATORS } from '../../toolkits/pharmacy/simulate/generators'
import { readGroundTruth } from './inputs'
import {
  PHARMACY_DECISION_KINDS as K,
  coldChainResponse,
  diversionClocks,
  queueResponse,
  recallResponse,
  safeSubstitutions,
  shortageImpact,
  type PharmacyInputs,
} from './pharmacy'

async function eventsOf(
  generatorId: string,
  datasetId: string,
  params: object = {},
): Promise<GroundTruthEvent[]> {
  const g = PHARMACY_GENERATORS.find((x) => x.id === generatorId)!
  const data = g.generate(g.params.parse(params) as never).find((d) => d.id === datasetId)!
  const dir = mkdtempSync(join(tmpdir(), 'pharmacy-metric-'))
  writeFileSync(join(dir, 'events.json'), JSON.stringify(data.data))
  return readGroundTruth(dir, 'events.json')
}

let n = 0
const decision = (time: string, kind: string, fields: Record<string, unknown>): MetricDecision => ({
  id: `d${++n}`,
  time,
  kind,
  fields,
})
const summary = (r: { summary: { label: string; value: string }[] }, label: string): string =>
  r.summary.find((s) => s.label === label)?.value ?? 'missing'
const run = <C>(
  m: {
    configSchema: { parse(x: unknown): C }
    compute(i: PharmacyInputs, c: C): ReturnType<typeof shortageImpact.compute>
  },
  i: PharmacyInputs,
) => m.compute(i, m.configSchema.parse({}))

describe('pharmacy_shortage_impact', () => {
  it('compares decisions with the model left alone and shows both', async () => {
    const events = await eventsOf('pharmacy-shortage', 'pharmacy-shortage-events')
    const none = run(shortageImpact, { events, decisions: [] })
    expect(summary(none, 'First day the stock ran short, with your decisions')).toBe('day 4')
    const half = run(shortageImpact, {
      events,
      decisions: [
        decision('2026-11-05T08:30:00Z', K.setAllocation, { drug: 'Saline', percent: 50 }),
      ],
    })
    expect(summary(half, 'First day the stock ran short, with your decisions')).toBe('day 8')
    expect(summary(half, 'First day the stock would have run short otherwise')).toBe('day 4')
    expect(summary(half, 'Time to the first allocation decision')).toBe('30 min')
    expect(half.inputs.map((x) => x.label)).toContain('Allocation decisions recorded')
    expect(half.caveats.join(' ')).toMatch(/teaching model, not a forecast/)
    expect(half.tables![0]!.rows).toHaveLength(15)
  })

  it('splits unmet doses into held back and short of stock', async () => {
    const events = await eventsOf('pharmacy-shortage', 'pharmacy-shortage-events')
    const r = run(shortageImpact, {
      events,
      decisions: [decision('2026-11-05T08:00:00Z', K.setAllocation, { percent: 50 })],
    })
    expect(Number(summary(r, 'Held back by allocation while stock lasted'))).toBeGreaterThan(0)
  })

  it('ignores a percent outside 0 to 100 and says n/a for the time when nothing was decided', async () => {
    const events = await eventsOf('pharmacy-shortage', 'pharmacy-shortage-events')
    const r = run(shortageImpact, {
      events,
      decisions: [decision('2026-11-05T09:00:00Z', K.setAllocation, { percent: 400 })],
    })
    expect(summary(r, 'Time to the first allocation decision')).toBe('n/a')
  })

  it('says n/a without a scripted model', () => {
    const r = run(shortageImpact, { events: [], decisions: [] })
    expect(r.summary[0]!.value).toBe('n/a')
    expect(r.caveats[0]).toMatch(/no shortage model/)
  })
})

describe('pharmacy_safe_substitutions', () => {
  it('counts passed and failed checklists and the approvals that led to a scripted error', () => {
    const events: GroundTruthEvent[] = [
      {
        id: 'e1',
        time: '2026-11-05T08:00:00Z',
        kind: 'substitution_error',
        attrs: { alternative: 'Lactated Ringer 1,000 mL' },
      },
    ]
    const r = run(safeSubstitutions, {
      events,
      decisions: [
        decision('2026-11-05T09:00:00Z', K.approveSubstitution, {
          alternative: 'Lactated Ringer 1,000 mL',
          checklist_result: 'failed',
        }),
        decision('2026-11-05T09:10:00Z', K.approveSubstitution, {
          alternative: 'Dextrose 5%',
          checklist_result: 'passed_with_conditions',
          told: 'Nursing',
        }),
      ],
    })
    expect(summary(r, 'Approved with a passed checklist')).toBe('1 of 2')
    expect(summary(r, 'Approved with a failed checklist')).toBe('1')
    expect(summary(r, 'Approvals that led to a scripted error')).toBe('1')
  })

  it('says n/a when nothing was approved', () => {
    expect(
      summary(
        run(safeSubstitutions, { events: [], decisions: [] }),
        'Approved with a passed checklist',
      ),
    ).toBe('n/a')
  })
})

describe('pharmacy_cold_chain_response', () => {
  it('scores keep and discard decisions against the viability table', async () => {
    const events = await eventsOf('pharmacy-cold-chain', 'pharmacy-cold-events')
    const alarm = events.find((e) => e.kind === 'alarm')!
    const at = (min: number) => new Date(Date.parse(alarm.time) + min * 60_000).toISOString()
    const r = run(coldChainResponse, {
      events,
      decisions: [
        decision(at(20), K.moveProduct, { product: 'All', to: 'Hospital pharmacy' }),
        decision(at(60), K.viabilityDecision, { lot: 'EX-A-4410', decision: 'keep', doses: 60 }),
        decision(at(61), K.viabilityDecision, { lot: 'EX-B-1187', decision: 'discard' }),
        decision(at(62), K.viabilityDecision, { lot: 'EX-C-9021', decision: 'keep' }),
      ],
    })
    expect(summary(r, 'Time from alarm to first action')).toBe('20 min')
    expect(summary(r, 'Doses at risk')).toBe('125')
    expect(summary(r, 'Doses saved by a correct keep')).toBe('60')
    expect(summary(r, 'Doses discarded correctly')).toBe('40')
    expect(summary(r, 'Doses kept that were not usable')).toBe('25')
    expect(r.caveats.join(' ')).toMatch(/fictional product table/)
  })

  it('counts undecided product and says n/a for the time when nothing was done', async () => {
    const events = await eventsOf('pharmacy-cold-chain', 'pharmacy-cold-events')
    const r = run(coldChainResponse, { events, decisions: [] })
    expect(summary(r, 'Time from alarm to first action')).toBe('n/a')
    expect(summary(r, 'Doses still undecided or held')).toBe('125')
  })
})

describe('pharmacy_diversion_clocks', () => {
  it('checks the one business day notice and the 45 day Form 106 against the discovery date', async () => {
    const events = await eventsOf('pharmacy-diversion', 'pharmacy-diversion-events')
    const found = events.find((e) => e.kind === 'discovery')!
    expect(found.time).toBe('2026-11-05T00:00:00.000Z')
    const r = run(diversionClocks, {
      events,
      decisions: [
        decision('2026-11-05T10:00:00Z', K.startInvestigation, { action: 'review_the_data' }),
        decision('2026-11-05T12:00:00Z', K.startInvestigation, { action: 'review_patient_safety' }),
        decision('2026-11-06T16:00:00Z', K.notify, {
          recipient: 'dea_field_division_written_notice',
        }),
        decision('2026-12-30T16:00:00Z', K.notify, { recipient: 'dea_form_106_electronic' }),
      ],
    })
    expect(summary(r, 'DEA Field Division notice due (one business day)')).toBe(
      '2026-11-06T23:59:59Z',
    )
    expect(summary(r, 'DEA Field Division notice')).toBe('On time')
    expect(summary(r, 'Form 106 due (45 days, electronic)')).toBe('2026-12-20T23:59:59Z')
    expect(summary(r, 'Form 106')).toBe('Late')
    expect(summary(r, 'Patient safety step recorded')).toBe('Yes')
    expect(summary(r, 'Discovery to first investigation step')).toBe('600 min')
    expect(r.caveats.join(' ')).toMatch(/21 CFR 1301.76/)
  })

  it('treats a notice sent after the business day as late and an unsent one as not recorded', async () => {
    const events = await eventsOf('pharmacy-diversion', 'pharmacy-diversion-events')
    const r = run(diversionClocks, {
      events,
      decisions: [
        decision('2026-11-09T09:00:00Z', K.notify, {
          recipient: 'dea_field_division_written_notice',
        }),
      ],
    })
    expect(summary(r, 'DEA Field Division notice')).toBe('Late')
    expect(summary(r, 'Form 106')).toBe('Not recorded')
  })
})

describe('pharmacy_recall_response', () => {
  it('times quarantine and the first patient notice from the notice', async () => {
    const events = await eventsOf('pharmacy-recall', 'pharmacy-recall-events')
    const r = run(recallResponse, {
      events,
      decisions: [
        decision('2026-11-05T22:00:00Z', K.quarantineProduct, {
          product: 'Ondansetron',
          lots: 'EX-30417',
          count: 188,
        }),
        decision('2026-11-06T09:30:00Z', K.notify, { recipient: 'patients' }),
      ],
    })
    expect(summary(r, 'Notice to quarantine')).toBe('30 min')
    expect(summary(r, 'Notice to first patient contact')).toBe('720 min')
    expect(summary(r, 'Units recorded as quarantined')).toBe('188')
    expect(summary(r, 'Share of on-hand units quarantined')).toBe('82%')
  })

  it('says n/a without a recall notice', () => {
    expect(run(recallResponse, { events: [], decisions: [] }).summary[0]!.value).toBe('n/a')
  })
})

describe('pharmacy_queue_response', () => {
  it('shows what adding staff changed against the queue left alone', async () => {
    const events = await eventsOf('pharmacy-queue', 'pharmacy-queue-events', {
      staff: 1,
      arrivalsPerHour: 24,
      surges: [{ fromMinute: 30, toMinute: 120, arrivalsPerHour: 40 }],
    })
    const start = events.find((e) => e.kind === 'queue_model')!.time
    const at = (min: number) => new Date(Date.parse(start) + min * 60_000).toISOString()
    const r = run(queueResponse, {
      events,
      decisions: [decision(at(60), K.reassignStaff, { queue: 'Verification', staff: 3 })],
    })
    const withD = Number(
      summary(r, 'Oldest item at the peak, with your decisions').replace(' min', ''),
    )
    const without = Number(
      summary(r, 'Oldest item at the peak if nothing had changed').replace(' min', ''),
    )
    expect(withD).toBeLessThan(without)
  })
})
