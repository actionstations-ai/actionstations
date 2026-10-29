// Builds the frame and one organization's slice from a scenario (spec 0440 FR-5 to FR-11).
// Only fields the Shared* schemas list are copied (the allow-list), citations are reduced to
// document title and heading path unless the owner shares quotes (FR-10), and a row marked
// private to the owner's controllers leaves as a placeholder (FR-11).
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import type { Inject, MselRow, Role, Scenario } from '@shared/schemas'
import type { Citation } from '@shared/schemas/common'
import type {
  Frame,
  LocalRevisions,
  RegionalState,
  SharedCitation,
  SharedInject,
  SharedRole,
  SharedRow,
  Slice,
} from '@shared/schemas/regional'
import { MEDIA_EXTENSIONS, mediaPath } from './allowlist'
import { canonicalJson } from './canonical'

export interface ShareOptions {
  shareQuotes: boolean
}

export const SHARED_ROW_ID = /^(START|END|STARTEX|ENDEX)$|^TJ-|^PH-/

/** Rows the host owns for everyone: STARTEX, ENDEX, time jumps and phase changes (FR-5). */
export const isSharedRow = (row: Pick<MselRow, 'id' | 'format'>): boolean =>
  SHARED_ROW_ID.test(row.id) || row.format === 'time_jump'

const hash = (v: unknown): string =>
  createHash('sha256').update(canonicalJson(v)).digest('hex').slice(0, 16)

/** A short stable id for a document, so the reader learns no local id. */
const publicDocId = (c: Citation): string =>
  'doc-' + createHash('sha256').update(c.documentTitle).digest('hex').slice(0, 12)

export function sharedCitation(c: Citation, o: ShareOptions): SharedCitation {
  return {
    documentId: publicDocId(c),
    documentTitle: c.documentTitle,
    headingPath: c.headingPath,
    ...(o.shareQuotes && c.page !== undefined ? { page: c.page } : {}),
    ...(o.shareQuotes && c.quote !== undefined ? { quote: c.quote } : {}),
  }
}

/** The row as shared, with a placeholder when it is private to the owner's controllers. */
export function toSharedRow(
  row: MselRow,
  owner: string,
  revision: number,
  o: ShareOptions,
): SharedRow {
  const base = {
    id: row.id,
    phaseId: row.phaseId,
    time: row.time,
    ...(row.wallClock ? { wallClock: row.wallClock } : {}),
    from: row.from,
    toRoleIds: row.toRoleIds,
    ...(row.toLabel ? { toLabel: row.toLabel } : {}),
    purposeTag: row.purposeTag,
    owner,
    revision,
  }
  if (row.visibility === 'owner_controllers') {
    const summary = row.publicSummary?.trim() || 'Private inject'
    return {
      ...base,
      event: summary,
      expectedAction: '',
      citations: [],
      visibility: 'owner_controllers',
      publicSummary: summary,
    }
  }
  return {
    ...base,
    event: row.event,
    expectedAction: row.expectedAction,
    ...(row.format ? { format: row.format } : {}),
    ...(row.injectId ? { injectId: row.injectId } : {}),
    citations: row.citations.map((c) => sharedCitation(c, o)),
    visibility: 'exercise',
    ...(row.dependsOn?.length ? { dependsOn: row.dependsOn } : {}),
  }
}

export interface MediaSource {
  bundlePath: string
  /** Project-root-relative path of the file on this computer. */
  projectRel: string
}

export function toSharedInject(
  inject: Inject,
  owner: string,
  prefix: string,
  revision: number,
  o: ShareOptions,
): { inject: SharedInject; media: MediaSource[] } {
  const media: MediaSource[] = []
  const assets = inject.assets.flatMap((a) => {
    const ext = extname(a.path).slice(1).toLowerCase()
    if (!MEDIA_EXTENSIONS.includes(ext)) return []
    const bundlePath = mediaPath(prefix, inject.id, a.id, ext)
    media.push({ bundlePath, projectRel: a.path })
    return [
      {
        id: a.id,
        kind: a.kind,
        path: bundlePath,
        role: a.role,
        ...(a.width !== undefined ? { width: a.width } : {}),
        ...(a.height !== undefined ? { height: a.height } : {}),
        ...(a.durationSec !== undefined ? { durationSec: a.durationSec } : {}),
      },
    ]
  })
  return {
    media,
    inject: {
      id: inject.id,
      mselRowId: inject.mselRowId,
      type: inject.type,
      title: inject.title,
      deliveryMode: inject.deliveryMode,
      fields: inject.fields,
      ...(inject.variant ? { variant: inject.variant } : {}),
      ...(inject.instructorNote ? { instructorNote: inject.instructorNote } : {}),
      citations: inject.citations.map((c) => sharedCitation(c, o)),
      assets,
      includeInDeck: inject.includeInDeck,
      owner,
      revision,
    },
  }
}

const toSharedRole = (r: Role, owner: string): SharedRole => ({
  id: r.id,
  name: r.name,
  abbreviation: r.abbreviation,
  team: r.team,
  description: r.description,
  standingOrders: r.standingOrders,
  owner: r.owner ?? owner,
})

/** The next revision for each item: unchanged content keeps its revision (FR-8). */
export function nextRevisions<T>(
  items: { id: string; content: T }[],
  previous: LocalRevisions['rows'],
): { revisions: Map<string, number>; record: LocalRevisions['rows'] } {
  const revisions = new Map<string, number>()
  const record: LocalRevisions['rows'] = {}
  for (const { id, content } of items) {
    const h = hash(content)
    const prev = previous[id]
    const revision = !prev ? 1 : prev.hash === h ? prev.revision : prev.revision + 1
    revisions.set(id, revision)
    record[id] = { hash: h, revision }
  }
  return { revisions, record }
}

export const isOwnRow = (row: MselRow, thisOrg: string): boolean =>
  row.owner === thisOrg || (row.owner === undefined && !isSharedRow(row))

export function buildFrame(scenario: Scenario, state: RegionalState, o: ShareOptions): Frame {
  const rows = scenario.msel.filter((r) => isSharedRow(r))
  const shared = rows.map((r) => toSharedRow(r, state.hostOrg, r.revision ?? 1, o))
  return {
    title: scenario.title,
    hostOrg: state.hostOrg,
    orgs: state.orgs.map(({ orgId, name, prefix }) => ({ orgId, name, prefix })),
    overview: {
      theme: scenario.overview?.theme ?? '',
      threat: scenario.overview?.threat ?? '',
      operationalImpact: scenario.overview?.operationalImpact ?? '',
    },
    objectives: scenario.objectives.map((ob) => ({ id: ob.id, name: ob.name, text: ob.text })),
    phases: scenario.phases,
    roles: scenario.roles.map((r) => toSharedRole(r, state.hostOrg)),
    sharedRows: shared,
    crossOrgChannels: state.crossOrgChannels,
    shareFullLog: state.shareFullLog,
  }
}

export interface SliceParts {
  slice: Slice
  media: MediaSource[]
  local: LocalRevisions
}

/** This organization's slice: its rows, their injects and media, its roles and proposals. */
export function buildSlice(
  scenario: Scenario,
  injects: Inject[],
  state: RegionalState,
  prefix: string,
  o: ShareOptions,
): SliceParts {
  const me = state.thisOrg
  const mine = scenario.msel.filter((r) => isOwnRow(r, me))
  const rowRev = nextRevisions(
    mine.map((r) => ({ id: r.id, content: toSharedRow(r, me, 0, o) })),
    state.local.rows,
  )
  const privateIds = new Set(
    mine.filter((r) => r.visibility === 'owner_controllers').map((r) => r.id),
  )
  const shareable = injects.filter(
    (i) => mine.some((r) => r.id === i.mselRowId) && !privateIds.has(i.mselRowId),
  )
  const injRev = nextRevisions(
    shareable.map((i) => ({ id: i.id, content: toSharedInject(i, me, prefix, 0, o).inject })),
    state.local.injects,
  )
  const media: MediaSource[] = []
  const sharedInjects = shareable.map((i) => {
    const out = toSharedInject(i, me, prefix, injRev.revisions.get(i.id)!, o)
    media.push(...out.media)
    return out.inject
  })
  const slice: Slice = {
    orgId: me,
    revision: state.local.slice + 1,
    frameVersion: state.frameVersion,
    roles: scenario.roles.filter((r) => r.owner === me).map((r) => toSharedRole(r, me)),
    rows: mine.map((r) => toSharedRow(r, me, rowRev.revisions.get(r.id)!, o)),
    injects: sharedInjects,
    proposals: state.proposals.filter((p) => p.fromOrg === me || p.toOrg === me),
  }
  return {
    slice,
    media,
    local: { slice: slice.revision, rows: rowRev.record, injects: injRev.record },
  }
}

/** Another organization's accepted content, for the merged bundle the host sends to everyone. */
export function buildForeignSlice(
  scenario: Scenario,
  injects: Inject[],
  state: RegionalState,
  org: string,
  prefix: string,
  o: ShareOptions,
): { slice: Slice; media: MediaSource[] } {
  const rows = scenario.msel.filter((r) => r.owner === org && !isSharedRow(r))
  const rowIds = new Set(rows.filter((r) => r.visibility !== 'owner_controllers').map((r) => r.id))
  const media: MediaSource[] = []
  const sharedInjects = injects
    .filter((i) => rowIds.has(i.mselRowId))
    .map((i) => {
      const out = toSharedInject(i, org, prefix, i.revision ?? 1, o)
      media.push(...out.media)
      return out.inject
    })
  return {
    media,
    slice: {
      orgId: org,
      revision: state.received[org]?.revision ?? 1,
      frameVersion: state.frameVersion,
      roles: scenario.roles.filter((r) => r.owner === org).map((r) => toSharedRole(r, org)),
      rows: rows.map((r) => toSharedRow(r, org, r.revision ?? 1, o)),
      injects: sharedInjects,
      proposals: state.proposals.filter((p) => p.fromOrg === org || p.toOrg === org),
    },
  }
}
