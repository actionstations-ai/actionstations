// Deterministic repairs (#90, M2 exit run): player-sourced injects and rubric links to rows
// that do not exist. Role names and ids mirror the qwen3-30b "Lights Out" run.
import { describe, expect, it } from 'vitest'
import type { MselPhaseOutput, MselRow, Role } from '@shared/schemas'
import { repairPlayerSources, repairRubricLinks, resolveInjectId } from './sources'

const role = (id: string, abbreviation: string, name: string): Role => ({
  id,
  name,
  abbreviation,
  team: '',
  description: '',
  standingOrders: [],
})

const ROLES: Role[] = [
  role('ops', 'IC', 'Airport Operations Manager (Incident Commander)'),
  role('it', 'TIC', 'IT Director (Technical Incident Command)'),
  role('pio', 'PIO', 'Public Information Officer (Media Liaison)'),
  role('security', 'LEO', 'Chief of Security (Law Enforcement)'),
]

type Out = MselPhaseOutput['rows'][number]
const out = (id: string, from: string, format: string, event: string): Out => ({
  id,
  time: '1:00',
  from,
  to: ['ops'],
  event,
  expectedAction: 'Ops verifies.',
  purposeTag: 'CORE_NARRATIVE',
  format,
  citations: [],
})

describe('repairPlayerSources', () => {
  it('re-sources injects whose source is a player role, by channel', () => {
    const { rows, repairs } = repairPlayerSources(
      [
        out('I-03', 'IT Director', 'system_log', 'System Log: ALCS database file encrypted.'),
        out('I-09b', 'Security', 'system_alert', 'Alert: PACS shows Door 101 stuck open.'),
        out('I-27', 'Airport Operations', 'radio_call', "Radio Call: 'Runway 5/23 check done.'"),
        out('I-29', 'PIO', 'press_release', 'Press Release: the airport is reopening.'),
        out('I-30', 'ATCT', 'radio_call', 'Radio Call: Tower here.'),
      ],
      ROLES,
    )
    expect(rows.map((r) => r.from)).toEqual([
      'System Alert',
      'System Alert',
      'Field Unit (radio)',
      'Local Media',
      'ATCT',
    ])
    expect(repairs.map((r) => r.rowId)).toEqual(['I-03', 'I-09b', 'I-27', 'I-29'])
    expect(repairs.every((r) => !r.converted)).toBe(true)
  })

  it("turns a player's own decision into a facilitator prompt with the decision as expected action", () => {
    const { rows, repairs } = repairPlayerSources(
      [
        out(
          'I-12',
          'Airport Operations Manager',
          'memo',
          'The Incident Commander activates Unified Command and orders manual operations.',
        ),
      ],
      ROLES,
    )
    expect(repairs).toEqual([
      { rowId: 'I-12', from: 'Airport Operations Manager', to: 'Facilitator', converted: true },
    ])
    expect(rows[0]!.from).toBe('Facilitator')
    expect(rows[0]!.event).toMatch(/^Facilitator prompt to IC:/)
    expect(rows[0]!.expectedAction).toMatch(/^The Incident Commander activates Unified Command/)
  })
})

const row = (id: string): MselRow => ({
  id,
  phaseId: 'P1',
  time: '0:10',
  from: 'x',
  toRoleIds: [],
  event: id,
  expectedAction: '',
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  locked: false,
})

describe('rubric link repair', () => {
  const msel = ['START', 'I-01', 'I-08', 'I-13b', 'I-17', 'I-18c', 'I-23c', 'END'].map(row)

  it('maps unknown ids onto real rows or drops them', () => {
    expect(resolveInjectId('I-08b', msel)).toBe('I-08')
    expect(resolveInjectId('I-17b', msel)).toBe('I-17')
    expect(resolveInjectId('I-1', msel)).toBe('I-01')
    expect(resolveInjectId('I-13', msel)).toBe('I-13b')
    expect(resolveInjectId('I-16', msel)).toBe('I-17')
    expect(resolveInjectId('I-40', msel)).toBeUndefined()
    expect(resolveInjectId('Phase 2', msel)).toBeUndefined()
  })

  it('rewrites each metric and reports what changed', () => {
    const metrics = [
      { name: 'Ops', linkedInjectIds: ['I-01', 'I-08b', 'I-08', 'I-40'] },
      { name: 'Doctrine', linkedInjectIds: ['I-23c'] },
    ]
    const repairs = repairRubricLinks(metrics, msel)
    expect(metrics[0]!.linkedInjectIds).toEqual(['I-01', 'I-08'])
    expect(metrics[1]!.linkedInjectIds).toEqual(['I-23c'])
    expect(repairs).toEqual([
      { metric: 'Ops', from: 'I-08b', to: 'I-08' },
      { metric: 'Ops', from: 'I-40' },
    ])
  })
})
