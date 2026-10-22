// Phase size (#167): the rows to trim when the first call overfills a phase, shaped like
// phase 1 of the dam live run (11 rows over 60 minutes against a max of 8).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MselRow, Role, Scenario } from '@shared/schemas'
import { overfillRows, phaseMixGaps, planMixCompletion } from './lint'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const role = (id: string, name: string, abbreviation: string): Role => ({
  id,
  name,
  abbreviation,
  team: 'Team',
  description: '',
  standingOrders: [],
})
const DAM_ROLES = [
  role('ops', 'Dam Operations Manager (Incident Commander)', 'Ops'),
  role('it', 'SCADA / IT Security Lead (Technical Lead)', 'IT'),
  role('pio', 'Public Affairs Officer', 'PIO'),
  role('security', 'Security Manager', 'Sec'),
  role('dse', 'Dam Safety Engineer', 'DSE'),
  role('ema', 'County Emergency Manager (Downstream Liaison)', 'EMA'),
]
const ALL = DAM_ROLES.map((r) => r.id)

/** The dam run's phase 1 (ids, times, tags and recipients as generated). */
const PHASE_1: [string, string, MselRow['purposeTag'], string[]][] = [
  ['START', '0:00', 'STARTEX', ALL],
  ['I-01', '0:05', 'CORE_NARRATIVE', ['ops']],
  ['I-02', '0:12', 'CLUE', ['security']],
  ['I-03', '0:18', 'TECH_HURDLE', ['it']],
  ['I-04', '0:25', 'PRESSURE', ['dse', 'ema']],
  ['I-05', '0:30', 'NOISE', ['ops']],
  ['I-06', '0:40', 'CLUE', ['security']],
  ['I-07', '0:50', 'PRESSURE', ['pio']],
  ['I-08', '0:55', 'PRESSURE', ['it']],
  ['I-09', '0:58', 'CORE_NARRATIVE', ['security']],
  ['I-10', '1:00', 'TIME_JUMP', ALL],
]

function damPhase1(): { s: Scenario; phase: Scenario['phases'][number] } {
  const s = structuredClone(FIXTURE)
  const phase = { ...s.phases[0]!, startTime: '0:00', endTime: '1:00' }
  s.phases = [phase, ...s.phases.slice(1)]
  s.roles = DAM_ROLES
  s.msel = PHASE_1.map(([id, time, purposeTag, to]) => ({
    id,
    phaseId: phase.id,
    time,
    from: 'Outside Caller',
    toRoleIds: to,
    toLabel: to === ALL ? 'All' : to.join(', '),
    event: `Event ${id}`,
    expectedAction: '',
    purposeTag,
    citations: [],
    locked: false,
  }))
  return { s, phase }
}

describe('overfillRows (#167: 11 rows in a 60-minute phase, max 8)', () => {
  it('trims to 8 and keeps every role, tag and the control cards covered', () => {
    const { s, phase } = damPhase1()
    const gapsBefore = phaseMixGaps(s, phase).map((g) => g.code)
    const drop = overfillRows(s, phase, 8)
    expect(drop.map((r) => r.id)).toEqual(['I-08', 'I-09', 'I-06'])
    const kept = s.msel.filter((r) => !drop.includes(r))
    expect(kept).toHaveLength(8)
    for (const id of ALL)
      expect(
        kept.some(
          (r) =>
            r.purposeTag !== 'STARTEX' && r.purposeTag !== 'TIME_JUMP' && r.toRoleIds.includes(id),
        ),
        id,
      ).toBe(true)
    const tags = new Set(s.msel.map((r) => r.purposeTag))
    for (const tag of tags)
      expect(
        kept.some((r) => r.purposeTag === tag),
        tag,
      ).toBe(true)
    // The TIME_JUMP that ends the phase is a transition card and stays.
    expect(kept.at(-1)?.id).toBe('I-10')
    const after = { ...s, msel: kept }
    expect(phaseMixGaps(after, phase).map((g) => g.code)).toEqual(gapsBefore)
    // Full: the mix pass has no room left to add rows.
    expect(planMixCompletion(after, phase, 8).add).toBe(0)
  })

  it('never drops locked rows, the decision point or the last row of a tag', () => {
    const { s, phase } = damPhase1()
    s.msel.find((r) => r.id === 'I-08')!.locked = true
    s.msel.find((r) => r.id === 'I-09')!.purposeTag = 'DECISION_POINT'
    const drop = overfillRows(s, phase, 8).map((r) => r.id)
    expect(drop).not.toContain('I-08')
    expect(drop).not.toContain('I-09')
    expect(drop).toEqual(['I-06'])
  })

  it('leaves a phase within its limit alone', () => {
    const { s, phase } = damPhase1()
    expect(overfillRows(s, phase, 11)).toEqual([])
  })
})
