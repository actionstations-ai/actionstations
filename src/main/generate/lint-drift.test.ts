// An early end by content and drift from the brief (#364 items 2 and 5). Cases are the drafts
// built for the 0.5.0 examples (PR #363): an endex_card row tagged CORE_NARRATIVE at 2:55 with
// the rest of the MSEL after it, an "END_GAME: … the hot wash begins" row an hour before the
// end, and a ransomware attack inserted into a main-break brief.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MselRow, Scenario } from '@shared/schemas'
import { STRUCTURAL_CODES, structuralLints } from './lint'
import {
  BRIEF_IDS_MISSING,
  BRIEF_THREAT_ADDED,
  ENDEX_EARLY,
  endsExercise,
  lintDrift,
  MIN_BRIEF_IDS,
} from './lint-drift'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const clone = (): Scenario => structuredClone(FIXTURE)
const byId = (s: Scenario, id: string): MselRow => s.msel.find((r) => r.id === id)!
const hits = (s: Scenario, code: string): (string | undefined)[] =>
  lintDrift(s)
    .filter((w) => w.code === code)
    .map((w) => w.rowId)

describe('the hand-built Scenario 3', () => {
  it('passes every drift lint', () => {
    expect(lintDrift(FIXTURE)).toEqual([])
  })
})

describe('ENDEX by content (#364 item 2)', () => {
  it('flags an endex_card row under another tag with rows after it (city-water main)', () => {
    const s = clone()
    const row = s.msel[s.msel.length - 4]!
    row.format = 'endex_card'
    row.event = 'Field report: the main is isolated and the zone is holding pressure.'
    const w = lintDrift(s).find((x) => x.code === ENDEX_EARLY)
    expect(w).toMatchObject({ rowId: row.id, severity: 'warning' })
    expect(w!.message).toContain('3 row(s)')
  })

  it.each([
    'END_GAME: The drone is down, the field is clear, and the hot wash begins.',
    'ENDEX: the aircraft is recovered and the exercise is concluded.',
    'Facilitator: This concludes the exercise. Move to the hot wash.',
    'End of exercise. Thank you, players.',
    'The exercise is now over; begin the hot wash in the main room.',
  ])('flags end-of-exercise wording in a middle row: %s', (event) => {
    const s = clone()
    const row = s.msel[10]!
    row.event = event
    expect(hits(s, ENDEX_EARLY)).toEqual([row.id])
  })

  it.each([
    'Phone Call: "The mayor wants an answer before ENDEX, and by the end of the exercise a statement."',
    'Email: the after-action review and hot wash schedule are attached for next week.',
    'Radio: the pump crew will be done by the end of the shift.',
  ])('accepts a row that only mentions the end: %s', (event) => {
    const s = clone()
    s.msel[10]!.event = event
    expect(hits(s, ENDEX_EARLY)).toEqual([])
  })

  it('leaves the last row and the STARTEX card to the other checks', () => {
    const s = clone()
    byId(s, 'START').event = 'STARTEX: It is 09:00. ENDEX: 13:00, then the hot wash begins.'
    expect(hits(s, ENDEX_EARLY)).toEqual([])
    expect(endsExercise(s.msel.at(-1)!)).toBe(true)
  })

  it('is a row-level code the revision pass fixes', () => {
    const s = clone()
    s.msel[10]!.event = 'ENDEX: the exercise is concluded.'
    expect(STRUCTURAL_CODES.has(ENDEX_EARLY)).toBe(true)
    expect(structuralLints(s).map((w) => w.code)).toContain(ENDEX_EARLY)
  })
})

describe('drift from the brief (#364 item 5)', () => {
  const MAIN_BREAK =
    'The Hilltop Transmission Main breaks while RP-1 telemetry is out: V-2410 closes, V-2418 is stuck, the Mill Road booster BS-2 serves Zone 1 and the hospital, and IC-1 brings in chloramine.'

  it('flags a brief whose named ids the MSEL mostly never uses', () => {
    const s = clone()
    s.brief.userPrompt = MAIN_BREAK
    const w = lintDrift(s).find((x) => x.code === BRIEF_IDS_MISSING)
    expect(w).toMatchObject({ severity: 'warning' })
    expect(w!.message).toContain('5 of the 5')
    expect(w!.rowId).toBeUndefined()
  })

  it('accepts an MSEL that uses most of them, and a brief with fewer than four', () => {
    const s = clone()
    s.brief.userPrompt = MAIN_BREAK
    byId(s, 'I-03').event += ' RP-1 is dark; V-2410 is closed.'
    byId(s, 'I-04').expectedAction += ' Check V-2418 and BS-2.'
    expect(hits(s, BRIEF_IDS_MISSING)).toEqual([])
    s.msel = FIXTURE.msel
    s.brief.userPrompt = 'The Hilltop main breaks: V-2410 closes and V-2418 sticks.'
    expect(MIN_BRIEF_IDS).toBe(4)
    expect(hits(s, BRIEF_IDS_MISSING)).toEqual([])
  })

  it('flags a ransomware attack inserted into a brief that never mentions one', () => {
    const s = clone()
    s.title = 'Stale Signal'
    s.brief.userPrompt = MAIN_BREAK
    const row = byId(s, 'I-05')
    row.event = 'TIME JUMP: It is now 10:00. Ransomware has encrypted the SCADA historian.'
    const w = lintDrift(s).find((x) => x.code === BRIEF_THREAT_ADDED)
    expect(w).toMatchObject({ rowId: 'I-05' })
    expect(STRUCTURAL_CODES.has(BRIEF_THREAT_ADDED)).toBe(true)
  })

  it('accepts ransomware the brief asks for, and a rumour of it in a noise row', () => {
    const s = clone()
    s.brief.userPrompt = 'Ransomware encrypts the billing system on Monday morning.'
    byId(s, 'I-05').event = 'TIME JUMP: It is now 10:00. Ransomware has encrypted billing.'
    expect(hits(s, BRIEF_THREAT_ADDED)).toEqual([])
    s.brief.userPrompt = MAIN_BREAK
    s.title = 'Stale Signal'
    byId(s, 'I-05').event = 'TIME JUMP: It is now 10:00.'
    const noise = s.msel.find((r) => r.purposeTag === 'NOISE' || r.purposeTag === 'RED_HERRING')!
    noise.event = 'Post: "Is the main break really ransomware? My cousin says so."'
    expect(hits(s, BRIEF_THREAT_ADDED)).toEqual([])
  })
})
