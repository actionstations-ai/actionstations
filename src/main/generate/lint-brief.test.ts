// Brief, clock and calendar lints (#347), with the defects found while building the 0.4.0
// examples as cases: an ENDEX in the middle, four copies of one TIME_JUMP, a Saturday date in a
// Thursday exercise, a 09:00 STARTEX for a brief that starts at 18:30, nine roles for five
// audience entries, and an outside party seated as a player.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MselRow, Scenario } from '@shared/schemas'
import { lintScenario } from './lint'
import {
  BRIEF_TIME_OUTSIDE,
  CLOCK_MISMATCH,
  DATE_DRIFT,
  lintBrief,
  OUTSIDE_PARTY_ROLE,
  ROLES_EXCEED_AUDIENCE,
  simcellParties,
  START_TIME_MISMATCH,
  statedClock,
  TIME_JUMP_REPEATED,
} from './lint-brief'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const clone = (): Scenario => structuredClone(FIXTURE)
const codes = (s: Scenario): string[] => lintBrief(s).map((w) => w.code)
const byId = (s: Scenario, id: string): MselRow => s.msel.find((r) => r.id === id)!

describe('the hand-built Scenario 3', () => {
  it('passes every brief, clock and calendar lint', () => {
    expect(lintBrief(FIXTURE)).toEqual([])
  })
})

describe('statedClock', () => {
  it('reads the clock a control card states, with AM / PM', () => {
    expect(statedClock('STARTEX: It is 18:30 on Thursday.')?.minutes).toBe(18 * 60 + 30)
    expect(statedClock('Current time: 09:00 AM on a busy Thursday')?.minutes).toBe(9 * 60)
    expect(statedClock("Set the scene: it's 6:15 PM, you're watching")?.minutes).toBe(18 * 60 + 15)
    expect(statedClock('Narrative Clock: 08:00. Weather: Clear')?.minutes).toBe(8 * 60)
    expect(statedClock('TIME JUMP: 30 minutes later the queue has doubled')).toBeUndefined()
  })
})

describe('start time and control-card clocks (#347 items 2 and 4)', () => {
  it('flags a STARTEX at 09:00 when the brief starts at 18:30', () => {
    const s = clone()
    s.brief.startWallClock = '18:30'
    const w = lintBrief(s).find((x) => x.code === START_TIME_MISMATCH)
    expect(w).toMatchObject({ rowId: 'START', severity: 'warning' })
    expect(w?.suggestion).toContain('18:30')
  })

  it('flags a time jump card whose clock does not match its row time', () => {
    const s = clone()
    byId(s, 'I-05').event = 'SCENARIO JUMP: It is now 3:00. The errors are multiplying.'
    const w = lintBrief(s).find((x) => x.code === CLOCK_MISMATCH)
    expect(w).toMatchObject({ rowId: 'I-05' })
    expect(w?.message).toContain('10:00')
  })

  it('accepts a clock within five minutes, and across midnight', () => {
    const s = clone()
    byId(s, 'I-05').event = 'SCENARIO JUMP: It is now 10:03 AM.'
    expect(codes(s)).not.toContain(CLOCK_MISMATCH)
    s.brief.startWallClock = '23:30'
    byId(s, 'START').event = 'STARTEX: It is 23:30.'
    byId(s, 'I-05').event = 'TIME JUMP: It is now 00:30. The night shift is short.'
    expect(codes(s)).not.toContain(CLOCK_MISMATCH)
    expect(codes(s)).not.toContain(START_TIME_MISMATCH)
  })

  it('notes a request whose times all fall outside the exercise window', () => {
    const s = clone()
    s.brief.userPrompt = 'At 23:40 the night shift is loading chlorine at Rail Spot 2.'
    const w = lintBrief(s).find((x) => x.code === BRIEF_TIME_OUTSIDE)
    expect(w).toMatchObject({ severity: 'info' })
    expect(w?.message).toContain('23:40')
    // A scene-setting alert a couple of hours before STARTEX is fine.
    s.brief.userPrompt = 'At 06:50 Thursday County IT reports ransomware on the county network.'
    expect(codes(s)).not.toContain(BRIEF_TIME_OUTSIDE)
  })

  it('flags repeated TIME_JUMP rows, the later ones', () => {
    const s = clone()
    const jump = byId(s, 'I-05')
    const copy = (id: string, time: string): MselRow => ({ ...structuredClone(jump), id, time })
    const at = s.msel.indexOf(jump)
    s.msel.splice(at + 1, 0, copy('I-05x', jump.time), copy('I-05y', '1:20'))
    const w = lintBrief(s).filter((x) => x.code === TIME_JUMP_REPEATED)
    expect(w.map((x) => x.rowId)).toEqual(['I-05x', 'I-05y'])
  })
})

describe('date drift (#347 item 3)', () => {
  const withDay = (start: string, later: string): Scenario => {
    const s = clone()
    byId(s, 'START').event = start
    byId(s, 'I-03').event = later
    return s
  }

  it('flags a row that states another day than the STARTEX card', () => {
    const s = withDay(
      'STARTEX: It is 09:00 on Thursday, October 22, 2026.',
      'Phone Call: "It is Saturday, October 24, 2026 and the boards are still wrong."',
    )
    expect(
      lintBrief(s)
        .filter((w) => w.code === DATE_DRIFT)
        .map((w) => w.rowId),
    ).toEqual(['I-03'])
  })

  it('flags a weekday that does not match its date', () => {
    const s = withDay(
      'STARTEX: It is 09:00 on Tuesday, October 22, 2026.',
      'Phone Call: "The boards are wrong."',
    )
    const w = lintBrief(s).find((x) => x.code === DATE_DRIFT)
    expect(w).toMatchObject({ rowId: 'START' })
  })

  it('accepts past days mentioned in passing and a time jump to the next day', () => {
    const s = withDay(
      'STARTEX: It is 09:00 on a Thursday.',
      'Email: the backup from Wednesday night is the last clean one; on Tuesday the clerk clicked a link.',
    )
    expect(codes(s)).not.toContain(DATE_DRIFT)
    byId(s, 'I-05').event = 'TIME JUMP: It is now 10:00 on Friday. The board met overnight.'
    byId(s, 'I-06').event = 'Phone Call: "It is Friday and nobody has called us back."'
    expect(codes(s)).not.toContain(DATE_DRIFT)
  })
})

describe('roles and the audience (#347 item 11)', () => {
  it('flags more roles than the audience allows (one extra is tolerated)', () => {
    const s = clone()
    expect(codes(s)).not.toContain(ROLES_EXCEED_AUDIENCE) // 5 roles, 4 audience entries
    s.brief.audience = s.brief.audience.slice(0, 3)
    expect(codes(s)).toContain(ROLES_EXCEED_AUDIENCE)
  })

  it('reads the outside parties a brief gives the SimCell', () => {
    expect(
      simcellParties([
        'Player roles are only those in the audience list; outside parties (Teague County OEM, the NRC, CISA, the FBI and the railroad) are played by the SimCell, not seated as players.',
      ]),
    ).toEqual(['Teague County OEM', 'NRC', 'CISA', 'FBI', 'railroad'])
  })

  it('flags a player role that is one of those parties, not a role named after one', () => {
    const s = clone()
    s.brief.constraints = ['outside parties (CISA, the FBI, TSA) are played by the SimCell']
    s.roles[4] = { ...s.roles[4]!, name: 'CISA Regional Advisor', abbreviation: 'CISA' }
    expect(lintBrief(s).filter((w) => w.code === OUTSIDE_PARTY_ROLE)).toHaveLength(1)
    s.roles[4] = { ...s.roles[4]!, name: 'Cybersecurity Coordinator (TSA)', abbreviation: 'CYB' }
    expect(codes(s)).not.toContain(OUTSIDE_PARTY_ROLE)
  })
})

describe('ENDEX in the middle (#347 item 1)', () => {
  it('names every row after the ENDEX row', () => {
    const s = clone()
    const end = s.msel.pop()!
    s.msel.splice(10, 0, end)
    const after = lintScenario(s).filter((w) => w.code === 'ENDEX_LAST')
    expect(after.length).toBe(s.msel.length - 11)
    expect(after[0]).toMatchObject({ rowId: s.msel[11]!.id })
    expect(after[0]!.suggestion).toContain('before ENDEX')
  })

  it('points ENDEX_MULTIPLE at the early ENDEX row', () => {
    const s = clone()
    const end = s.msel.at(-1)!
    s.msel.splice(10, 0, { ...structuredClone(end), id: 'END-early' })
    const w = lintScenario(s).find((x) => x.code === 'ENDEX_MULTIPLE')
    expect(w).toMatchObject({ rowId: 'END-early' })
  })
})

describe('the weekday on control cards (#364 item 4)', () => {
  const startex = (event: string, prompt = ''): Scenario => {
    const s = clone()
    byId(s, 'START').event = event
    s.brief.userPrompt = prompt
    return s
  }
  const drift = (s: Scenario): (string | undefined)[] =>
    lintBrief(s)
      .filter((w) => w.code === DATE_DRIFT)
      .map((w) => w.rowId)

  it.each([
    'STARTEX: It is Wednesday, 09:00, April 2, 2026. Clear skies.',
    'STARTEX: Date: April 2, 2026 (Wednesday). It is 09:00.',
    'STARTEX: It is 09:00 on Wednesday the 2nd of April. Date: 2026-04-02.',
    'STARTEX: Wednesday, April 2nd, 2026, 09:00.',
    'STARTEX: Wednesday 2 April 2026, 09:00.',
  ])('flags a STARTEX weekday that does not match its date (a Thursday): %s', (event) => {
    expect(drift(startex(event))).toEqual(['START'])
  })

  it('names the real weekday of the date in the message and the fix', () => {
    const w = lintBrief(startex('STARTEX: It is Wednesday, 09:00, April 2, 2026.')).find(
      (x) => x.code === DATE_DRIFT,
    )
    expect(w?.message).toContain('Thursday')
    expect(w?.suggestion).toContain('Thursday, April 2, 2026')
  })

  it('flags a time jump card whose weekday and date disagree', () => {
    const s = startex('STARTEX: It is 09:00 on Thursday, April 2, 2026.')
    byId(s, 'I-05').event = 'TIME JUMP: It is now Friday 10:00, April 2, 2026. Crews are out.'
    expect(drift(s)).toEqual(['I-05'])
  })

  it('flags a STARTEX day other than the one date the brief names', () => {
    const prompt =
      'On Thursday 10/29/2026, the fourth-to-last day of early voting, the poll pads fail.'
    expect(drift(startex('STARTEX: It is 08:00 on Wednesday.', prompt))).toEqual(['START'])
    expect(drift(startex('STARTEX: It is 08:00 on October 28, 2026.', prompt))).toEqual(['START'])
    expect(drift(startex('STARTEX: It is 08:00 on Thursday, October 29, 2026.', prompt))).toEqual(
      [],
    )
    expect(drift(startex('STARTEX: It is 08:00. Early voting is busy.', prompt))).toEqual([])
  })

  it('accepts matching cards and a brief that names more than one date', () => {
    expect(drift(startex('STARTEX: It is Thursday, 09:00, April 2, 2026.'))).toEqual([])
    const prompt =
      'The backups from October 20, 2026 are clean; the attack starts October 22, 2026.'
    expect(drift(startex('STARTEX: It is 09:00 on Wednesday.', prompt))).toEqual([])
  })
})
