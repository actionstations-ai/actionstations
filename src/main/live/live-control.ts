/**
 * Controller actions on a running session that are not a feature of their own: publishing the
 * exercise clock and staff notices to devices (spec 0428 task 7), writing branch decisions to the
 * session log (spec 0430), listing devices, removing one and replacing the keys (spec 0417,
 * 0406 rekey). Each takes the pieces of the running session it needs, so `session.ts` stays the
 * only owner of the session itself.
 */
import { toBase64Url } from '@shared/live/bytes'
import type { LiveClient } from '@shared/live/client'
import type { SessionKeys } from '@shared/live/crypto/keys'
import type { CryptoProvider } from '@shared/live/crypto/provider'
import type { SessionHub } from '@shared/live/hub'
import type { RekeyClient } from '@shared/live/rekey'
import { RESERVED_ROLE_IDS, type ClockState } from '@shared/live/schemas'
import type { BranchingLogInput, FacilitatorState } from '@shared/ipc/facilitator'
import type { LiveDevice, SessionLogInput } from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import type { Seat, Seats } from './seats'

/** The branching entries that belong in the live log; releases are logged by delivery itself. */
const BRANCH_KINDS: ReadonlySet<BranchingLogInput['kind']> = new Set([
  'decision.open',
  'decision.close',
  'decision.override',
  'proposal.offer',
  'proposal.accept',
  'proposal.reject',
])

export const branchEntriesForLive = (entries: readonly BranchingLogInput[]): SessionLogInput[] =>
  entries
    .filter((e) => BRANCH_KINDS.has(e.kind))
    .map((e) => ({
      kind: e.kind as SessionLogInput['kind'],
      actor: { kind: 'controller' as const },
      ...(e.ex ? { ex: e.ex } : {}),
      ...(e.rowId ? { ref: { rowId: e.rowId } } : {}),
      data: e.data,
    }))

/** The clock devices show, from the saved facilitator state. */
export function clockPayload(state: FacilitatorState): ClockState {
  const since = state.runningSince ? Date.parse(state.runningSince) : undefined
  const reason = state.clockLog?.at(-1)?.kind
  return {
    elapsedMin: state.elapsedMin,
    ...(since !== undefined && Number.isFinite(since) ? { runningSince: since } : {}),
    rate: state.rate ?? 1,
    ...(reason ? { reason } : {}),
  }
}

/** Two clocks that devices would show the same way. */
export const clockKey = (c: ClockState): string =>
  JSON.stringify([c.elapsedMin, c.runningSince ?? null, c.rate])

export const EVALUATOR_DESTINATION = `role:${RESERVED_ROLE_IDS[0]}` as const

export interface StaffNotice {
  text: string
  level: 'info' | 'warning' | 'urgent'
  rowId?: string | undefined
}

/** A notice for evaluator devices only (spec 0428 FR-17: never to players). */
export async function sendStaffNotice(
  client: LiveClient,
  log: { append: (input: SessionLogInput) => Promise<unknown> },
  crypto: CryptoProvider,
  notice: StaffNotice,
): Promise<void> {
  const text = notice.text.trim().slice(0, 1000)
  if (!text) throw new AppError('VALIDATION', 'The notice is empty')
  await client.send(
    'controller.notice',
    EVALUATOR_DESTINATION,
    {
      noticeId: toBase64Url(crypto.random(16)),
      kind: 'text',
      ...(notice.rowId ? { ref: notice.rowId } : {}),
      level: notice.level,
      text,
      targets: [EVALUATOR_DESTINATION],
      dismissible: true,
    },
    { key: 'staff' },
  )
  await log.append({
    kind: 'controller.notice',
    actor: { kind: 'controller' },
    ...(notice.rowId ? { ref: { rowId: notice.rowId } } : {}),
    data: { text, level: notice.level, to: 'evaluators' },
  })
}

/** Devices seated now, under their log references, for the kick control. */
export async function listDevices(
  seats: Seats,
  refOf: (clientId: string) => Promise<string>,
  roleName: (roleId: string | undefined) => string | undefined,
): Promise<LiveDevice[]> {
  return Promise.all(
    [...seats.byClient.values()].map(async (s) => ({
      clientRef: await refOf(s.clientId),
      kind: s.kind,
      label: roleName(s.roleId) ?? s.kind,
      ...(s.name ? { name: s.name } : {}),
      staff: s.staff,
      online: s.online,
    })),
  )
}

export interface RotationDeps {
  client: LiveClient
  keys: SessionKeys
  seats: Seats
  hub?: SessionHub | undefined
  /** Remote sessions: tell the server to close the device and to accept the new join token. */
  remote?: {
    kick: (clientId: string) => Promise<void>
    setJoinToken: (hex: string) => Promise<void>
  }
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  refOf: (clientId: string) => Promise<string>
  persist: () => Promise<void>
}

function keptClients(seats: Seats, removed: ReadonlySet<string>): RekeyClient[] {
  return [...seats.byClient.values()]
    .filter((s) => s.online && !removed.has(s.clientId))
    .map((s) => ({ clientId: s.clientId, ecdhPub: s.ecdhPub, staff: s.staff }))
}

async function removeFromServer(d: RotationDeps, clientId: string): Promise<void> {
  d.hub?.kick(clientId)
  if (d.remote) await d.remote.kick(clientId)
}

async function logRemoval(d: RotationDeps, seat: Seat): Promise<void> {
  await d.log.append({
    kind: 'client.kick',
    actor: {
      kind: 'client',
      clientRef: await d.refOf(seat.clientId),
      seat: { kind: seat.kind, ...(seat.roleId ? { roleId: seat.roleId } : {}) },
    },
    data: {},
  })
}

/**
 * Close the removed devices, move everyone else to a new key epoch and make the old join link
 * stop working. With no one removed this replaces a link that leaked. Returns the new epoch.
 */
export async function rotateKeys(d: RotationDeps, removed: readonly Seat[] = []): Promise<number> {
  const ids = new Set(removed.map((s) => s.clientId))
  for (const seat of removed) {
    await removeFromServer(d, seat.clientId)
    seat.online = false
    d.seats.byClient.delete(seat.clientId)
    await logRemoval(d, seat)
  }
  const rotation = await d.client.rotate(keptClients(d.seats, ids), [...ids])
  const hash = await d.keys.joinTokenHash()
  d.hub?.setJoinTokenHash(hash)
  if (d.remote) await d.remote.setJoinToken(hash)
  await d.log.append({
    kind: 'key.rotate',
    actor: { kind: 'controller' },
    data: { epoch: rotation.epoch, kept: rotation.messages.length, removed: ids.size },
  })
  await d.persist()
  return rotation.epoch
}
