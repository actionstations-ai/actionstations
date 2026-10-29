// Importing bundles (spec 0440 FR-3, FR-4, FR-14 to FR-16): inspect (changes nothing), pin,
// join, merge preview and apply, and import of a merged exercise.
import { ScenarioBrief, type Inject, type MselRow, type Scenario } from '@shared/schemas'
import type { RegionalState, Slice } from '@shared/schemas/regional'
import { AppError } from '../lib/errors'
import {
  createScenario,
  getScenario,
  listInjects,
  saveInject,
  saveScenario,
} from '../scenario/store'
import { scenarioLayout } from '../scenario/layout'
import { promises as fs } from 'node:fs'
import { applyFrame, applyOrgRows, injectFromShared } from './apply'
import { requireIdentity } from './identity'
import { mergeSlices, type CurrentRow, type MergeResult } from './merge'
import { mergeProposals } from './proposals'
import { pinKey, pinStatus, withLiveKey, type PinStatus } from './pinning'
import { readBundle, type VerifiedBundle } from './read'
import { hasRegional, readRegional, writeRegional } from './store'

export interface InspectResult {
  bundle: VerifiedBundle
  pin: PinStatus | 'no_exercise'
}

/** Read and verify; a problem list becomes one readable error. */
export async function openBundle(path: string, appVersion: string): Promise<VerifiedBundle> {
  const read = await readBundle({ path }, { appVersion })
  if (read.ok) return read.bundle
  const first = read.problems[0]
  throw new AppError(
    'VALIDATION',
    `This is not a valid exercise bundle: ${first?.path ? `${first.path}: ` : ''}${first?.message ?? 'unreadable'}`,
    read.problems,
  )
}

const signerOf = (b: VerifiedBundle) => ({
  orgId: b.manifest.from.orgId,
  prefix: b.manifest.from.prefix,
  publicKey: b.signature.publicKey,
})

function requireSameExercise(state: RegionalState, b: VerifiedBundle): void {
  if (b.manifest.exerciseId !== state.exerciseId)
    throw new AppError('VALIDATION', 'This bundle belongs to a different exercise.')
}

/** Nothing is applied. With a scenario, the pin status is checked against its pinned keys. */
export async function inspectBundle(
  path: string,
  appVersion: string,
  at?: { root: string; scenarioId: string },
): Promise<InspectResult> {
  const bundle = await openBundle(path, appVersion)
  if (!at || !(await hasRegional(at.root, at.scenarioId))) return { bundle, pin: 'no_exercise' }
  const state = await readRegional(at.root, at.scenarioId)
  requireSameExercise(state, bundle)
  return { bundle, pin: pinStatus(state, signerOf(bundle)) }
}

export async function pinBundle(
  root: string,
  scenarioId: string,
  path: string,
  appVersion: string,
  confirmFingerprint: string,
  replace: boolean,
): Promise<RegionalState> {
  const bundle = await openBundle(path, appVersion)
  const state = await readRegional(root, scenarioId)
  requireSameExercise(state, bundle)
  const orgs = pinKey(state, {
    ...signerOf(bundle),
    ...(bundle.manifest.from.liveKey ? { liveKey: bundle.manifest.from.liveKey } : {}),
    confirmFingerprint,
    replace,
  })
  return writeRegional(root, scenarioId, { ...state, orgs })
}

/** Join: a new scenario in the participant's project, filled from the frame (FR-3). */
export async function joinExercise(
  root: string,
  path: string,
  appVersion: string,
  confirmFingerprint: string,
  orgId: string,
): Promise<{ scenarioId: string; state: RegionalState }> {
  const bundle = await openBundle(path, appVersion)
  const frame = bundle.frame
  if (!frame || bundle.manifest.kind === 'slice')
    throw new AppError('VALIDATION', 'Only a frame or merged bundle from the host can be joined.')
  const from = bundle.manifest.from
  if (from.orgId !== frame.hostOrg)
    throw new AppError('VALIDATION', 'The frame must be signed by the host organization.')
  const me = await requireIdentity(orgId)
  if (!frame.orgs.some((o) => o.orgId === orgId && o.prefix === me.prefix))
    throw new AppError('VALIDATION', `${me.name} is not one of this exercise’s organizations.`)
  const seeded: RegionalState = {
    exerciseId: bundle.manifest.exerciseId,
    role: 'participant',
    thisOrg: orgId,
    hostOrg: frame.hostOrg,
    orgs: frame.orgs.map((o) => ({
      ...o,
      ...(o.orgId === orgId
        ? { publicKey: me.publicKey, fingerprint: me.fingerprint, liveKey: me.liveKey }
        : {}),
    })),
    frameVersion: bundle.manifest.frameVersion,
    final: bundle.manifest.final,
    received: {},
    shareQuotes: false,
    shareFullLog: frame.shareFullLog,
    crossOrgChannels: frame.crossOrgChannels,
    proposals: [],
    local: { slice: 0, rows: {}, injects: {} },
  }
  const orgs = pinKey(seeded, {
    ...signerOf(bundle),
    ...(from.liveKey ? { liveKey: from.liveKey } : {}),
    confirmFingerprint,
  })
  const created = await createScenario(root, { title: frame.title, brief: ScenarioBrief.parse({}) })
  const filled = applyFrame(
    { ...created, regional: { exerciseId: seeded.exerciseId } },
    frame,
    orgId,
  )
  await saveScenario(root, filled, { by: 'user', snapshot: false })
  const state = await writeRegional(root, created.id, { ...seeded, orgs })
  return { scenarioId: created.id, state }
}

// --- Merge ------------------------------------------------------------------------------------

export interface PreviewBundle {
  path: string
  orgId: string
  fingerprint: string
  pin: PinStatus
  revision: number
}

export interface MergePreview {
  bundles: PreviewBundle[]
  result: MergeResult
}

const asCurrent = (r: MselRow): CurrentRow => r as unknown as CurrentRow

async function readSlices(
  state: RegionalState,
  paths: string[],
  appVersion: string,
): Promise<{ bundle: VerifiedBundle; pin: PinStatus; slice: Slice }[]> {
  const out = []
  for (const path of paths) {
    const bundle = await openBundle(path, appVersion)
    requireSameExercise(state, bundle)
    if (bundle.manifest.kind !== 'slice')
      throw new AppError('VALIDATION', `${path} is not a slice bundle.`)
    const slice = bundle.slices.get(bundle.manifest.from.prefix)!
    if (slice.orgId !== bundle.manifest.from.orgId)
      throw new AppError('VALIDATION', 'The slice is not from the organization that signed it.')
    out.push({ bundle, pin: pinStatus(state, signerOf(bundle)), slice })
  }
  return out
}

export async function previewMerge(
  root: string,
  scenarioId: string,
  paths: string[],
  appVersion: string,
): Promise<MergePreview> {
  const state = await readRegional(root, scenarioId)
  const scenario = await getScenario(root, scenarioId)
  const read = await readSlices(state, paths, appVersion)
  const usable = read.filter((r) => r.pin === 'pinned')
  const merged = Object.fromEntries(Object.entries(state.received).map(([k, v]) => [k, v.revision]))
  const result = mergeSlices({
    frame: {
      orgs: state.orgs,
      phases: scenario.phases,
      roles: scenario.roles.map((r) => ({
        id: r.id,
        name: r.name,
        abbreviation: '',
        team: '',
        description: '',
        standingOrders: [],
        owner: r.owner ?? state.hostOrg,
      })),
    },
    frameVersion: state.frameVersion,
    current: scenario.msel.map(asCurrent),
    currentRoles: scenario.roles.map((r) => ({ id: r.id, owner: r.owner })),
    merged,
    slices: usable.map((r) => r.slice),
  })
  return {
    bundles: read.map((r, n) => ({
      path: paths[n]!,
      orgId: r.bundle.manifest.from.orgId,
      fingerprint: r.bundle.signerFingerprint,
      pin: r.pin,
      revision: r.slice.revision,
    })),
    result,
  }
}

async function writeInjects(
  root: string,
  scenarioId: string,
  org: string,
  incoming: Slice['injects'],
  media: ReadonlyMap<string, Buffer>,
  existing: Inject[],
): Promise<void> {
  const layout = scenarioLayout(root, scenarioId)
  const keep = new Set(incoming.map((i) => i.id))
  for (const old of existing)
    if (old.owner === org && !keep.has(old.id)) await fs.rm(layout.inject(old.id), { force: true })
  const now = new Date().toISOString()
  for (const i of incoming) {
    const injectValue = await injectFromShared(
      root,
      scenarioId,
      i,
      media,
      existing.find((e) => e.id === i.id),
      now,
    )
    await saveInject(root, scenarioId, injectValue, { by: 'user', snapshot: false })
  }
}

export interface AcceptedOrg {
  orgId: string
  revision: number
}

export async function applyMerge(
  root: string,
  scenarioId: string,
  paths: string[],
  accept: AcceptedOrg[],
  appVersion: string,
): Promise<{ state: RegionalState; result: MergeResult }> {
  let state = await readRegional(root, scenarioId)
  const preview = await previewMerge(root, scenarioId, paths, appVersion)
  const read = await readSlices(state, paths, appVersion)
  let scenario = await getScenario(root, scenarioId)
  let injects = await listInjects(root, scenarioId)
  for (const org of preview.result.orgs) {
    const wanted = accept.some((a) => a.orgId === org.orgId && a.revision === org.revision)
    const source = read.find((r) => r.slice.orgId === org.orgId)
    if (!wanted || !org.usable || !source) continue
    scenario = applyOrgRows(scenario, org)
    await writeInjects(root, scenarioId, org.orgId, org.injects, source.bundle.media, injects)
    state = mergeProposals(state, source.slice.proposals, org.orgId)
    state = {
      ...state,
      orgs: withLiveKey(state.orgs, org.orgId, source.bundle.manifest.from.liveKey),
      received: {
        ...state.received,
        [org.orgId]: {
          revision: org.revision,
          sha256: source.bundle.archiveSha256,
          receivedAt: new Date().toISOString(),
        },
      },
    }
    injects = await listInjects(root, scenarioId)
  }
  await saveScenario(root, scenario, { by: 'user', snapshot: false })
  state = { ...state, merged: { version: mergedVersion(state), at: new Date().toISOString() } }
  return { state: await writeRegional(root, scenarioId, state), result: preview.result }
}

export const mergedVersion = (state: Pick<RegionalState, 'frameVersion' | 'received'>): string =>
  [
    `f${state.frameVersion}`,
    ...Object.entries(state.received)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([o, r]) => `${o}${r.revision}`),
  ].join('.')

/** A participant imports the host's merged exercise: the frame and every other organization's slice. */
export async function importMerged(
  root: string,
  scenarioId: string,
  path: string,
  appVersion: string,
): Promise<{ state: RegionalState; scenario: Scenario; changes: string[] }> {
  let state = await readRegional(root, scenarioId)
  const bundle = await openBundle(path, appVersion)
  requireSameExercise(state, bundle)
  const host = state.orgs.find((o) => o.orgId === state.hostOrg)
  if (bundle.manifest.kind !== 'merged' || !bundle.frame)
    throw new AppError('VALIDATION', 'This is not a merged exercise bundle.')
  if (pinStatus(state, signerOf(bundle)) !== 'pinned' || bundle.manifest.from.orgId !== host?.orgId)
    throw new AppError('FORBIDDEN', 'The merged exercise must be signed by the host’s pinned key.')
  let scenario = applyFrame(await getScenario(root, scenarioId), bundle.frame, state.thisOrg)
  const injects = await listInjects(root, scenarioId)
  const changes: string[] = []
  for (const slice of bundle.slices.values()) {
    if (slice.orgId === state.thisOrg) continue // my own rows stay as they are on this computer
    const before = scenario.msel.filter((r) => r.owner === slice.orgId).length
    scenario = applyOrgRows(scenario, {
      orgId: slice.orgId,
      rows: slice.rows,
      roles: slice.roles,
      removed: scenario.msel
        .filter((r) => r.owner === slice.orgId && !slice.rows.some((x) => x.id === r.id))
        .map((r) => r.id),
    })
    await writeInjects(root, scenarioId, slice.orgId, slice.injects, bundle.media, injects)
    changes.push(
      `${slice.orgId}: ${before} rows before, ${slice.rows.length} now (revision ${slice.revision})`,
    )
    state = mergeProposals(state, slice.proposals, slice.orgId)
    state = {
      ...state,
      received: {
        ...state.received,
        [slice.orgId]: {
          revision: slice.revision,
          sha256: bundle.archiveSha256,
          receivedAt: new Date().toISOString(),
        },
      },
    }
  }
  await saveScenario(root, scenario, { by: 'user', snapshot: false })
  state = {
    ...state,
    frameVersion: bundle.manifest.frameVersion,
    final: bundle.manifest.final,
    shareFullLog: bundle.frame.shareFullLog,
    crossOrgChannels: bundle.frame.crossOrgChannels,
    merged: { version: mergedVersion(state), at: new Date().toISOString() },
  }
  return { state: await writeRegional(root, scenarioId, state), scenario, changes }
}
