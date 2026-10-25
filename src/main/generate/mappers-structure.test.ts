// Deterministic structural repairs (#174), on MSELs shaped like the UAS-pack runs: rows past
// the last phase, an END_GAME row after the ENDEX card, an ENDEX in the middle of phase 4,
// the same resident call twice, and nine roles for a six-entry audience.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exerciseMinutes, type MselRow, type Role, type Scenario } from '@shared/schemas'
import { roleHeuristics } from './domain'
import { lintScenario, structuralLints } from './lint'
import {
  capRoles,
  convertToFacilitatorPrompt,
  repairStructure,
  sortMsel,
} from './mappers-structure'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const codes = (s: Scenario): string[] => lintScenario(s).map((w) => w.code)
const lastPhase = (s: Scenario) => s.phases.at(-1)!

function addRow(s: Scenario, r: Partial<MselRow> & { id: string; time: string }): MselRow {
  const row: MselRow = {
    phaseId: lastPhase(s).id,
    from: 'Vendor NOC',
    toRoleIds: [s.roles[0]!.id],
    event: `Email: status update ${r.id} on the recovery of the flight planning server.`,
    expectedAction: 'IT verifies.',
    purposeTag: 'CORE_NARRATIVE',
    citations: [],
    locked: false,
    ...r,
  }
  s.msel.push(row)
  sortMsel(s)
  return row
}

describe('repairStructure', () => {
  it('re-times rows past the last phase and puts ENDEX last (the cyber run)', () => {
    const s = structuredClone(FIXTURE)
    const end = s.msel.find((r) => r.purposeTag === 'ENDEX')!
    const phase = lastPhase(s)
    // Endex card in the middle of phase 4, five rows at 4:05–4:55, an END_GAME after ENDEX.
    end.time = '3:30'
    for (const [i, t] of ['4:05', '4:15', '4:25', '4:40', '4:55'].entries())
      addRow(s, { id: `I-3${i}`, time: t })
    addRow(s, { id: 'I-29', time: '3:40', purposeTag: 'END_GAME' })
    expect(codes(s).filter((c) => c === 'ROW_OUTSIDE_PHASE')).toHaveLength(5)
    expect(codes(s)).toContain('ENDEX_LAST')
    expect(structuralLints(s).filter((w) => w.code === 'ENDEX_LAST').length).toBeGreaterThan(1)

    const fix = repairStructure(s)
    expect(codes(s)).not.toContain('ROW_OUTSIDE_PHASE')
    expect(codes(s)).not.toContain('ENDEX_LAST')
    expect(codes(s)).not.toContain('TIME_ORDER')
    expect(structuralLints(s)).toEqual([])
    expect(s.msel.at(-1)).toBe(end)
    const at = (t: string): number => exerciseMinutes(t)
    expect(at(end.time)).toBeLessThanOrEqual(at(phase.endTime))
    expect(s.msel.every((r) => at(r.time) <= at(end.time))).toBe(true)
    expect(fix.retimed.map((r) => r.rowId)).toEqual(
      expect.arrayContaining(['I-30', 'I-31', 'I-32', 'I-33', 'I-34', end.id]),
    )
    const moved = s.msel.find((r) => r.id === 'I-30')!
    expect(moved.wallClock).toMatch(/^\d{2}:\d{2}$/)
  })

  it('keeps one ENDEX and never moves or drops locked rows', () => {
    const s = structuredClone(FIXTURE)
    const end = s.msel.find((r) => r.purposeTag === 'ENDEX')!
    end.locked = true
    const late = addRow(s, { id: 'I-40', time: '4:30', locked: true })
    const free = addRow(s, { id: 'I-41', time: '4:20' })
    addRow(s, {
      id: 'END2',
      time: '3:10',
      purposeTag: 'ENDEX',
      event: 'ENDEX. The incident is resolved.',
    })
    const fix = repairStructure(s)
    expect(fix.extraEndex).toEqual(['END2'])
    expect(s.msel.filter((r) => r.purposeTag === 'ENDEX')).toEqual([end])
    expect(late.time).toBe('4:30')
    // Behind a locked ENDEX the unlocked row moves to the ENDEX time at the latest.
    expect(exerciseMinutes(free.time)).toBeLessThanOrEqual(exerciseMinutes(end.time))
  })

  it('drops the exact repeat of a row (the same resident call verbatim, I-22 and I-25b)', () => {
    const s = structuredClone(FIXTURE)
    const call =
      '"My name is Dana Ortiz on Lakeview Road. A drone has been hovering over my back yard for ten minutes and it just dropped toward the lake."'
    addRow(s, { id: 'I-22', time: '3:10', from: 'Resident', event: `Phone Call: ${call}` })
    addRow(s, {
      id: 'I-25b',
      time: '3:35',
      from: 'Neighbor',
      event: `Phone Call (911 transfer): ${call}`,
    })
    const fix = repairStructure(s)
    expect(fix.duplicates).toEqual([{ rowId: 'I-25b', of: 'I-22' }])
    expect(s.msel.some((r) => r.id === 'I-25b')).toBe(false)
    expect(s.msel.some((r) => r.id === 'I-22')).toBe(true)
  })

  it('changes nothing on the hand-built Scenario 3', () => {
    const s = structuredClone(FIXTURE)
    const fix = repairStructure(s)
    expect(fix).toEqual({ duplicates: [], extraEndex: [], retimed: [] })
    expect(s.msel.map((r) => r.id)).toEqual(FIXTURE.msel.map((r) => r.id))
  })
})

const role = (id: string, name: string, abbreviation = id.toUpperCase()): Role => ({
  id,
  name,
  abbreviation,
  team: 'Team',
  description: '',
  standingOrders: [],
})

describe('capRoles (#174: nine roles for a six-entry audience)', () => {
  it('keeps the core roles first and the model order otherwise', () => {
    const s = structuredClone(FIXTURE)
    s.roles = [
      role('dom', 'Director of Flight Operations (Incident Commander)', 'Ops'),
      role('rpic', 'Remote Pilot in Command'),
      role('aso', 'Aviation Safety Officer'),
      role('maint', 'Maintenance Lead'),
      role('legal', 'General Counsel'),
      role('hr', 'Human Resources'),
      role('it', 'Systems & Cybersecurity Lead (Technical Lead)', 'IT'),
      role('pio', 'Communications Lead (PIO)', 'PIO'),
      role('security', 'Security / Campus Safety Liaison', 'Sec'),
    ]
    const dropped = capRoles(s, 6, roleHeuristics())
    expect(s.roles.map((r) => r.id)).toEqual(['dom', 'rpic', 'aso', 'it', 'pio', 'security'])
    expect(dropped.map((r) => r.id)).toEqual(['maint', 'legal', 'hr'])
  })

  it('keeps the roles that play an audience entry before the core roles (#364)', () => {
    const s = structuredClone(FIXTURE)
    s.brief.audience = ['Flight Operations', 'Leadership', 'Fleet & Logistics']
    s.roles = [
      role('dom', 'Director of Flight Operations (Incident Commander)', 'Ops'),
      role('it', 'Systems & Cybersecurity Lead (Technical Lead)', 'IT'),
      role('pio', 'Communications Lead (PIO)', 'PIO'),
      role('security', 'Security / Campus Safety Liaison', 'Sec'),
      role('gm', 'General Manager (Leadership)', 'GM'),
      role('fleet', 'Fleet & Logistics Manager', 'F&L'),
    ]
    const dropped = capRoles(s, 4, roleHeuristics())
    expect(s.roles.map((r) => r.id)).toEqual(['dom', 'it', 'gm', 'fleet'])
    expect(dropped.map((r) => r.id)).toEqual(['pio', 'security'])
  })

  it('leaves the roles alone without an audience list or within the cap', () => {
    const s = structuredClone(FIXTURE)
    const before = s.roles.map((r) => r.id)
    expect(capRoles(s, 0, roleHeuristics())).toEqual([])
    expect(capRoles(s, before.length, roleHeuristics())).toEqual([])
    expect(s.roles.map((r) => r.id)).toEqual(before)
  })
})

describe('convertToFacilitatorPrompt', () => {
  it('moves the player decision to the expected action', () => {
    const s = structuredClone(FIXTURE)
    const row = addRow(s, {
      id: 'I-23',
      time: '3:20',
      from: 'Frontline Staff',
      toLabel: 'Ops',
      event: 'Radio Call: "This is the DOM. I have made the decision to ground the fleet."',
      expectedAction: 'Ops informs the FAA.',
    })
    expect(convertToFacilitatorPrompt(s, new Set(['I-23']))).toEqual(['I-23'])
    expect(row.event).toMatch(/^Facilitator prompt to Ops:/)
    expect(row.expectedAction).toMatch(/I have made the decision to ground the fleet/)
    expect(row.from).toBe('Facilitator')
  })
})
