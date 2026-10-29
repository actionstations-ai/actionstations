// Setting up and running the planning rounds of a regional exercise (spec 0440 FR-1, FR-13,
// FR-17): create, settings, proposals, finalize, and the live-session pieces.
import { exportJsonText } from '../live/log-export'
import type { SessionLogEntry } from '@shared/schemas/live'
import { OrgPrefix, orgIdForPrefix, type RegionalState } from '@shared/schemas/regional'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import { getScenario, saveScenario } from '../scenario/store'
import { claimRows } from './apply'
import { isSharedRow } from './build'
import { requireIdentity } from './identity'
import { createProposal, resolveProposal, type ProposalInput } from './proposals'
import { buildRoster, orgsWithoutLiveKey, sliceLogsFor } from './session'
import { hasRegional, readRegional, writeRegional } from './store'

export async function createRegional(
  root: string,
  scenarioId: string,
  input: { orgs: { name: string; prefix: string }[]; hostOrg: string },
): Promise<RegionalState> {
  if (await hasRegional(root, scenarioId))
    throw new AppError('CONFLICT', 'This scenario is already part of a regional exercise.')
  const host = await requireIdentity(input.hostOrg)
  const listed = input.orgs.filter((o) => o.prefix !== host.prefix)
  const all = [{ name: host.name, prefix: host.prefix }, ...listed]
  for (const o of all)
    if (!OrgPrefix.safeParse(o.prefix).success || !o.name.trim())
      throw new AppError(
        'VALIDATION',
        'Each organization needs a name and a prefix of 2 to 6 capital letters.',
      )
  if (new Set(all.map((o) => o.prefix)).size !== all.length)
    throw new AppError('VALIDATION', 'Two organizations share a prefix.')
  if (all.length < 2 || all.length > 8)
    throw new AppError('VALIDATION', 'A regional exercise has 2 to 8 organizations.')
  const orgs = all.map((o) => ({
    orgId: orgIdForPrefix(o.prefix),
    name: o.name.trim(),
    prefix: o.prefix,
  }))
  const withHostKey = orgs.map((o) =>
    o.orgId === host.orgId
      ? { ...o, publicKey: host.publicKey, fingerprint: host.fingerprint, liveKey: host.liveKey }
      : o,
  )
  const scenario = await getScenario(root, scenarioId)
  const exerciseId = newId()
  const claim = claimRows(
    { ...scenario, regional: { exerciseId } },
    [],
    host.orgId,
    host.prefix,
    isSharedRow,
  )
  await saveScenario(root, claim.scenario, { by: 'user', snapshot: false })
  return writeRegional(root, scenarioId, {
    exerciseId,
    role: 'host',
    thisOrg: host.orgId,
    hostOrg: host.orgId,
    orgs: withHostKey,
    frameVersion: 1,
    final: false,
    received: {},
    shareQuotes: false,
    shareFullLog: false,
    crossOrgChannels: [],
    proposals: [],
    local: { slice: 0, rows: {}, injects: {} },
  })
}

export interface RegionalSettings {
  shareQuotes?: boolean
  shareFullLog?: boolean
  crossOrgChannels?: RegionalState['crossOrgChannels']
}

export async function updateSettingsOf(
  root: string,
  scenarioId: string,
  patch: RegionalSettings,
): Promise<RegionalState> {
  const state = await readRegional(root, scenarioId)
  if (patch.shareFullLog !== undefined && state.role !== 'host')
    throw new AppError('FORBIDDEN', 'Only the host sets whether the full session log is shared.')
  if (patch.crossOrgChannels !== undefined && state.role !== 'host')
    throw new AppError('FORBIDDEN', 'Only the host defines the cross-organization channels.')
  return writeRegional(root, scenarioId, { ...state, ...patch })
}

export async function propose(root: string, scenarioId: string, input: ProposalInput) {
  const state = await readRegional(root, scenarioId)
  const scenario = await getScenario(root, scenarioId)
  return writeRegional(root, scenarioId, createProposal(state, scenario, input))
}

export async function answerProposal(
  root: string,
  scenarioId: string,
  id: string,
  accept: boolean,
  note?: string,
): Promise<RegionalState> {
  const state = await readRegional(root, scenarioId)
  const out = resolveProposal(state, await getScenario(root, scenarioId), id, accept, note)
  if (accept) await saveScenario(root, out.scenario, { by: 'user', snapshot: false })
  return writeRegional(root, scenarioId, out.state)
}

/** The host marks the exercise Final: the next merged bundle is what everyone runs (FR-17). */
export async function finalize(root: string, scenarioId: string): Promise<RegionalState> {
  const state = await readRegional(root, scenarioId)
  if (state.role !== 'host')
    throw new AppError('FORBIDDEN', 'Only the host marks the exercise Final.')
  return writeRegional(root, scenarioId, { ...state, final: true })
}

/** The controller roster payload for the joint live session (FR-19). */
export async function rosterFor(root: string, scenarioId: string, revision = 1) {
  const state = await readRegional(root, scenarioId)
  if (state.role !== 'host')
    throw new AppError('FORBIDDEN', 'Only the host sends the controller roster.')
  const scenario = await getScenario(root, scenarioId)
  return {
    roster: buildRoster(state, scenario.roles, revision),
    missingLiveKey: orgsWithoutLiveKey(state),
  }
}

/** One log file per organization (FR-22), as the text of the session log export. */
export async function logSlicesFor(
  root: string,
  scenarioId: string,
  entries: readonly SessionLogEntry[],
): Promise<{ orgId: string; json: string; entries: number }[]> {
  const state = await readRegional(root, scenarioId)
  const scenario = await getScenario(root, scenarioId)
  const slices = sliceLogsFor(entries, state, scenario.roles)
  return [...slices].map(([orgId, list]) => ({
    orgId,
    entries: list.length,
    json: exportJsonText(list, { includeNames: false }),
  }))
}
