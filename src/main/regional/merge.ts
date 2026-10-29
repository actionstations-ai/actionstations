// The host's merge of organization slices (spec 0440 FR-14, FR-15). Pure: it reads the rows the
// host's scenario holds now, the frame and the incoming slices, and returns for each slice what
// was added, changed and removed against the last merged version, the items it rejects and the
// warnings it raises. apply.ts writes the accepted parts.
import { exerciseMinutes } from '@shared/schemas/common'
import type { Frame, SharedInject, SharedRole, SharedRow, Slice } from '@shared/schemas/regional'

export type ConflictCode =
  'ownership' | 'stale_frame' | 'timing' | 'dependency' | 'revision' | 'duplicate'

export interface Conflict {
  code: ConflictCode
  /** `rejected` items are not merged; `warning` items are merged and shown. */
  severity: 'rejected' | 'warning'
  orgId: string
  rowId?: string
  message: string
}

export interface CurrentRow {
  id: string
  owner?: string
  revision?: number
  phaseId: string
  time: string
  from: string
  toRoleIds: string[]
  toLabel?: string
  event: string
  expectedAction: string
  purposeTag: string
  visibility?: 'exercise' | 'owner_controllers'
  publicSummary?: string
  dependsOn?: string[]
}

export interface MergeInput {
  frame: Pick<Frame, 'orgs' | 'phases' | 'roles'>
  frameVersion: number
  current: CurrentRow[]
  /** Roles in the host's scenario (id, owner). */
  currentRoles: { id: string; owner?: string }[]
  /** Slice revision merged last time, by organization. */
  merged: Record<string, number>
  slices: Slice[]
}

export interface FieldChange {
  field: string
  before: unknown
  after: unknown
}

export interface OrgMerge {
  orgId: string
  revision: number
  /** False when the whole slice is rejected (older revision, unknown organization). */
  usable: boolean
  added: string[]
  changed: { id: string; fields: FieldChange[] }[]
  removed: string[]
  /** Rows that arrive as private placeholders. */
  placeholders: string[]
  rows: SharedRow[]
  injects: SharedInject[]
  roles: SharedRole[]
  rejectedRows: string[]
  rejectedInjects: string[]
}

export interface MergeResult {
  orgs: OrgMerge[]
  conflicts: Conflict[]
}

const COMPARED = [
  'phaseId',
  'time',
  'from',
  'toRoleIds',
  'toLabel',
  'event',
  'expectedAction',
  'purposeTag',
  'visibility',
  'publicSummary',
] as const

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function diffRow(before: CurrentRow, after: SharedRow): FieldChange[] {
  const a = { ...before, visibility: before.visibility ?? 'exercise' } as Record<string, unknown>
  const b = after as unknown as Record<string, unknown>
  return COMPARED.filter((f) => !same(a[f], b[f])).map((field) => ({
    field,
    before: a[field],
    after: b[field],
  }))
}

interface Ctx {
  input: MergeInput
  conflicts: Conflict[]
  prefixOf: Map<string, string>
}

const reject = (ctx: Ctx, c: Omit<Conflict, 'severity'>): void =>
  void ctx.conflicts.push({ ...c, severity: 'rejected' })
const warn = (ctx: Ctx, c: Omit<Conflict, 'severity'>): void =>
  void ctx.conflicts.push({ ...c, severity: 'warning' })

function mergeRows(ctx: Ctx, slice: Slice, out: OrgMerge): void {
  const prefix = ctx.prefixOf.get(slice.orgId)!
  const byId = new Map(ctx.input.current.map((r) => [r.id, r]))
  const seen = new Set<string>()
  for (const row of slice.rows) {
    const orgId = slice.orgId
    const existing = byId.get(row.id)
    let problem: Omit<Conflict, 'severity'> | undefined
    if (seen.has(row.id))
      problem = {
        code: 'duplicate',
        orgId,
        rowId: row.id,
        message: `${row.id} appears twice in the slice`,
      }
    else if (row.owner !== orgId)
      problem = {
        code: 'ownership',
        orgId,
        rowId: row.id,
        message: `${row.id} is owned by ${row.owner}, not by the organization that sent it`,
      }
    else if (!row.id.startsWith(`${prefix}-`))
      problem = {
        code: 'ownership',
        orgId,
        rowId: row.id,
        message: `${row.id} is not in ${prefix}'s id range (${prefix}-…)`,
      }
    else if (existing && existing.owner !== orgId)
      problem = {
        code: 'ownership',
        orgId,
        rowId: row.id,
        message: `${row.id} belongs to another organization`,
      }
    else if (existing && row.revision < (existing.revision ?? 1))
      problem = {
        code: 'revision',
        orgId,
        rowId: row.id,
        message: `${row.id} has revision ${row.revision}; ${existing.revision ?? 1} is already merged`,
      }
    seen.add(row.id)
    if (problem) {
      reject(ctx, problem)
      out.rejectedRows.push(row.id)
      continue
    }
    out.rows.push(row)
    if (row.visibility === 'owner_controllers') out.placeholders.push(row.id)
    if (!existing) out.added.push(row.id)
    else {
      const fields = diffRow(existing, row)
      if (fields.length) out.changed.push({ id: row.id, fields })
    }
  }
  const kept = new Set(out.rows.map((r) => r.id))
  const sent = new Set(slice.rows.map((r) => r.id))
  out.removed = ctx.input.current
    .filter((r) => r.owner === slice.orgId && !sent.has(r.id) && !kept.has(r.id))
    .map((r) => r.id)
}

function mergeInjectsAndRoles(ctx: Ctx, slice: Slice, out: OrgMerge): void {
  const rowIds = new Set(out.rows.filter((r) => r.visibility === 'exercise').map((r) => r.id))
  for (const inj of slice.injects) {
    if (inj.owner !== slice.orgId || !rowIds.has(inj.mselRowId)) {
      reject(ctx, {
        code: 'ownership',
        orgId: slice.orgId,
        rowId: inj.mselRowId,
        message: `Inject ${inj.id} is not attached to a row ${slice.orgId} owns`,
      })
      out.rejectedInjects.push(inj.id)
    } else out.injects.push(inj)
  }
  const otherRoles = new Map(ctx.input.currentRoles.map((r) => [r.id, r.owner]))
  for (const role of slice.roles) {
    const owner = otherRoles.get(role.id)
    if (role.owner !== slice.orgId || (owner !== undefined && owner !== slice.orgId))
      reject(ctx, {
        code: 'ownership',
        orgId: slice.orgId,
        message: `Role ${role.id} belongs to another organization`,
      })
    else out.roles.push(role)
  }
}

function mergeSlice(ctx: Ctx, slice: Slice): OrgMerge {
  const { input } = ctx
  const out: OrgMerge = {
    orgId: slice.orgId,
    revision: slice.revision,
    usable: true,
    added: [],
    changed: [],
    removed: [],
    placeholders: [],
    rows: [],
    injects: [],
    roles: [],
    rejectedRows: [],
    rejectedInjects: [],
  }
  if (!ctx.prefixOf.has(slice.orgId)) {
    reject(ctx, {
      code: 'ownership',
      orgId: slice.orgId,
      message: `${slice.orgId} is not part of this exercise`,
    })
    return { ...out, usable: false }
  }
  if (slice.revision < (input.merged[slice.orgId] ?? 0)) {
    reject(ctx, {
      code: 'revision',
      orgId: slice.orgId,
      message: `Revision ${slice.revision} is older than the merged revision ${input.merged[slice.orgId]}`,
    })
    return { ...out, usable: false }
  }
  if (slice.frameVersion < input.frameVersion)
    warn(ctx, {
      code: 'stale_frame',
      orgId: slice.orgId,
      message: `Built on frame version ${slice.frameVersion}; the current frame is version ${input.frameVersion}. Merge it or ask them to update.`,
    })
  mergeRows(ctx, slice, out)
  mergeInjectsAndRoles(ctx, slice, out)
  return out
}

/** The rows after the merge: unchanged rows of other organizations plus every accepted row. */
function finalRows(input: MergeInput, orgs: OrgMerge[]): CurrentRow[] {
  const replaced = new Set(orgs.filter((o) => o.usable).map((o) => o.orgId))
  const kept = input.current.filter((r) => !r.owner || !replaced.has(r.owner))
  const incoming = orgs.flatMap((o) => o.rows)
  return [
    ...kept,
    ...incoming.map((r) => ({ ...r, dependsOn: r.dependsOn }) as CurrentRow),
    ...input.current.filter(
      (r) => r.owner && replaced.has(r.owner) && orgs.some((o) => o.rejectedRows.includes(r.id)),
    ),
  ]
}

function checkTiming(ctx: Ctx, rows: CurrentRow[], touched: Set<string>): void {
  const phases = new Map(ctx.input.frame.phases.map((p) => [p.id, p]))
  const roleOwner = new Map(ctx.input.frame.roles.map((r) => [r.id, r.owner]))
  for (const r of ctx.input.currentRoles) if (r.owner) roleOwner.set(r.id, r.owner)
  const slots = new Map<string, string>()
  for (const row of rows) {
    if (!row.owner || !touched.has(row.owner)) continue
    const phase = phases.get(row.phaseId)
    const t = exerciseMinutes(row.time)
    if (phase && (t < exerciseMinutes(phase.startTime) || t > exerciseMinutes(phase.endTime)))
      warn(ctx, {
        code: 'timing',
        orgId: row.owner,
        rowId: row.id,
        message: `${row.id} at ${row.time} is outside its phase (${phase.startTime} to ${phase.endTime})`,
      })
    for (const role of row.toRoleIds) {
      const owner = roleOwner.get(role)
      if (owner && owner !== row.owner)
        warn(ctx, {
          code: 'timing',
          orgId: row.owner,
          rowId: row.id,
          message: `${row.id} targets ${role}, a role of ${owner}`,
        })
      const key = `${role}@${row.time}`
      const other = slots.get(key)
      if (other)
        warn(ctx, {
          code: 'timing',
          orgId: row.owner,
          rowId: row.id,
          message: `${row.id} and ${other} both target ${role} at ${row.time}`,
        })
      slots.set(key, row.id)
    }
  }
}

function checkDependencies(ctx: Ctx, rows: CurrentRow[], orgs: OrgMerge[]): void {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const removed = orgs.flatMap((o) => o.removed)
  for (const row of rows) {
    for (const dep of row.dependsOn ?? []) {
      const target = byId.get(dep)
      if (!target)
        warn(ctx, {
          code: 'dependency',
          orgId: row.owner ?? '',
          rowId: row.id,
          message: `${row.id} depends on ${dep}, which is not in the exercise`,
        })
      else if (exerciseMinutes(target.time) > exerciseMinutes(row.time))
        warn(ctx, {
          code: 'dependency',
          orgId: row.owner ?? '',
          rowId: row.id,
          message: `${row.id} depends on ${dep}, which now comes later (${target.time})`,
        })
    }
    for (const gone of removed) {
      const text = `${row.event} ${row.expectedAction}`
      if (row.owner && !gone.startsWith(`${row.owner.toUpperCase()}-`) && text.includes(gone))
        warn(ctx, {
          code: 'dependency',
          orgId: row.owner,
          rowId: row.id,
          message: `${row.id} refers to ${gone}, which was removed`,
        })
    }
  }
}

export function mergeSlices(input: MergeInput): MergeResult {
  const ctx: Ctx = {
    input,
    conflicts: [],
    prefixOf: new Map(input.frame.orgs.map((o) => [o.orgId, o.prefix])),
  }
  const orgs = input.slices.map((s) => mergeSlice(ctx, s))
  const rows = finalRows(input, orgs)
  const touched = new Set(orgs.filter((o) => o.usable).map((o) => o.orgId))
  checkTiming(ctx, rows, touched)
  checkDependencies(ctx, rows, orgs)
  return { orgs, conflicts: ctx.conflicts }
}
