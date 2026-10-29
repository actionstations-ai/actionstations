import { describe, expect, it } from 'vitest'
import { mergeSlices, type CurrentRow, type MergeInput } from './merge'
import { frame, row, slice } from './fixtures/exercise'

const f = frame()
const base = (over: Partial<MergeInput> = {}): MergeInput => ({
  frame: f,
  frameVersion: 1,
  current: [],
  currentRoles: f.roles.map((r) => ({ id: r.id, owner: r.owner })),
  merged: {},
  slices: [],
  ...over,
})
const asCurrent = (r: ReturnType<typeof row>): CurrentRow => ({ ...r })
const codes = (r: ReturnType<typeof mergeSlices>) =>
  r.conflicts.map((c) => `${c.severity}:${c.code}`)

describe('mergeSlices', () => {
  it('adds the rows of a clean slice and reports no conflicts', () => {
    const r = mergeSlices(base({ slices: [slice('air', 1, [row('air', 1), row('air', 2)])] }))
    expect(r.orgs[0]?.added).toEqual(['AIR-I-01', 'AIR-I-02'])
    expect(r.orgs[0]?.injects).toHaveLength(2)
    expect(r.conflicts).toEqual([])
  })

  it('shows field-level changes against the last merged version', () => {
    const before = asCurrent(row('air', 1))
    const after = row('air', 1, { event: 'New event', revision: 2, time: '0:15' })
    const r = mergeSlices(base({ current: [before], slices: [slice('air', 2, [after])] }))
    expect(r.orgs[0]?.changed).toEqual([
      {
        id: 'AIR-I-01',
        fields: [
          { field: 'time', before: '0:10', after: '0:15' },
          { field: 'event', before: 'AIR event 1', after: 'New event' },
        ],
      },
    ])
  })

  it('lists removed rows', () => {
    const r = mergeSlices(
      base({
        current: [asCurrent(row('air', 1)), asCurrent(row('air', 2))],
        slices: [slice('air', 2, [row('air', 1)])],
      }),
    )
    expect(r.orgs[0]?.removed).toEqual(['AIR-I-02'])
  })

  it('rejects a row owned by another organization (ownership)', () => {
    const r = mergeSlices(base({ slices: [slice('air', 1, [row('air', 1), row('hosp', 2)])] }))
    expect(r.orgs[0]?.rejectedRows).toEqual(['HOSP-I-02'])
    expect(codes(r)).toContain('rejected:ownership')
  })

  it('rejects a row outside the organization id range', () => {
    const odd = row('air', 1, { id: 'I-01' })
    const r = mergeSlices(base({ slices: [slice('air', 1, [odd])] }))
    expect(r.orgs[0]?.rejectedRows).toEqual(['I-01'])
  })

  it('rejects an overwrite of a row the host holds for another organization', () => {
    const hosp = asCurrent(row('hosp', 1))
    const forged = row('air', 1, { id: 'AIR-I-01', owner: 'air' })
    const r = mergeSlices(
      base({
        current: [{ ...hosp, id: 'AIR-I-01', owner: 'hosp' }],
        slices: [slice('air', 1, [forged])],
      }),
    )
    expect(r.orgs[0]?.rejectedRows).toEqual(['AIR-I-01'])
  })

  it('rejects a revision regression and a whole older slice', () => {
    const current = [asCurrent(row('air', 1, { revision: 3 }))]
    const regress = mergeSlices(
      base({ current, slices: [slice('air', 5, [row('air', 1, { revision: 2 })])] }),
    )
    expect(codes(regress)).toContain('rejected:revision')
    const older = mergeSlices(base({ merged: { air: 4 }, slices: [slice('air', 3)] }))
    expect(older.orgs[0]?.usable).toBe(false)
  })

  it('rejects an inject that is not attached to an accepted row of its owner', () => {
    const s = slice('air')
    s.injects[0]!.mselRowId = 'AIR-I-99'
    const r = mergeSlices(base({ slices: [s] }))
    expect(r.orgs[0]?.rejectedInjects).toHaveLength(1)
  })

  it('rejects a role owned by another organization', () => {
    const s = slice('air')
    s.roles = [{ ...f.roles[2]!, owner: 'air' }]
    const r = mergeSlices(base({ slices: [s] }))
    expect(r.orgs[0]?.roles).toEqual([])
    expect(codes(r)).toContain('rejected:ownership')
  })

  it('rejects a duplicate id in one slice', () => {
    const r = mergeSlices(base({ slices: [slice('air', 1, [row('air', 1), row('air', 1)])] }))
    expect(codes(r)).toContain('rejected:duplicate')
  })

  it('warns when the slice was built on an older frame', () => {
    const r = mergeSlices(base({ frameVersion: 3, slices: [slice('air')] }))
    expect(codes(r)).toEqual(['warning:stale_frame'])
  })

  it('warns when two rows target one role at one time, or a row leaves its phase', () => {
    const clash = mergeSlices(
      base({
        slices: [
          slice('air', 1, [row('air', 1, { time: '0:20' }), row('air', 2, { time: '0:20' })]),
        ],
      }),
    )
    expect(clash.conflicts.some((c) => c.code === 'timing' && /both target/.test(c.message))).toBe(
      true,
    )
    const outside = mergeSlices(
      base({ slices: [slice('air', 1, [row('air', 1, { time: '1:30' })])] }),
    )
    expect(outside.conflicts.some((c) => /outside its phase/.test(c.message))).toBe(true)
  })

  it('warns when a row targets a role of another organization', () => {
    const r = mergeSlices(
      base({ slices: [slice('air', 1, [row('air', 1, { toRoleIds: ['hosp-ops'] })])] }),
    )
    expect(r.conflicts.some((c) => /a role of hosp/.test(c.message))).toBe(true)
  })

  it('warns when a dependency is missing or moved after the row that needs it', () => {
    const dep = asCurrent(row('hosp', 3, { time: '0:40' }))
    const needs = row('air', 1, { time: '0:10', dependsOn: ['HOSP-I-03', 'HOSP-I-77'] })
    const r = mergeSlices(base({ current: [dep], slices: [slice('air', 1, [needs])] }))
    const messages = r.conflicts.filter((c) => c.code === 'dependency').map((c) => c.message)
    expect(messages).toHaveLength(2)
    expect(messages.join(' ')).toMatch(/now comes later/)
  })

  it('warns when a row mentions another organization row that was removed', () => {
    const hosp = asCurrent(row('hosp', 3))
    const mentions = asCurrent(
      row('air', 1, { expectedAction: 'Wait for HOSP-I-03 before acting' }),
    )
    const r = mergeSlices(base({ current: [hosp, mentions], slices: [slice('hosp', 2, [])] }))
    expect(r.orgs[0]?.removed).toEqual(['HOSP-I-03'])
    expect(r.conflicts.filter((c) => c.code === 'dependency').map((c) => c.rowId)).toEqual([
      'AIR-I-01',
    ])
  })

  it('counts private rows as placeholders', () => {
    const priv = row('air', 1, {
      visibility: 'owner_controllers',
      publicSummary: 'AIR internal escalation inject',
      expectedAction: '',
    })
    const s = slice('air', 1, [priv])
    const r = mergeSlices(base({ slices: [s] }))
    expect(r.orgs[0]?.placeholders).toEqual(['AIR-I-01'])
    expect(r.orgs[0]?.injects).toEqual([])
  })

  it('merges eight slices of 300 rows in well under five seconds', () => {
    const orgs = Array.from({ length: 8 }, (_, i) => ({
      orgId: `org${i}`,
      name: `Org ${i}`,
      prefix: `ORG${'ABCDEFGH'[i]}`,
    }))
    const big = frame({ orgs, roles: [] })
    const slices = orgs.map((o) => ({
      orgId: o.orgId,
      revision: 1,
      frameVersion: 1,
      roles: [],
      injects: [],
      proposals: [],
      rows: Array.from({ length: 300 }, (_, n) =>
        row('air', 1, {
          id: `${o.prefix}-I-${n}`,
          owner: o.orgId,
          time: `0:${String(n % 60).padStart(2, '0')}`,
          toRoleIds: [`r${n}`],
        }),
      ),
    }))
    const t0 = Date.now()
    const r = mergeSlices({
      frame: big,
      frameVersion: 1,
      current: [],
      currentRoles: [],
      merged: {},
      slices,
    })
    expect(Date.now() - t0).toBeLessThan(5000)
    expect(r.orgs.every((o) => o.rows.length === 300)).toBe(true)
  })
})
