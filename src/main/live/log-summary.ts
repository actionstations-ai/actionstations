/**
 * One-line human reading of a log entry (spec 0417 FR-5 `summary` column, FR-10 Log view).
 * Reads only fields the entry carries; text is clipped. Never reads a display name.
 */
import type { SessionLogEntry } from '@shared/schemas/live'

export type RoleName = (roleId: string | undefined) => string | undefined

const CLIP = 140
const clip = (s: string): string => (s.length > CLIP ? `${s.slice(0, CLIP - 1)}…` : s)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

function seatName(e: SessionLogEntry, roleName: RoleName): string {
  const seat = e.actor.seat
  if (e.actor.evaluator) return `evaluator ${e.actor.evaluator}`
  if (seat?.roleId) return roleName(seat.roleId) ?? seat.roleId
  return seat?.kind ?? e.actor.kind
}

function targetName(target: string, roleName: RoleName): string {
  if (target.startsWith('role:')) {
    const id = target.slice(5)
    return roleName(id) ?? id
  }
  if (target.startsWith('team:')) return `team ${target.slice(5)}`
  return target.startsWith('client:') ? 'one device' : target
}

function release(e: SessionLogEntry, roleName: RoleName): string {
  const targets = Array.isArray(e.data.targets) ? e.data.targets.map(String) : []
  const to = targets.map((t) => targetName(t, roleName)).join(', ')
  return `${e.ref?.rowId ?? 'inject'} released${to ? ` to ${to}` : ''}`
}

function message(e: SessionLogEntry, roleName: RoleName): string {
  const from =
    e.actor.kind === 'controller' ? (e.actor.persona ?? 'SimCell') : seatName(e, roleName)
  const channel = str(e.ref?.channel)
  const to = e.actor.kind === 'controller' ? targetName(channel, roleName) : 'SimCell'
  return `${from} → ${to}: ${clip(str(e.data.text))}`
}

type Reader = (e: SessionLogEntry, roleName: RoleName) => string

const READERS: Record<string, Reader> = {
  'session.start': () => 'Session started',
  'session.resume': () => 'Session resumed',
  'session.end': (e) => `Session ended${str(e.data.reason) ? ` (${str(e.data.reason)})` : ''}`,
  'client.join': (e, r) => `${seatName(e, r)} joined`,
  'client.leave': (e, r) => `${seatName(e, r)} left`,
  'client.reseat': (e, r) => `${seatName(e, r)} moved seats`,
  'client.kick': (e, r) => `${seatName(e, r)} removed`,
  'inject.release': release,
  'inject.receipt': (e, r) =>
    `${e.ref?.rowId ?? 'inject'} ${str(e.data.status)} by ${seatName(e, r)}`,
  'inject.retract': (e) => `${e.ref?.rowId ?? 'inject'} withdrawn`,
  'inject.answered': (e) =>
    `${e.ref?.rowId ?? 'inject'} marked answered${str(e.data.note) ? `: ${clip(str(e.data.note))}` : ''}`,
  message,
  'message.handled': () => 'Message marked handled',
  'message.star': (e) => (e.data.on === false ? 'Message unstarred' : 'Message starred'),
  'message.pinned': (e) => `Message pinned: ${clip(str(e.data.text))}`,
  'vote.open': (e) => `Vote opened: ${clip(str(e.data.question))}`,
  'vote.cast': () => 'Vote cast',
  'vote.close': (e) => `Vote closed (${num(e.data.voted)} voted)`,
  'hotwash.open': () => 'Hot wash opened',
  'hotwash.close': () => 'Hot wash closed',
  'hotwash.item': (e) => `Hot wash: ${clip(str(e.data.text))}`,
  'eval.observation': (e) => `Observation: ${clip(str(e.data.notes))}`,
  'controller.notice': (e) => clip(str(e.data.text) || 'Controller notice'),
  anomaly: (e) =>
    `${str(e.data.what) || 'Anomaly'}${str(e.data.reason) ? ` (${str(e.data.reason)})` : ''}`,
}

export function summarize(e: SessionLogEntry, roleName: RoleName = () => undefined): string {
  const read = READERS[e.kind]
  return read ? read(e, roleName) : e.kind
}
