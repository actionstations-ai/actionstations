/**
 * What a device knows about voice calls (spec 0429): the line the caller said (always as text,
 * and as audio when a voice is set up), this device's answers, and whether the call is over.
 * A call goes turn by turn: the SimCell rings again with the next line after a person approves
 * it. Pure helpers, so the rules (who may take a call, what a repeated ring means) are tested
 * without a browser.
 */
import type { Opened } from '../../../shared/live/codec'
import type { BlobRef } from '../../../shared/live/schemas'
import { seatDestinations, type SeatView } from '../../app/items'

export interface CallLine {
  who: 'them' | 'me'
  text: string
  turn: number
}

export interface PlayerCall {
  callId: string
  /** The newest turn this device has heard. */
  turn: number
  persona: { name: string; organization?: string }
  /** What the caller just said, as text. */
  transcript: string
  audio?: BlobRef
  canSpeak: boolean
  expectedWaitSec?: number
  targets: string[]
  /** `ringing` while it waits for this device's answer; `answered` while it waits for the caller. */
  status: 'ringing' | 'answered' | 'ended'
  endedReason?: 'completed' | 'hangup' | 'no_answer'
  history: CallLine[]
  openedAt: number
}

export type CallMap = Readonly<Record<string, PlayerCall>>

/** A player seat in the call's scope. Evaluators and observers do not take calls. */
export function mayTakeCall(
  call: Pick<PlayerCall, 'targets'>,
  seat: SeatView | undefined,
): boolean {
  if (!seat || (seat.kind && seat.kind !== 'player')) return false
  if (call.targets.includes('all')) return true
  const mine = seatDestinations(seat)
  return call.targets.some((t) => mine.has(t))
}

/**
 * Apply a `call.ring`. Only a host-signed ring for this seat counts; a ring for a turn already
 * heard is ignored (a replay or a second device in the seat).
 */
export function applyRing(
  calls: CallMap,
  msg: Opened<'call.ring'>,
  seat: SeatView | undefined,
  at: number,
): { calls: CallMap; isNew: boolean } {
  const p = msg.payload
  if (msg.signedBy !== 'host') return { calls, isNew: false }
  const before = calls[p.callId]
  if (before && p.turn <= before.turn) return { calls, isNew: false }
  if (!mayTakeCall({ targets: p.targets }, seat)) return { calls, isNew: false }
  if (before?.status === 'ended') return { calls, isNew: false }
  const next: PlayerCall = {
    callId: p.callId,
    turn: p.turn,
    persona: p.persona,
    transcript: p.transcript,
    ...(p.audio ? { audio: p.audio } : {}),
    canSpeak: p.canSpeak,
    ...(p.expectedWaitSec !== undefined ? { expectedWaitSec: p.expectedWaitSec } : {}),
    targets: p.targets,
    status: 'ringing',
    history: [...(before?.history ?? []), { who: 'them', text: p.transcript, turn: p.turn }],
    openedAt: before?.openedAt ?? at,
  }
  return { calls: { ...calls, [p.callId]: next }, isNew: !before }
}

/** A `call.end` from the controller (signed by the host). */
export function applyEnd(calls: CallMap, msg: Opened<'call.end'>): CallMap {
  const p = msg.payload
  const call = calls[p.callId]
  if (!call || call.status === 'ended') return calls
  if (p.by !== 'controller' || msg.signedBy !== 'host') return calls
  return { ...calls, [p.callId]: { ...call, status: 'ended', endedReason: p.reason } }
}

/** This device answered the open turn. */
export function markAnswered(calls: CallMap, callId: string, text: string): CallMap {
  const call = calls[callId]
  if (!call || call.status !== 'ringing') return calls
  return {
    ...calls,
    [callId]: {
      ...call,
      status: 'answered',
      history: [...call.history, { who: 'me', text, turn: call.turn }],
    },
  }
}

export function markHungUp(calls: CallMap, callId: string): CallMap {
  const call = calls[callId]
  if (!call || call.status === 'ended') return calls
  return { ...calls, [callId]: { ...call, status: 'ended', endedReason: 'hangup' } }
}

/** The call to show: the open one that rang most recently, else none. */
export function currentCall(calls: CallMap): PlayerCall | undefined {
  return Object.values(calls)
    .filter((c) => c.status !== 'ended')
    .sort((a, b) => b.openedAt - a.openedAt)[0]
}

/** The longest recording the connection takes: 16 kHz, 16-bit mono is 32,000 bytes a second. */
export function maxRecordingSeconds(maxBytes: number): number {
  return Math.max(0, Math.min(60, Math.floor((maxBytes - 44) / 32_000)))
}

/** Mono samples in [-1, 1] to a 16 kHz, 16-bit PCM WAV. */
export function encodeWav16k(samples: Float32Array): Uint8Array {
  const data = samples.length * 2
  const out = new Uint8Array(44 + data)
  const view = new DataView(out.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + data, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16_000, true)
  view.setUint32(28, 32_000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, data, true)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(44 + i * 2, Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), true)
  }
  return out
}
