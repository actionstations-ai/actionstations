import { describe, expect, it } from 'vitest'
import type { MselRow } from '../schemas/scenario'
import {
  acceptSuggestion,
  addCommitment,
  addSuggestions,
  clearAnswer,
  closeCommitment,
  dismissFlag,
  dismissSuggestion,
  evaluate,
  expectsResponse,
  markAnswered,
  trackerReport,
  type SessionEntry,
  type TrackerInput,
} from './tracker'

const row = (id: string, over: Partial<MselRow> = {}): MselRow =>
  ({
    id,
    phaseId: 'p1',
    time: '0:10',
    from: 'SimCell',
    toRoleIds: [],
    event: `Event ${id}`,
    expectedAction: '',
    purposeTag: 'PRESSURE',
    citations: [],
    locked: false,
    ...over,
  }) as MselRow

type State = TrackerInput['state']
const state = (over: Partial<State> = {}): State => ({ delivered: {}, notes: {}, ...over })
const delivered = (id: string, exerciseTime: string): State['delivered'] => ({
  [id]: { at: 'x', exerciseTime },
})
const input = (over: Partial<TrackerInput>): TrackerInput => ({
  msel: [row('I-01')],
  state: state(),
  minutes: 0,
  ...over,
})
const at = { iso: '2026-10-29T10:00:00.000Z', exerciseMin: 25 }

describe('expectsResponse defaults (spec 0428 §4)', () => {
  it.each([
    'CORE_NARRATIVE',
    'PRESSURE',
    'MISINFORMATION',
    'CLUE',
    'TECH_HURDLE',
    'DECISION_POINT',
  ])('expects an answer to %s', (purposeTag) =>
    expect(expectsResponse({ purposeTag } as MselRow)).toBe(true),
  )
  it.each(['NOISE', 'RED_HERRING', 'DISTRACTION', 'CONFUSION', 'STARTEX', 'TIME_JUMP', 'ENDEX'])(
    'does not flag silence on %s',
    (purposeTag) => expect(expectsResponse({ purposeTag } as MselRow)).toBe(false),
  )
  it('lets the row decide', () => {
    expect(expectsResponse({ purposeTag: 'NOISE', expectsResponse: true } as MselRow)).toBe(true)
  })
})

describe('T1 unanswered inject', () => {
  const base = { state: state({ delivered: delivered('I-01', '0:10') }) }
  it('flags a delivered row with no response after the default 10 minutes', () => {
    expect(evaluate(input({ ...base, minutes: 19 }))).toEqual([])
    const [flag] = evaluate(input({ ...base, minutes: 24 }))
    expect(flag).toMatchObject({
      id: 'T1:I-01',
      rule: 'T1',
      level: 'warn',
      rowId: 'I-01',
      since: 10,
    })
    expect(flag?.text).toContain('no response for 14 min')
  })
  it('uses the row window when it has one', () => {
    const msel = [row('I-01', { responseWindowMin: 30 })]
    expect(evaluate(input({ ...base, msel, minutes: 35 }))).toEqual([])
    expect(evaluate(input({ ...base, msel, minutes: 41 }))).toHaveLength(1)
  })
  it('does not flag undelivered rows, silent-by-design rows or answered rows', () => {
    expect(evaluate(input({ minutes: 60 }))).toEqual([])
    expect(
      evaluate(input({ ...base, msel: [row('I-01', { purposeTag: 'NOISE' })], minutes: 60 })),
    ).toEqual([])
    const answered = markAnswered(base.state, 'I-01', at)
    expect(evaluate(input({ state: answered, minutes: 60 }))).toEqual([])
  })
  it('flags again after an answer is cleared', () => {
    const answered = markAnswered(base.state, 'I-01', at)
    expect(evaluate(input({ state: clearAnswer(answered, 'I-01'), minutes: 60 }))).toHaveLength(1)
  })
  it('counts a player message that names the row as the answer', () => {
    const session: SessionEntry[] = [
      { kind: 'message.send', at: 0, rowId: 'I-01', fromPlayer: true },
    ]
    expect(evaluate(input({ ...base, minutes: 60, session }))).toEqual([])
  })
  it('keeps a dismissal', () => {
    const s = dismissFlag(base.state, 'T1:I-01', at.iso, 'on purpose')
    expect(evaluate(input({ state: s, minutes: 60 }))).toEqual([])
  })
})

describe('T2 not opened (live play only)', () => {
  const release: SessionEntry = { kind: 'inject.release', at: 1_000_000, rowId: 'I-01' }
  const base = { state: state({ delivered: delivered('I-01', '0:10') }), minutes: 11 }
  it('flags a release nobody read after 3 real minutes', () => {
    expect(evaluate(input({ ...base, nowMs: 1_000_000 + 179_000, session: [release] }))).toEqual([])
    const [flag] = evaluate(input({ ...base, nowMs: 1_000_000 + 181_000, session: [release] }))
    expect(flag).toMatchObject({ id: 'T2:I-01', rule: 'T2' })
  })
  it('is quiet once a device reads it, and without a session', () => {
    const read: SessionEntry = {
      kind: 'inject.receipt',
      at: 1_050_000,
      rowId: 'I-01',
      receipt: 'read',
    }
    expect(evaluate(input({ ...base, nowMs: 9_000_000, session: [release, read] }))).toEqual([])
    expect(evaluate(input({ ...base, nowMs: 9_000_000 }))).toEqual([])
  })
})

describe('commitments (T3, T4)', () => {
  const commitment = (over = {}) => ({
    id: 'p-1',
    text: 'Notify the FAA',
    owner: 'Ops Director',
    madeAtMin: 5,
    source: 'manual' as const,
    status: 'open' as const,
    ...over,
  })
  it('T3 flags an open commitment once it is due', () => {
    const s = addCommitment(state(), commitment({ dueAtMin: 40 }))
    expect(evaluate(input({ state: s, minutes: 39 }))).toEqual([])
    const [flag] = evaluate(input({ state: s, minutes: 41 }))
    expect(flag).toMatchObject({ id: 'T3:p-1', rule: 'T3', level: 'warn', commitmentId: 'p-1' })
    expect(flag?.text).toContain('Ops Director')
  })
  it('T4 mentions an open commitment with no time after 30 minutes, as info', () => {
    const s = addCommitment(state(), commitment())
    expect(evaluate(input({ state: s, minutes: 35 }))).toEqual([])
    expect(evaluate(input({ state: s, minutes: 36 }))[0]).toMatchObject({
      rule: 'T4',
      level: 'info',
    })
  })
  it('goes quiet when the commitment is kept, missed or dropped', () => {
    const s = addCommitment(state(), commitment({ dueAtMin: 10 }))
    for (const status of ['kept', 'missed', 'dropped'] as const)
      expect(
        evaluate(input({ state: closeCommitment(s, 'p-1', status, 20), minutes: 90 })),
      ).toEqual([])
  })
})

describe('T5 expected action unconfirmed', () => {
  const msel = [row('I-01', { expectedAction: 'Isolate the BHS VLAN', purposeTag: 'NOISE' })]
  const phases = [{ id: 'p1', endTime: '0:30' }]
  const base = { msel, phases, state: state({ delivered: delivered('I-01', '0:10') }) }
  it('is info at the end of the phase when nothing was recorded', () => {
    expect(evaluate(input({ ...base, minutes: 29 }))).toEqual([])
    expect(evaluate(input({ ...base, minutes: 31 }))[0]).toMatchObject({
      id: 'T5:I-01',
      level: 'info',
    })
  })
  it('is satisfied by a note or a response', () => {
    const noted = { ...base, state: { ...base.state, notes: { 'I-01': 'They isolated it' } } }
    expect(evaluate(input({ ...noted, minutes: 31 }))).toEqual([])
    expect(
      evaluate(input({ ...base, state: markAnswered(base.state, 'I-01', at), minutes: 31 })),
    ).toEqual([])
  })
})

describe('ordering and speed', () => {
  it('lists warnings before info, oldest first', () => {
    const msel = [row('I-01', { time: '0:20' }), row('I-02', { time: '0:05' })]
    const s = addCommitment(
      { ...state({ delivered: { ...delivered('I-01', '0:20'), ...delivered('I-02', '0:05') } }) },
      { id: 'p-1', text: 'x', owner: '', madeAtMin: 0, source: 'manual', status: 'open' },
    )
    const flags = evaluate(input({ msel, state: s, minutes: 80 }))
    expect(flags.map((f) => f.id)).toEqual(['T1:I-02', 'T1:I-01', 'T4:p-1'])
  })
  it('evaluates 200 rows, 500 messages and 100 commitments in under 5 ms', () => {
    const msel = Array.from({ length: 200 }, (_, i) => row(`I-${i}`))
    const deliveredAll = Object.assign({}, ...msel.map((r) => delivered(r.id, '0:05')))
    let s = state({ delivered: deliveredAll })
    for (let i = 0; i < 100; i++)
      s = addCommitment(s, {
        id: `p-${i}`,
        text: 't',
        owner: '',
        madeAtMin: 0,
        dueAtMin: 30,
        source: 'manual',
        status: 'open',
      })
    const session: SessionEntry[] = Array.from({ length: 500 }, (_, i) => ({
      kind: 'message.send',
      at: i,
      rowId: `I-${i % 50}`,
      fromPlayer: true,
    }))
    evaluate(input({ msel, state: s, session, nowMs: 1, minutes: 60 }))
    const started = performance.now()
    evaluate(input({ msel, state: s, session, nowMs: 1, minutes: 60 }))
    expect(performance.now() - started).toBeLessThan(5)
  })
})

describe('suggestions and the report', () => {
  const found = [{ id: 'c-1', text: "We'll call the EOC", source: 'note' as const, dueAtMin: 50 }]
  it('adds each suggestion once and not after a dismissal', () => {
    const once = addSuggestions(addSuggestions(state(), found), found)
    expect(once.tracker?.suggestions).toHaveLength(1)
    const dismissed = dismissSuggestion(once, 'c-1', at.iso)
    expect(addSuggestions(dismissed, found).tracker?.suggestions).toEqual([])
  })
  it('does not suggest what was already accepted', () => {
    const accepted = acceptSuggestion(addSuggestions(state(), found), 'c-1', 20, 'PIO')
    expect(accepted.tracker?.commitments[0]).toMatchObject({
      text: "We'll call the EOC",
      owner: 'PIO',
      dueAtMin: 50,
      status: 'open',
    })
    expect(addSuggestions(accepted, found).tracker?.suggestions).toEqual([])
  })
  it('reports response times and commitment outcomes with cite keys', () => {
    const msel = [row('I-01'), row('I-02')]
    let s = state({ delivered: { ...delivered('I-01', '0:10'), ...delivered('I-02', '0:12') } })
    s = markAnswered(s, 'I-01', { iso: at.iso, exerciseMin: 25 }, { note: 'Called the FAA' })
    s = addCommitment(s, {
      id: 'p-1',
      text: 'Call',
      owner: 'Ops',
      madeAtMin: 5,
      source: 'manual',
      status: 'open',
    })
    s = closeCommitment(s, 'p-1', 'kept', 30)
    const report = trackerReport({ msel, state: s, minutes: 40 })
    expect(report.responses).toEqual([
      { cite: 'R1', rowId: 'I-01', responseMin: 15, note: 'Called the FAA', source: 'manual' },
    ])
    expect(report.unanswered).toEqual(['I-02'])
    expect(report.commitments).toEqual([{ cite: 'P1', text: 'Call', owner: 'Ops', status: 'kept' }])
  })
})
