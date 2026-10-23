// #207: inject runs go stale when their MSEL row changes or disappears.
import { describe, expect, it } from 'vitest'
import type { MselRow, Scenario, StageRun } from '@shared/schemas'
import { changedInjects, describeStaleInjects, markInjectsStale } from './inject-stale'

const row = (id: string, extra: Partial<MselRow> = {}): MselRow => ({
  id,
  phaseId: 'P1',
  time: '0:10',
  from: 'Helpdesk',
  toRoleIds: ['it'],
  event: `Ticket for ${id}`,
  expectedAction: 'IT triages.',
  purposeTag: 'CORE_NARRATIVE',
  format: 'helpdesk_ticket',
  citations: [],
  locked: false,
  ...extra,
})

const run = (stage: StageRun['stage'], itemId?: string, status: StageRun['status'] = 'ok') =>
  ({
    stage,
    ...(itemId ? { itemId } : {}),
    startedAt: 'x',
    finishedAt: 'x',
    status,
    repairAttempts: 0,
  }) as StageRun

describe('changedInjects', () => {
  const before = [
    row('I-01', { injectId: 'A' }),
    row('I-02', { injectId: 'B' }),
    row('I-03', { injectId: 'C' }),
    row('I-04', { injectId: 'D' }),
    row('I-05'),
  ]

  it('reports rows whose event, expected action or format changed, and removed rows', () => {
    const after = [
      row('I-01', { injectId: 'A', event: 'New text' }),
      row('I-02', { injectId: 'B', expectedAction: 'Ops acts.' }),
      row('I-03', { injectId: 'C', format: 'email' }),
      row('I-05', { event: 'changed but has no inject' }),
    ]
    expect(changedInjects(before, after)).toEqual([
      { rowId: 'I-01', injectId: 'A', removed: false },
      { rowId: 'I-02', injectId: 'B', removed: false },
      { rowId: 'I-03', injectId: 'C', removed: false },
      { rowId: 'I-04', injectId: 'D', removed: true },
    ])
  })

  it('ignores changes the inject is not written from (time, recipients, citations, lock)', () => {
    const after = before.map((r) => ({ ...r, time: '0:20', toRoleIds: ['ops'], locked: true }))
    expect(changedInjects(before, after)).toEqual([])
  })
})

describe('markInjectsStale', () => {
  it('msel_phase re-run: the changed row’s inject_text and media_render runs become stale', () => {
    const before = [row('I-01', { injectId: 'INJ1' }), row('I-02', { injectId: 'INJ2' })]
    const s = {
      msel: [row('I-01', { injectId: 'INJ1', event: 'Rewritten' }), before[1]!],
      provenance: [
        run('msel_phase', 'P1'),
        run('controller_handbook'),
        run('inject_text', 'INJ1'),
        run('media_render', 'INJ1'),
        run('inject_text', 'INJ2'),
        run('media_render', 'INJ2', 'error'),
      ],
    } as unknown as Scenario
    const stale = markInjectsStale(before, s)
    expect(stale).toEqual([{ rowId: 'I-01', injectId: 'INJ1', removed: false }])
    expect(s.provenance.map((r) => r.status)).toEqual(['ok', 'ok', 'stale', 'stale', 'ok', 'error'])
    expect(describeStaleInjects(stale)).toMatch(/rows I-01 changed/)
  })

  it('reports nothing when no inject had an ok run', () => {
    const before = [row('I-01', { injectId: 'INJ1' })]
    const s = { msel: [], provenance: [run('inject_text', 'INJ1', 'error')] } as unknown as Scenario
    expect(markInjectsStale(before, s)).toEqual([])
    expect(describeStaleInjects([])).toBeUndefined()
  })
})
