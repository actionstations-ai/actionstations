// Threat-family and profile-aware lint rules (ADR-0014): a drone incident needs no technical
// clue every phase but its decision point must involve law enforcement / the airspace
// authority; a cyber incident keeps the IT-clue rule; profile role words find the roles.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Scenario } from '@shared/schemas'
import { domainContext } from './domain'
import { DECISION_POINT_SCOPE, lintScenario, phaseMixGaps, pickDecisionRow } from './lint'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const clone = (): Scenario => structuredClone(FIXTURE)
const codes = (s: Scenario, domain?: ReturnType<typeof domainContext>): string[] =>
  lintScenario(s, domain).map((w) => w.code)

describe('lint with a domain context', () => {
  it('keeps the IT-clue rule for a cyber incident and drops it for a drone incident', () => {
    const s = clone()
    const phase2 = s.phases[1]!.id
    s.msel = s.msel.filter((r) => r.phaseId !== phase2 || r.purposeTag === 'TIME_JUMP')
    const cyber = domainContext(
      { orgType: 'airport' },
      { brief: { ...s.brief, threatFamily: 'cyber' } },
    )
    expect(codes(s, cyber)).toContain('MIX_NO_IT_CLUE')
    const drone = domainContext(
      { orgType: 'airport' },
      { brief: { ...s.brief, threatFamily: 'uas_drone' } },
    )
    expect(codes(s, drone)).not.toContain('MIX_NO_IT_CLUE')
    expect(codes(s, drone)).not.toContain('MIX_NO_CLUE')
    // The public-information pressure rule applies to every family.
    expect(codes(s, drone)).toContain('MIX_NO_PIO_PRESSURE')
    // Without a context, the brief's family (none → cyber) applies: the pre-profile behaviour.
    expect(codes(s)).toContain('MIX_NO_IT_CLUE')
  })

  it('requires a drone decision point to involve law enforcement or the airspace authority', () => {
    const s = clone()
    const dp = s.msel.find(
      (r) => r.purposeTag === 'CORE_NARRATIVE' && r.phaseId === s.phases[2]!.id,
    )!
    dp.purposeTag = 'DECISION_POINT'
    dp.event = 'The drone is back over the ramp.'
    dp.expectedAction = 'DECISION POINT: Ops decides whether to hold departures.'
    const drone = domainContext(
      { orgType: 'airport' },
      { brief: { ...s.brief, threatFamily: 'uas_drone' } },
    )
    const scope = lintScenario(s, drone).find((w) => w.code === DECISION_POINT_SCOPE)
    expect(scope?.message).toMatch(/law enforcement or the airspace authority/)
    expect(scope?.rowId).toBe(dp.id)
    dp.expectedAction =
      'DECISION POINT: Ops holds departures and asks airport police and the FAA tower to locate the operator.'
    expect(codes(s, drone)).not.toContain(DECISION_POINT_SCOPE)
    // A cyber scenario has no such rule.
    dp.expectedAction = 'DECISION POINT: Ops decides.'
    expect(
      codes(
        s,
        domainContext({ orgType: 'airport' }, { brief: { ...s.brief, threatFamily: 'cyber' } }),
      ),
    ).not.toContain(DECISION_POINT_SCOPE)
  })

  it("phrases the decision-point gap in the family's words", () => {
    const s = clone()
    s.msel = s.msel.map((r) =>
      r.purposeTag === 'DECISION_POINT' ? { ...r, purposeTag: 'CORE_NARRATIVE' } : r,
    )
    const phase = s.phases[2]!
    const hazard = domainContext(
      { orgType: 'water_dam' },
      { brief: { ...s.brief, threatFamily: 'natural_hazard' } },
    )
    const gap = phaseMixGaps(s, phase, hazard).find((g) => g.code === 'MIX_NO_DECISION_POINT')
    expect(gap?.need).toMatch(/evacuate|shelter/)
    const drone = domainContext(
      { orgType: 'water_dam' },
      { brief: { ...s.brief, threatFamily: 'uas_drone' } },
    )
    expect(
      phaseMixGaps(s, phase, drone).find((g) => g.code === 'MIX_NO_DECISION_POINT')?.need,
    ).toMatch(/taken with coordination with law enforcement/)
  })

  it('finds the security role for a physical-security clue through the profile words', () => {
    const s = clone()
    const phase1 = s.phases[0]!.id
    // Scenario 3's ASC gets no CLUE in phase 1; with the airport profile "asc" is the security role.
    s.msel = s.msel.filter(
      (r) => r.phaseId !== phase1 || !['CLUE', 'TECH_HURDLE'].includes(r.purposeTag),
    )
    const physical = domainContext(
      { orgType: 'airport' },
      { brief: { ...s.brief, threatFamily: 'physical_security' } },
    )
    // physical_security does not require a clue every phase.
    expect(codes(s, physical).filter((c) => c === 'MIX_NO_CLUE')).toEqual([])
    const insider = domainContext(
      { orgType: 'airport' },
      { brief: { ...s.brief, threatFamily: 'insider' } },
    )
    expect(codes(s, insider)).toContain('MIX_NO_IT_CLUE')
  })
})

describe('pickDecisionRow', () => {
  it('re-tags the row that reads like the decision when the decision phase has none', () => {
    const s = clone()
    s.msel = s.msel.map((r) =>
      r.purposeTag === 'DECISION_POINT' ? { ...r, purposeTag: 'CORE_NARRATIVE' } : r,
    )
    const phase = s.phases[2]!
    const drone = domainContext(
      { orgType: 'water_dam' },
      { brief: { ...s.brief, threatFamily: 'uas_drone' } },
    )
    const call = s.msel.find((r) => r.phaseId === phase.id && r.purposeTag === 'CORE_NARRATIVE')!
    call.event =
      'Face-to-Face: the Sheriff asks whether you want operations halted while they locate the operator.'
    call.expectedAction =
      'DECISION POINT: the DOM decides whether to continue operations under the drone with law enforcement.'
    expect(pickDecisionRow(s, phase, drone)?.id).toBe(call.id)
    // Not the decision phase, or a decision point already tagged: nothing to pick.
    expect(pickDecisionRow(s, s.phases[0]!, drone)).toBeUndefined()
    call.purposeTag = 'DECISION_POINT'
    expect(pickDecisionRow(s, phase, drone)).toBeUndefined()
  })

  it('picks nothing when no row mentions a decision', () => {
    const s = clone()
    const phase = s.phases[2]!
    s.msel = s.msel.map((r) =>
      r.phaseId === phase.id && !['TIME_JUMP'].includes(r.purposeTag)
        ? {
            ...r,
            purposeTag: 'NOISE' as const,
            event: 'A printer jammed.',
            expectedAction: 'IT deprioritizes.',
          }
        : r.purposeTag === 'DECISION_POINT'
          ? { ...r, purposeTag: 'CORE_NARRATIVE' as const }
          : r,
    )
    expect(pickDecisionRow(s, phase, domainContext({ orgType: 'airport' }, s))).toBeUndefined()
  })
})
