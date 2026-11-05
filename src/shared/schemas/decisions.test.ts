import { describe, expect, it } from 'vitest'
import { WARNING_FORM } from '../decisions/fixtures'
import {
  decisionLogData,
  decisionRecordOf,
  decisionRecordsFromLog,
  mergeDecisionRecords,
} from '../decisions/records'
import {
  buildDecisionRecord,
  checkSubmission,
  DecisionForm,
  formsForSeat,
  type DecisionRecord,
} from './decisions'
import type { SessionLogEntry } from './live'

const fields = (over: Record<string, string | number> = {}) => ({ level: 'warning', ...over })
const harbor = { areaId: 'harbor' }

describe('DecisionForm', () => {
  it('accepts the example form and applies defaults', () => {
    const form = DecisionForm.parse(WARNING_FORM)
    expect(form.fields.find((f) => f.id === 'note')).toMatchObject({ maxLength: 200 })
    const minimal = DecisionForm.parse({
      id: 'f',
      title: 'F',
      fields: [{ id: 'a', type: 'time', label: 'When' }],
    })
    expect(minimal.fields[0]).toMatchObject({ required: false })
  })

  it('refuses repeated field ids, two areas, repeated option ids and an inverted range', () => {
    const base = { id: 'f', title: 'F' }
    const area = (id: string) => ({
      id,
      type: 'area',
      label: 'Where',
      areas: [{ id: 'a', label: 'A' }],
    })
    const bad = [
      [area('x'), area('x')],
      [area('x'), area('y')],
      [
        {
          id: 'c',
          type: 'choice',
          label: 'C',
          options: [
            { id: 'a', label: 'A' },
            { id: 'a', label: 'B' },
          ],
        },
      ],
      [{ id: 'n', type: 'number', label: 'N', min: 5, max: 1 }],
    ]
    for (const fields of bad)
      expect(DecisionForm.safeParse({ ...base, fields }).success, JSON.stringify(fields)).toBe(
        false,
      )
  })

  it('refuses an unknown field type, an empty form and unknown keys', () => {
    const base = { id: 'f', title: 'F' }
    expect(DecisionForm.safeParse({ ...base, fields: [] }).success).toBe(false)
    expect(
      DecisionForm.safeParse({ ...base, fields: [{ id: 'a', type: 'file', label: 'A' }] }).success,
    ).toBe(false)
    expect(DecisionForm.safeParse({ ...WARNING_FORM, script: 'x' }).success).toBe(false)
  })
})

describe('checkSubmission', () => {
  it('accepts a complete submission and names a picked area', () => {
    const r = checkSubmission(WARNING_FORM, {
      fields: fields({ effective: '1:30', people: 40, note: ' Sirens on ' }),
      area: harbor,
    })
    expect(r).toEqual({
      ok: true,
      fields: { level: 'warning', effective: '1:30', people: 40, note: 'Sirens on' },
      area: { id: 'harbor', name: 'Harbor' },
    })
  })

  it('names the first thing wrong', () => {
    const check = (f: Record<string, string | number>, area?: object) =>
      checkSubmission(WARNING_FORM, { fields: f, area: area as never })
    expect(check({}, harbor)).toEqual({ ok: false, error: 'Level is required' })
    expect(check(fields({ level: 'siren' }), harbor)).toMatchObject({ ok: false })
    expect(check(fields())).toEqual({ ok: false, error: 'Area is required' })
    expect(check(fields(), { areaId: 'moon' })).toMatchObject({ ok: false })
    expect(check(fields({ effective: '25' }), harbor)).toMatchObject({ ok: false })
    expect(check(fields({ people: 1.5 }), harbor)).toMatchObject({ ok: false })
    expect(check(fields({ people: -1 }), harbor)).toMatchObject({ ok: false })
    expect(check(fields({ people: 'many' }), harbor)).toMatchObject({ ok: false })
    expect(check(fields({ note: 'x'.repeat(201) }), harbor)).toMatchObject({ ok: false })
    expect(check(fields({ extra: 'x' }), harbor)).toEqual({
      ok: false,
      error: 'Unknown field extra',
    })
  })

  it('accepts a drawn polygon only when the field allows drawing', () => {
    const polygon = [
      { lat: 1, lon: 1 },
      { lat: 1, lon: 2 },
      { lat: 2, lon: 2 },
    ]
    const ok = checkSubmission(WARNING_FORM, { fields: fields(), area: { polygon } })
    expect(ok).toMatchObject({ ok: true, area: { name: 'Drawn area', polygon } })
    const listOnly = DecisionForm.parse({
      ...WARNING_FORM,
      fields: WARNING_FORM.fields.map((f) => (f.type === 'area' ? { ...f, draw: false } : f)),
    })
    expect(checkSubmission(listOnly, { fields: fields(), area: { polygon } })).toMatchObject({
      ok: false,
    })
  })

  it('refuses an area on a form without one', () => {
    const noArea = DecisionForm.parse({
      id: 'f',
      title: 'F',
      fields: [{ id: 'a', type: 'text', label: 'A' }],
    })
    expect(checkSubmission(noArea, { fields: {}, area: harbor })).toMatchObject({ ok: false })
    expect(checkSubmission(noArea, { fields: {} })).toEqual({ ok: true, fields: {} })
  })
})

describe('formsForSeat', () => {
  it('keeps forms with no seat list and forms that name the role', () => {
    const open = { ...WARNING_FORM, id: 'open', seats: undefined }
    expect(formsForSeat([WARNING_FORM, open], 'pio').map((f) => f.id)).toEqual([
      'issue-warning',
      'open',
    ])
    expect(formsForSeat([WARNING_FORM, open], 'finance').map((f) => f.id)).toEqual(['open'])
    expect(formsForSeat([WARNING_FORM], undefined)).toEqual([])
  })
})

describe('records in the log', () => {
  const checked = checkSubmission(WARNING_FORM, { fields: fields(), area: harbor })
  if (!checked.ok) throw new Error('fixture')
  const record = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({
    ...buildDecisionRecord({
      id: 'dec-1',
      form: WARNING_FORM,
      checked,
      seat: { kind: 'player', roleId: 'pio', teamId: 'comms', label: 'PIO', name: 'Sam' },
      source: 'device',
      time: '2026-11-04T10:00:00.000Z',
      exerciseTime: '0:30',
    }),
    ...over,
  })
  const line = (r: DecisionRecord, over: Partial<SessionLogEntry> = {}): SessionLogEntry => ({
    i: 1,
    at: r.time,
    ex: r.exerciseTime!,
    kind: 'decision.submitted',
    actor: {
      kind: 'client',
      clientRef: 'abcd1234',
      seat: { kind: 'player', roleId: 'pio', teamId: 'comms' },
      displayName: 'Sam',
    },
    ref: { decisionId: r.id },
    data: decisionLogData(r),
    ...over,
  })

  it('carries the metrics fields: id, time, kind, area, fields, seat', () => {
    const r = record()
    expect(r).toMatchObject({
      id: 'dec-1',
      time: '2026-11-04T10:00:00.000Z',
      kind: 'warning',
      area: { id: 'harbor', name: 'Harbor' },
      fields: { level: 'warning' },
      seat: { roleId: 'pio' },
    })
  })

  it('a log line reads back as the same record', () => {
    const r = record()
    expect(decisionRecordOf(line(r))).toEqual(r)
  })

  it('logs the record under data.structured as { id, time, kind, area, fields, seat }', () => {
    const data = decisionLogData(record()) as { structured: Record<string, unknown> }
    expect(data.structured).toMatchObject({
      id: 'dec-1',
      time: '2026-11-04T10:00:00.000Z',
      kind: 'warning',
      area: { id: 'harbor' },
      fields: { level: 'warning' },
      seat: { roleId: 'pio' },
    })
  })

  it('keeps names out of the line data, so a name-free export stays name-free', () => {
    expect(JSON.stringify(decisionLogData(record()))).not.toContain('Sam')
    const stripped = line(record(), { actor: { kind: 'client', seat: { kind: 'player' } } })
    expect(decisionRecordOf(stripped)?.seat.name).toBeUndefined()
  })

  it('reads a facilitator line, ignores other kinds and malformed lines', () => {
    const r = record({
      seat: { kind: 'facilitator', roleId: 'pio', label: 'PIO' },
      source: 'facilitator',
    })
    const entries = [
      line(r, { actor: { kind: 'controller' } }),
      line(record({ id: 'x' }), { kind: 'vote.cast' }),
      line(record({ id: 'y' }), { data: { title: 'no fields' } }),
    ]
    const found = decisionRecordsFromLog(entries)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      source: 'facilitator',
      seat: { kind: 'facilitator', roleId: 'pio' },
    })
  })

  it('merges lists without repeating an id, oldest first', () => {
    const a = record({ id: 'a', time: '2026-11-04T10:05:00.000Z' })
    const b = record({ id: 'b', time: '2026-11-04T10:01:00.000Z' })
    const aAgain = record({ id: 'a', time: '2026-11-04T10:05:00.000Z', title: 'Changed' })
    expect(mergeDecisionRecords([a], [b, aAgain]).map((r) => [r.id, r.title])).toEqual([
      ['b', 'Issue a warning'],
      ['a', 'Issue a warning'],
    ])
  })
})
