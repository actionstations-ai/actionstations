import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MselRow, Scenario } from '@shared/schemas'
import { decisionPhaseIndex, lintScenario, phaseMixGaps, phaseRowCap, phaseRowCounts } from './lint'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const codes = (s: Scenario): string[] => lintScenario(s).map((w) => w.code)
const clone = (): Scenario => structuredClone(FIXTURE)

describe('phaseRowCounts (#223)', () => {
  it('asks for 20–28 rows over a 4-hour, 4-phase exercise, about six an hour', () => {
    const per = phaseRowCounts(60)
    expect(per).toEqual({ targetRowCount: 6, maxRowCount: 7 })
    expect(per.targetRowCount * 4).toBeGreaterThanOrEqual(20)
    expect(per.maxRowCount * 4).toBeLessThanOrEqual(28)
  })

  it('scales with the phase length and leaves a short phase room for its mix', () => {
    expect(phaseRowCounts(120)).toEqual({ targetRowCount: 12, maxRowCount: 14 })
    expect(phaseRowCounts(25)).toEqual({ targetRowCount: 4, maxRowCount: 5 })
    // Code (mix room, overfill trim) keeps one row above the steer.
    expect(phaseRowCap(60)).toBe(8)
  })
})

describe('lintScenario on the hand-built Scenario 3', () => {
  it('reports only the gaps docs/04 §5 already knows about', () => {
    const warnings = lintScenario(FIXTURE)
    const byCode = new Map<string, string[]>()
    for (const w of warnings) byCode.set(w.code, [...(byCode.get(w.code) ?? []), w.message])
    // Scenario 3 has no explicit DECISION_POINT tag in phases 2–3 (its I-06/I-09 are tagged
    // CORE_NARRATIVE) and the airline liaison / ASC are not addressed in every phase;
    // everything else — timing, ids, STARTEX/ENDEX, mix, rubric, citations — passes.
    const allowed = new Set([
      'ROLE_NO_INJECT',
      'NO_DECISION_POINT',
      'MIX_NO_IT_CLUE',
      'MIX_NO_NOISE',
      'MIX_NO_PIO_PRESSURE',
      'DENSITY_LOW',
      'MSEL_NO_CITATIONS',
      'OVERVIEW_NO_SECTIONS',
    ])
    const unexpected = warnings.filter((w) => !allowed.has(w.code))
    expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([])
    expect(warnings.every((w) => w.source === 'lint')).toBe(true)
  })
})

describe('lintScenario rules', () => {
  it('flags decreasing times and rows outside their phase window', () => {
    const s = clone()
    const i01 = s.msel.find((r) => r.id === 'I-01')!
    i01.time = '1:30'
    expect(codes(s)).toContain('ROW_OUTSIDE_PHASE')
    expect(codes(s)).toContain('TIME_ORDER')
  })

  it('flags duplicate ids and rubric links to unknown injects, and points not summing to 100', () => {
    const s = clone()
    s.msel[2]!.id = s.msel[1]!.id
    s.rubric!.metrics[0]!.linkedInjectIds = ['I-99']
    s.rubric!.metrics[0]!.points = 10
    const c = codes(s)
    expect(c).toContain('DUPLICATE_ROW_ID')
    expect(c).toContain('RUBRIC_LINK_UNKNOWN')
    expect(c).toContain('RUBRIC_POINTS')
    expect(lintScenario(s).find((w) => w.code === 'RUBRIC_POINTS')?.message).toMatch(/sum to 80/)
  })

  it('requires STARTEX first and ENDEX last', () => {
    const s = clone()
    s.msel = s.msel.filter((r) => r.purposeTag !== 'STARTEX' && r.purposeTag !== 'ENDEX')
    expect(codes(s)).toEqual(expect.arrayContaining(['STARTEX_FIRST', 'ENDEX_LAST']))
  })

  it('checks the mix per phase against the PIO-like and IT-like roles', () => {
    const s = clone()
    const phase2 = s.phases[1]!.id
    s.msel = s.msel.filter((r) => r.phaseId !== phase2 || r.purposeTag === 'TIME_JUMP')
    const w = lintScenario(s).filter((x) => x.message.includes('phase 2'))
    expect(w.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        'MIX_NO_CORE',
        'MIX_NO_NOISE',
        'MIX_NO_PIO_PRESSURE',
        'MIX_NO_IT_CLUE',
      ]),
    )
    expect(w.find((x) => x.code === 'MIX_NO_PIO_PRESSURE')?.message).toContain(
      'Public Information Officer',
    )
  })

  it('flags an empty phase and unresolved citations', () => {
    const s = clone()
    s.msel = s.msel.filter((r) => r.phaseId !== s.phases[3]!.id)
    s.msel[1]!.citations = [{ documentId: '', documentTitle: '', headingPath: '' }]
    expect(codes(s)).toContain('PHASE_EMPTY')
    expect(codes(s)).toContain('CITATION_UNRESOLVED')
  })

  it('notes density far from one inject per 10–15 minutes', () => {
    const s = clone()
    const p1 = s.phases[0]!.id
    const extra: MselRow[] = Array.from({ length: 12 }, (_, i) => ({
      ...s.msel[1]!,
      id: `I-X${i}`,
      time: `0:${String(10 + i).padStart(2, '0')}`,
      phaseId: p1,
    }))
    s.msel.splice(2, 0, ...extra)
    const w = lintScenario(s).find((x) => x.code === 'DENSITY_HIGH')
    expect(w?.severity).toBe('info')
  })

  it('notes a phase above the reference pace softly, and not the gold MSEL (#223)', () => {
    expect(codes(FIXTURE)).not.toContain('DENSITY_DENSE')
    const s = clone()
    const p1 = s.phases[0]!.id
    const extra: MselRow[] = Array.from({ length: 4 }, (_, i) => ({
      ...s.msel[1]!,
      id: `I-Y${i}`,
      time: `0:${String(20 + i * 5).padStart(2, '0')}`,
      phaseId: p1,
    }))
    s.msel.splice(2, 0, ...extra)
    const all = lintScenario(s)
    expect(all.map((w) => w.code)).not.toContain('DENSITY_HIGH')
    const w = all.find((x) => x.code === 'DENSITY_DENSE')
    expect(w?.severity).toBe('info')
    expect(w?.message).toMatch(/Phase 1 has 10 injects over 60 min/)
  })

  it('flags injects whose source is a player role', () => {
    const s = clone()
    const i01 = s.msel.find((r) => r.id === 'I-01')!
    i01.from = 'Ops Director'
    const w = lintScenario(s).filter((x) => x.code === 'FROM_PLAYER_ROLE')
    expect(w).toHaveLength(1)
    expect(w[0]?.rowId).toBe('I-01')
  })

  it('matches player roles fuzzily (bare name, abbreviation, key, name prefix)', () => {
    const s = clone()
    s.roles[1]!.name = 'IT Director (Technical Incident Command)'
    const rows = s.msel.filter((r) => /^I-0[2-5]$/.test(r.id))
    rows[0]!.from = 'IT Director'
    rows[1]!.from = 'it-director'
    rows[2]!.from = 'IT'
    rows[3]!.from = 'Airport Police Dispatch'
    const flagged = lintScenario(s)
      .filter((x) => x.code === 'FROM_PLAYER_ROLE')
      .map((x) => x.rowId)
    expect(flagged).toEqual([rows[0]!.id, rows[1]!.id, rows[2]!.id])
  })

  it('flags facilitator rows that narrate player decisions and reused Scenario 3 strings', () => {
    const s = clone()
    s.title = 'Lights Out'
    s.subtitle = 'ALCS'
    s.overview!.theme = 'Airfield lighting'
    s.overview!.threat = 'Ransomware on the airfield lighting control system'
    const i05 = s.msel.find((r) => r.id === 'I-05')!
    i05.event =
      'SCENARIO UPDATE: The Ops Director activates EOC Level 2 and declares Unified Command.'
    const i07 = s.msel.find((r) => r.id === 'I-07')!
    i07.event = 'Ticket #4492 (Low): vending machine stopped dispensing.'
    const codes = lintScenario(s)
    expect(codes.find((x) => x.code === 'INJECT_SCRIPTS_PLAYERS')?.rowId).toBe('I-05')
    expect(codes.filter((x) => x.code === 'REFERENCE_LEAK').map((x) => x.rowId)).toContain('I-07')
    // A FIDS scenario may legitimately use those details.
    s.overview!.threat = 'Tampering with the AODB that feeds FIDS'
    expect(lintScenario(s).some((x) => x.code === 'REFERENCE_LEAK')).toBe(false)
  })

  it('matches role names on word boundaries and quotes them with a space (#251)', () => {
    const s = clone()
    s.roles[0]!.abbreviation = 'IC'
    const i05 = s.msel.find((r) => r.id === 'I-05')!
    i05.from = 'Facilitator'
    // "IC" inside "RPIC" is not the Incident Commander.
    i05.event = 'SCENARIO UPDATE: The RPIC cannot confirm the link and declares a lost-link state.'
    const scripted = (sc: Scenario) =>
      lintScenario(sc).filter((x) => x.code === 'INJECT_SCRIPTS_PLAYERS' && x.rowId === 'I-05')
    expect(scripted(s)).toEqual([])
    // A later whole-word mention still counts, and the quote keeps the space after the name.
    i05.event = 'SCENARIO UPDATE: The RPIC reports lost link; the IC declares an emergency.'
    const [w] = scripted(s)
    expect(w?.message).toContain('("…IC declares an emergency.…")')
    expect(w?.message).not.toMatch(/ICdeclares|ICcannot/)
  })

  it('describes per-phase gaps in model-facing terms', () => {
    const s = clone()
    const phase3 = s.phases[2]!
    s.msel = s.msel.filter((r) => r.phaseId !== phase3.id || r.purposeTag === 'CORE_NARRATIVE')
    const gaps = phaseMixGaps(s, phase3)
    expect(gaps.map((g) => g.code)).toEqual(
      expect.arrayContaining([
        'MIX_NO_NOISE',
        'MIX_NO_PIO_PRESSURE',
        'MIX_NO_IT_CLUE',
        'ROLE_NO_INJECT',
      ]),
    )
    expect(gaps.find((g) => g.code === 'MIX_NO_PIO_PRESSURE')?.need).toContain('"pio"')
    expect(phaseMixGaps(s, s.phases[0]!).map((g) => g.code)).not.toContain('MIX_NO_CORE')
  })

  it('does not count STARTEX / TIME_JUMP / ENDEX broadcasts as role coverage (#90)', () => {
    const s = clone()
    const everyone = s.roles.map((r) => r.id)
    // The pipeline resolves to: ["all"] to every role id, as mappers.resolveToRoles does.
    for (const r of s.msel) if (r.toLabel === 'All') r.toRoleIds = [...everyone]
    const phase2 = s.phases[1]!
    const missing = phaseMixGaps(s, phase2)
      .filter((g) => g.code === 'ROLE_NO_INJECT')
      .map((g) => g.message)
    // In phase 2 only I-05 (TIME_JUMP) and I-06 (a CORE_NARRATIVE broadcast) reach ASC and AL.
    expect(missing).toEqual([])
    const i06 = s.msel.find((r) => r.id === 'I-06')!
    i06.toRoleIds = ['ops-director']
    i06.toLabel = 'Ops'
    const after = phaseMixGaps(s, phase2).filter((g) => g.code === 'ROLE_NO_INJECT')
    expect(after.map((g) => g.need)).toEqual([
      expect.stringContaining('"asc"'),
      expect.stringContaining('"airline-liaison"'),
    ])
  })

  it('does not let a broadcast row satisfy the PIO or IT check (#90)', () => {
    const s = clone()
    const phase2 = s.phases[1]!
    const i06b = s.msel.find((r) => r.id === 'I-06b')!
    i06b.toRoleIds = s.roles.map((r) => r.id)
    i06b.toLabel = 'All'
    const i08b = s.msel.find((r) => r.id === 'I-08b')!
    i08b.toRoleIds = s.roles.map((r) => r.id)
    i08b.toLabel = 'All'
    const gaps = phaseMixGaps(s, phase2).map((g) => g.code)
    expect(gaps).toContain('MIX_NO_PIO_PRESSURE')
    expect(gaps).toContain('MIX_NO_IT_CLUE')
  })

  it('asks for the single DECISION_POINT in its designated phase only (#90)', () => {
    expect([1, 2, 3, 4, 5, 6].map(decisionPhaseIndex)).toEqual([0, 1, 1, 2, 2, 3])
    const s = clone()
    expect(s.msel.some((r) => r.purposeTag === 'DECISION_POINT')).toBe(false)
    const at = decisionPhaseIndex(s.phases.length)
    for (const p of s.phases) {
      const dp = phaseMixGaps(s, p).find((g) => g.code === 'MIX_NO_DECISION_POINT')
      if (p.index === at) expect(dp?.need).toMatch(/DECISION_POINT/)
      else expect(dp).toBeUndefined()
    }
    // The scenario-level lint reports it once, not once more per phase.
    const c = codes(s)
    expect(c).toContain('NO_DECISION_POINT')
    expect(c).not.toContain('MIX_NO_DECISION_POINT')
    // Two phases: the decision point belongs in phase 2.
    const two = clone()
    two.phases = two.phases.slice(0, 2)
    two.msel = two.msel.filter((r) => two.phases.some((p) => p.id === r.phaseId))
    expect(phaseMixGaps(two, two.phases[1]!).map((g) => g.code)).toContain('MIX_NO_DECISION_POINT')
    expect(phaseMixGaps(two, two.phases[0]!).map((g) => g.code)).not.toContain(
      'MIX_NO_DECISION_POINT',
    )
    // Once any phase has one, no phase asks for another.
    two.msel.find((r) => r.id === 'I-03')!.purposeTag = 'DECISION_POINT'
    expect(phaseMixGaps(two, two.phases[1]!).map((g) => g.code)).not.toContain(
      'MIX_NO_DECISION_POINT',
    )
  })

  it('is silent on an empty scenario', () => {
    const s = clone()
    s.msel = []
    s.rubric = undefined
    expect(codes(s)).toEqual(expect.arrayContaining(['PHASE_EMPTY']))
    s.phases = []
    expect(codes(s)).toEqual([])
  })
})
