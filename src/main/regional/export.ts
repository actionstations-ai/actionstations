// Exporting frame, slice and merged bundles from a scenario (spec 0440 FR-1, FR-9 to FR-12,
// FR-16). `assemble` builds the bundle in memory; the review (what will be sent) and the export
// (what is written to disk) both come from the same bytes, so they cannot differ.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import type { Inject, Scenario } from '@shared/schemas'
import type { BundleKind, RegionalState, SharedInject, SharedRow } from '@shared/schemas/regional'
import { AppError } from '../lib/errors'
import { safeJoin, writeFileAtomic } from '../lib/fs'
import { getScenario, listInjects, saveInject, saveScenario } from '../scenario/store'
import { claimRows } from './apply'
import { writeBundle, type WrittenBundle } from './write'
import { loadSigner, requireIdentity } from './identity'
import { canonicalJson } from './canonical'
import {
  buildForeignSlice,
  buildFrame,
  buildSlice,
  isSharedRow,
  type MediaSource,
  type ShareOptions,
} from './build'
import { readRegional, writeRegional } from './store'

export interface ExportReview {
  kind: BundleKind
  files: { path: string; size: number }[]
  totalBytes: number
  /** Row and inject fields that leave the organization (the allow-list). */
  rowFields: string[]
  /** Items that cite the owner's plans, so the owner can edit them before export (FR-10). */
  citingItems: { id: string; kind: 'row' | 'inject'; citations: number; withQuotes: number }[]
  privateRows: { id: string; publicSummary: string }[]
  sharesQuotes: boolean
}

interface Assembled {
  written: WrittenBundle
  review: ExportReview
  state: RegionalState
  scenario: Scenario
  injects: Inject[]
}

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

/** Make every row this organization wrote carry its prefix and owner (FR-7, FR-8). */
async function claimOwn(root: string, scenarioId: string, state: RegionalState, prefix: string) {
  let scenario = await getScenario(root, scenarioId)
  const injects = await listInjects(root, scenarioId)
  const claim = claimRows(scenario, injects, state.thisOrg, prefix, isSharedRow)
  if (!claim.changed) return { scenario, injects }
  scenario = await saveScenario(root, claim.scenario, { by: 'user', snapshot: false })
  for (const [n, inject] of claim.injects.entries())
    if (inject !== injects[n])
      await saveInject(root, scenarioId, inject, { by: 'user', snapshot: false })
  return { scenario, injects: claim.injects }
}

async function readMedia(root: string, sources: MediaSource[]): Promise<Map<string, Buffer>> {
  const media = new Map<string, Buffer>()
  for (const s of sources) {
    try {
      media.set(s.bundlePath, await fs.readFile(safeJoin(root, s.projectRel)))
    } catch {
      throw new AppError(
        'NOT_FOUND',
        `The media file ${s.projectRel} is missing; render the inject again before exporting.`,
      )
    }
  }
  return media
}

const ROW_FIELDS = [
  'id',
  'phaseId',
  'time',
  'wallClock',
  'from',
  'toRoleIds',
  'toLabel',
  'event',
  'expectedAction',
  'purposeTag',
  'format',
  'injectId',
  'citations (title, heading path)',
  'owner',
  'revision',
  'visibility',
  'publicSummary',
  'dependsOn',
]

function citingItems(rows: SharedRow[], injects: SharedInject[]) {
  const out: ExportReview['citingItems'] = []
  for (const r of rows)
    if (r.citations.length)
      out.push({ id: r.id, kind: 'row', citations: r.citations.length, withQuotes: 0 })
  for (const i of injects)
    if (i.citations.length)
      out.push({
        id: i.id,
        kind: 'inject',
        citations: i.citations.length,
        withQuotes: i.citations.filter((c) => c.quote).length,
      })
  return out
}

/** The frame version rises when the frame's content changed since the last export. */
function withFrameVersion(state: RegionalState, frame: unknown): RegionalState {
  const frameHash = sha(canonicalJson(frame))
  if (state.frameHash === frameHash) return state
  return {
    ...state,
    frameHash,
    frameVersion: state.frameHash ? state.frameVersion + 1 : state.frameVersion,
  }
}

export async function assemble(
  root: string,
  scenarioId: string,
  kind: BundleKind,
  appVersion: string,
): Promise<Assembled> {
  let state = await readRegional(root, scenarioId)
  const identity = await requireIdentity(state.thisOrg)
  const isHost = state.role === 'host'
  if (kind !== 'slice' && !isHost)
    throw new AppError(
      'FORBIDDEN',
      'Only the host organization exports the frame and the merged exercise.',
    )
  const share: ShareOptions = { shareQuotes: state.shareQuotes }
  const { scenario, injects } = await claimOwn(root, scenarioId, state, identity.prefix)
  const frame = buildFrame(scenario, state, share)
  if (kind !== 'slice') state = withFrameVersion(state, { ...frame })
  const slices = new Map<string, unknown>()
  const sources: MediaSource[] = []
  const rowsShared: SharedRow[] = []
  const injectsShared: SharedInject[] = []
  let local = state.local
  const addSlice = (
    prefix: string,
    slice: ReturnType<typeof buildSlice>['slice'],
    media: MediaSource[],
  ) => {
    slices.set(prefix, slice)
    sources.push(...media)
    rowsShared.push(...slice.rows)
    injectsShared.push(...slice.injects)
  }
  if (kind !== 'frame') {
    const mine = buildSlice(scenario, injects, state, identity.prefix, share)
    addSlice(identity.prefix, mine.slice, mine.media)
    local = mine.local
  }
  if (kind === 'merged')
    for (const org of state.orgs.filter(
      (o) => o.orgId !== state.thisOrg && state.received[o.orgId],
    )) {
      const f = buildForeignSlice(scenario, injects, state, org.orgId, org.prefix, share)
      addSlice(org.prefix, f.slice, f.media)
    }
  const written = await writeBundle(
    {
      kind,
      exerciseId: state.exerciseId,
      title: scenario.title,
      frameVersion: state.frameVersion,
      final: state.final,
      appVersion,
      from: {
        orgId: identity.orgId,
        name: identity.name,
        prefix: identity.prefix,
        fingerprint: identity.fingerprint,
        liveKey: identity.liveKey,
      },
      ...(kind === 'slice' ? {} : { frame }),
      slices,
      media: await readMedia(root, sources),
    },
    await loadSigner(state.thisOrg),
  )
  const privateRows = rowsShared
    .filter((r) => r.visibility === 'owner_controllers')
    .map((r) => ({ id: r.id, publicSummary: r.publicSummary ?? '' }))
  const review: ExportReview = {
    kind,
    files: written.manifest.files.map((f) => ({ path: f.path, size: f.size })),
    totalBytes: written.buffer.length,
    rowFields: ROW_FIELDS,
    citingItems: citingItems(rowsShared, injectsShared),
    privateRows,
    sharesQuotes: share.shareQuotes,
  }
  return { written, review, state: { ...state, local }, scenario, injects }
}

export async function exportReview(
  root: string,
  scenarioId: string,
  kind: BundleKind,
  appVersion: string,
) {
  return (await assemble(root, scenarioId, kind, appVersion)).review
}

/** Write the bundle to `dest` and remember the revisions it carried. */
export async function exportBundle(
  root: string,
  scenarioId: string,
  kind: BundleKind,
  dest: string,
  appVersion: string,
): Promise<{ path: string; sha256: string; review: ExportReview }> {
  if (extname(dest).toLowerCase() !== '.asexercise')
    throw new AppError('VALIDATION', 'Exercise bundles are saved with the .asexercise extension.')
  const out = await assemble(root, scenarioId, kind, appVersion)
  await writeFileAtomic(dest, out.written.buffer)
  await writeRegional(root, scenarioId, out.state)
  return { path: dest, sha256: out.written.sha256, review: out.review }
}
