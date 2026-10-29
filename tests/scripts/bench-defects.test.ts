// scripts/bench/defects.mjs: planted defects for the critique task of the benchmark (#434).
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadDefects,
  loadExample,
  loadSuite,
  ROOT,
  shippedScenario,
} from '../../scripts/bench/corpus.mjs'
import { applyDefects, DEFECT_KINDS, noteMatches } from '../../scripts/bench/defects.mjs'
import type { DefectSpec } from '../../scripts/bench/defects.d.mts'
import type { RowLike, ScenarioLike } from '../../scripts/bench/types.d.mts'

const row = (id: string, time: string, over: Partial<RowLike> = {}): RowLike => ({
  id,
  phaseId: 'p1',
  time,
  from: 'Facilitator',
  toRoleIds: ['ops'],
  event: `Event ${id} on MBW-HMI-02`,
  expectedAction: `Action ${id}`,
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  ...over,
})

const scenario = (): ScenarioLike => ({
  phases: [{ id: 'p1', index: 0 }],
  roles: [{ id: 'ops' }],
  msel: [
    row('START', '0:00', { purposeTag: 'STARTEX' }),
    row('I-01', '0:10'),
    row('I-02', '0:20', {
      purposeTag: 'DECISION_POINT',
      expectedAction: 'DECISION POINT: Ops decides.',
    }),
    row('I-03', '0:30'),
  ],
  warnings: [{ code: 'OLD', severity: 'info', message: 'stored' }],
  provenance: [],
})

const apply = (defect: Omit<DefectSpec, 'id' | 'words'>) =>
  applyDefects(scenario(), { defects: [{ id: 'd', words: ['x'], ...defect }] })

describe('applyDefects', () => {
  it('works on a copy and clears the stored warnings', () => {
    const original = scenario()
    const { scenario: s } = applyDefects(original, {
      defects: [
        { id: 'd', kind: 'player_inject', row: 'I-01', set: { from: 'Ops' }, words: ['player'] },
      ],
    })
    expect(original.msel[1]!.from).toBe('Facilitator')
    expect(s.msel[1]!.from).toBe('Ops')
    expect(s.warnings).toEqual([])
  })

  it('moves a row out of order and accepts notes on it or its neighbours', () => {
    const { scenario: s, planted } = apply({
      kind: 'time_order',
      row: 'I-02',
      set: { time: '0:05' },
    })
    expect(s.msel[2]!.time).toBe('0:05')
    expect(planted[0]!.rows).toEqual(['I-01', 'I-02', 'I-03'])
  })

  it('duplicates a row right after the original under a new id', () => {
    const { scenario: s, planted } = apply({ kind: 'duplicate_row', row: 'I-01', copyId: 'I-01x' })
    expect(s.msel.map((r) => r.id)).toEqual(['START', 'I-01', 'I-01x', 'I-02', 'I-03'])
    expect(s.msel[2]!.event).toBe(s.msel[1]!.event)
    expect(planted[0]!.rows).toEqual(['I-01', 'I-01x'])
  })

  it('removes the decision point tag and its label, and accepts notes on any row', () => {
    const { scenario: s, planted } = apply({ kind: 'missing_decision_point' })
    expect(s.msel.some((r) => r.purposeTag === 'DECISION_POINT')).toBe(false)
    expect(s.msel[2]!.expectedAction).toBe('Ops decides.')
    expect(planted[0]).toMatchObject({ rows: ['I-02'], anyRow: true })
  })

  it('replaces a facility identifier and fails loudly when the text is not there', () => {
    const replace = [{ field: 'event', find: 'MBW-HMI-02', with: 'MBW-HMI-07' }]
    const { scenario: s } = apply({ kind: 'unknown_facility_id', row: 'I-03', replace })
    expect(s.msel[4 - 1]!.event).toBe('Event I-03 on MBW-HMI-07')
    expect(() =>
      apply({
        kind: 'unknown_facility_id',
        row: 'I-03',
        replace: [{ field: 'event', find: 'NOPE', with: 'X' }],
      }),
    ).toThrow(/NOPE/)
  })

  it('refuses unknown kinds, rows and fields', () => {
    expect(() => apply({ kind: 'made_up', row: 'I-01' })).toThrow(/unknown kind/)
    expect(() => apply({ kind: 'fast_restoration', row: 'I-99', set: { event: 'x' } })).toThrow(
      /no row/,
    )
    expect(() => apply({ kind: 'fast_restoration', row: 'I-01', set: { id: 'x' } })).toThrow(
      /cannot set/,
    )
  })

  it('is deterministic', () => {
    const a = apply({ kind: 'time_order', row: 'I-02', set: { time: '0:05' } })
    const b = apply({ kind: 'time_order', row: 'I-02', set: { time: '0:05' } })
    expect(a).toEqual(b)
  })
})

describe('noteMatches', () => {
  const planted = {
    id: 'p',
    kind: 'time_order',
    words: ['Order', 'sequence'],
    rows: ['I-02'],
    anyRow: false,
  }

  it('needs the right row and one of the words, in the message or the suggestion', () => {
    expect(noteMatches({ rowId: 'I-02', message: 'This is out of ORDER' }, planted)).toBe(true)
    expect(
      noteMatches({ rowId: 'I-02', message: 'Odd', suggestion: 'Fix the sequence' }, planted),
    ).toBe(true)
    expect(noteMatches({ rowId: 'I-03', message: 'out of order' }, planted)).toBe(false)
    expect(noteMatches({ rowId: 'I-02', message: 'weak wording' }, planted)).toBe(false)
  })

  it('takes a note without a row only for defects that allow any row', () => {
    expect(noteMatches({ message: 'out of order' }, planted)).toBe(false)
    expect(noteMatches({ message: 'out of order' }, { ...planted, anyRow: true })).toBe(true)
  })
})

describe('the shipped defect files', () => {
  const files = readdirSync(join(ROOT, 'bench', 'defects')).map((f) => f.replace(/\.json$/, ''))

  it.each(files)('%s applies cleanly to its example scenario', (name) => {
    const file = loadDefects(name)
    const source = shippedScenario(loadExample(file.example!), file.scenario!)
    const { planted } = applyDefects(source, file)
    expect(planted.length).toBe(file.defects.length)
    for (const p of planted) expect(p.rows.length).toBeGreaterThan(0)
  })

  it('cover every defect kind in the quick suite and are all used by the standard suite', () => {
    const kinds = (suite: string) =>
      new Set(
        loadSuite(suite).critique.flatMap((c) =>
          loadDefects(c.defects!).defects.map((d) => d.kind),
        ),
      )
    expect([...kinds('quick')].sort()).toEqual([...DEFECT_KINDS].sort())
    expect(
      loadSuite('standard')
        .critique.map((c) => c.defects)
        .sort(),
    ).toEqual([...files].sort())
  })
})
