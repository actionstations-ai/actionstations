// Writes merged or joined exercise material into a scenario (spec 0440 FR-3, FR-16). The
// functions that change a Scenario are pure; media files are written under the scenario's own
// media folder, never at a path the bundle chose.
import { extname } from 'node:path'
import { MediaKind } from '@shared/schemas/media'
import { MselRow, type Inject, type Scenario } from '@shared/schemas'
import type { Role } from '@shared/schemas/project'
import { exerciseMinutes } from '@shared/schemas/common'
import { Inject as InjectSchema } from '@shared/schemas/inject'
import type { Frame, SharedInject, SharedRole, SharedRow } from '@shared/schemas/regional'
import { ensureDir, safeJoin, writeFileAtomic } from '../lib/fs'

export function rowFromShared(r: SharedRow): MselRow {
  return MselRow.parse({
    ...r,
    // A placeholder stays a placeholder: no inject, no expected action.
    ...(r.visibility === 'owner_controllers' ? { injectId: undefined, expectedAction: '' } : {}),
    locked: true,
  })
}

const roleFromShared = (r: SharedRole): Role => ({
  id: r.id,
  name: r.name,
  abbreviation: r.abbreviation,
  team: r.team,
  description: r.description,
  standingOrders: r.standingOrders,
  owner: r.owner,
})

const byTime = (a: MselRow, b: MselRow): number => exerciseMinutes(a.time) - exerciseMinutes(b.time)

/** Stable sort by exercise time; equal times keep their order. */
export const sortRows = (rows: MselRow[]): MselRow[] =>
  rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => byTime(a.r, b.r) || a.i - b.i)
    .map(({ r }) => r)

export interface OrgContent {
  orgId: string
  rows: SharedRow[]
  roles: SharedRole[]
  /** Ids of this organization's rows that are gone. */
  removed: string[]
  /** Rows the host rejected: keep what the scenario already holds for them. */
  rejectedRows?: string[]
}

/** Replace one organization's rows and roles in the scenario with its accepted content. */
export function applyOrgRows(scenario: Scenario, org: OrgContent): Scenario {
  const gone = new Set(org.removed)
  const incoming = new Map(org.rows.map((r) => [r.id, rowFromShared(r)]))
  const kept = scenario.msel.filter((r) => !gone.has(r.id) && !incoming.has(r.id))
  const roles = scenario.roles.filter((r) => r.owner !== org.orgId)
  return {
    ...scenario,
    msel: sortRows([...kept, ...incoming.values()]),
    roles: [...roles, ...org.roles.map(roleFromShared)],
  }
}

/** The frame's shared parts replace the participant's copy; the participant's own roles stay. */
export function applyFrame(scenario: Scenario, frame: Frame, thisOrg: string): Scenario {
  const own = scenario.roles.filter((r) => r.owner === thisOrg)
  const others = frame.roles.filter((r) => r.owner !== thisOrg).map(roleFromShared)
  const shared = frame.sharedRows.map(rowFromShared)
  const sharedIds = new Set(shared.map((r) => r.id))
  return {
    ...scenario,
    title: frame.title,
    overview: {
      theme: frame.overview.theme,
      threat: frame.overview.threat,
      operationalImpact: frame.overview.operationalImpact,
      coreSectionsTested: scenario.overview?.coreSectionsTested ?? [],
      targetAudience: scenario.overview?.targetAudience ?? '',
      location: scenario.overview?.location ?? '',
    },
    objectives: frame.objectives.map(({ id, name, text }) => ({ id, name, text })),
    phases: frame.phases,
    roles: [...others, ...own],
    msel: sortRows([...scenario.msel.filter((r) => !sharedIds.has(r.id)), ...shared]),
  }
}

/** Write the media of accepted injects into the scenario's media folder and build the Inject. */
export async function injectFromShared(
  root: string,
  scenarioId: string,
  i: SharedInject,
  media: ReadonlyMap<string, Buffer>,
  existing: Inject | undefined,
  now: string,
): Promise<Inject> {
  const assets = []
  for (const a of i.assets) {
    const bytes = media.get(a.path)
    const kind = MediaKind.safeParse(a.kind)
    if (!bytes || !kind.success) continue
    const rel = `scenarios/${scenarioId}/media/${i.id}/${a.id}${extname(a.path)}`
    await ensureDir(safeJoin(root, 'scenarios', scenarioId, 'media', i.id))
    await writeFileAtomic(safeJoin(root, rel), bytes)
    assets.push({
      id: a.id,
      kind: kind.data,
      path: rel,
      role: a.role,
      ...(a.width !== undefined ? { width: a.width } : {}),
      ...(a.height !== undefined ? { height: a.height } : {}),
      ...(a.durationSec !== undefined ? { durationSec: a.durationSec } : {}),
      provenance: { provider: 'exercise-bundle', createdAt: now },
    })
  }
  return InjectSchema.parse({
    ...(existing ?? {}),
    id: i.id,
    mselRowId: i.mselRowId,
    type: i.type,
    title: i.title,
    deliveryMode: i.deliveryMode,
    fields: i.fields,
    variant: i.variant,
    instructorNote: i.instructorNote,
    citations: i.citations,
    assets,
    includeInDeck: i.includeInDeck,
    owner: i.owner,
    revision: i.revision,
    locked: true,
    updatedAt: now,
  })
}

/** Rename a row (and what points at it) so every row this organization wrote is `<PREFIX>-…`. */
export function claimRows(
  scenario: Scenario,
  injects: Inject[],
  org: string,
  prefix: string,
  isShared: (r: MselRow) => boolean,
): { scenario: Scenario; injects: Inject[]; changed: boolean } {
  const rename = new Map<string, string>()
  const msel = scenario.msel.map((r) => {
    if (r.owner !== undefined || isShared(r)) return r
    const id = r.id.startsWith(`${prefix}-`) ? r.id : `${prefix}-${r.id}`
    if (id !== r.id) rename.set(r.id, id)
    return { ...r, id, owner: org }
  })
  const fix = (ids: string[] | undefined) => ids?.map((d) => rename.get(d) ?? d)
  const relinked = msel.map((r) => (r.dependsOn ? { ...r, dependsOn: fix(r.dependsOn) } : r))
  const roles = scenario.roles.map((r) => (r.owner === undefined ? { ...r, owner: org } : r))
  const claimed = injects.map((i) => {
    const row = relinked.find((r) => r.id === (rename.get(i.mselRowId) ?? i.mselRowId))
    return row?.owner === org && i.owner !== org ? { ...i, mselRowId: row.id, owner: org } : i
  })
  const changed =
    rename.size > 0 ||
    msel.some((r, n) => r !== scenario.msel[n]) ||
    roles.some((r, n) => r !== scenario.roles[n]) ||
    claimed.some((i, n) => i !== injects[n])
  return { scenario: { ...scenario, msel: relinked, roles }, injects: claimed, changed }
}
