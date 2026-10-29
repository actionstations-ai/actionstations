/**
 * Turn-based voice calls with a SimCell persona (spec 0429, protocol 0406). The controller
 * rings a role, team or device with `call.ring` (the line as text, and as audio when a voice is
 * set up); a player answers with `call.answer` (text, or a recording sealed to the controller);
 * the controller rings again with the next line. It is not a live conversation: each turn waits
 * for a person to approve the reply. State lives in memory with the session; the log
 * (`call.ring`, `call.answer`, `call.end`) is the record.
 */
import type { BlobMeta, BlobRef, ClientKind, Destination } from '@shared/live/schemas'
import type { CallAnswerPayload, CallEndPayload } from '@shared/live/schemas'
import type { SessionLogInput } from '@shared/schemas/live'
import { AppError } from '../lib/errors'

export interface CallSeat {
  clientId: string
  kind: ClientKind
  roleId?: string
  teamId?: string
  /** Role or seat name, never a person's name. */
  label: string
}

export interface AnsweredTurn {
  callId: string
  turn: number
  personaId?: string
  seatLabel: string
  roleId: string
  text?: string
  audio?: Uint8Array
}

export interface CallsDeps {
  send: (
    type: 'call.ring' | 'call.end',
    to: Destination,
    payload: Record<string, unknown>,
  ) => Promise<unknown>
  putBlob: (meta: BlobMeta, bytes: Uint8Array) => Promise<BlobRef>
  getBlob: (ref: BlobRef) => Promise<Uint8Array>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  seatOf: (clientId: string) => CallSeat | undefined
  clientRef: (clientId: string) => Promise<string>
  clock: () => Promise<string>
  /** Largest recording a player may send on this connection, in bytes. */
  maxAnswerBytes: () => number
  newId: () => string
  /** A player answered; the SimCell drafts the next line. */
  answered: (turn: AnsweredTurn) => void
  /** The call ended (by the player, or by the controller). */
  ended: (callId: string, by: 'controller' | 'player', reason: string) => void
  changed: (callId: string) => void
}

export interface CallRingRequest {
  /** Continue this call with its next line; omit to start a call. */
  callId?: string
  targets: Destination[]
  personaId?: string
  persona: { name: string; organization?: string }
  transcript: string
  audio?: { bytes: Uint8Array; mime: string; durationSec?: number }
  canSpeak: boolean
  expectedWaitSec?: number
  injectId?: string
  mselRowId?: string
}

export interface CallState {
  callId: string
  turn: number
  targets: Destination[]
  personaId?: string
  persona: string
  status: 'ringing' | 'answered' | 'ended'
  answeredTurns: number[]
}

const MAX_TURNS = 40
const ID22 = /^[A-Za-z0-9_-]{22}$/

function reaches(seat: CallSeat, targets: readonly string[]): boolean {
  if (targets.includes('all')) return true
  const mine = new Set([`client:${seat.clientId}`])
  if (seat.roleId) mine.add(`role:${seat.roleId}`)
  if (seat.teamId) mine.add(`team:${seat.teamId}`)
  return targets.some((t) => mine.has(t))
}

export class Calls {
  private readonly calls = new Map<string, CallState>()

  constructor(private readonly deps: CallsDeps) {}

  get(callId: string): CallState | undefined {
    const c = this.calls.get(callId)
    return c && { ...c, targets: [...c.targets], answeredTurns: [...c.answeredTurns] }
  }

  list(): CallState[] {
    return [...this.calls.keys()].map((id) => this.get(id)!)
  }

  async ring(req: CallRingRequest): Promise<{ callId: string; turn: number }> {
    if (!req.targets.length) throw new AppError('VALIDATION', 'Choose who the call is for')
    const existing = req.callId ? this.calls.get(req.callId) : undefined
    if (req.callId && !existing) throw new AppError('NOT_FOUND', 'No such call')
    if (existing?.status === 'ended') throw new AppError('CONFLICT', 'That call has ended')
    const callId = existing?.callId ?? this.deps.newId()
    const turn = (existing?.turn ?? 0) + 1
    if (turn > MAX_TURNS) throw new AppError('VALIDATION', 'This call has run long enough')
    const targets = existing?.targets ?? req.targets
    const audio = req.audio
      ? await this.deps.putBlob(
          {
            kind: 'audio',
            mime: req.audio.mime,
            name: 'call',
            ...(req.audio.durationSec ? { durationSec: req.audio.durationSec } : {}),
          },
          req.audio.bytes,
        )
      : undefined
    const payload = {
      callId,
      turn,
      persona: {
        name: req.persona.name,
        ...(req.persona.organization ? { organization: req.persona.organization } : {}),
      },
      transcript: req.transcript,
      ...(audio ? { audio } : {}),
      canSpeak: req.canSpeak,
      ...(req.expectedWaitSec !== undefined ? { expectedWaitSec: req.expectedWaitSec } : {}),
      ...(req.injectId ? { injectId: req.injectId } : {}),
      ...(req.mselRowId ? { mselRowId: req.mselRowId } : {}),
      targets,
    }
    this.calls.set(callId, {
      callId,
      turn,
      targets,
      ...(req.personaId
        ? { personaId: req.personaId }
        : existing?.personaId
          ? { personaId: existing.personaId }
          : {}),
      persona: req.persona.name,
      status: 'ringing',
      answeredTurns: existing?.answeredTurns ?? [],
    })
    for (const to of targets) await this.deps.send('call.ring', to, payload)
    await this.log('call.ring', callId, {
      turn,
      persona: req.persona.name,
      text: req.transcript,
      audio: !!audio,
      targets,
    })
    this.deps.changed(callId)
    return { callId, turn }
  }

  /** A player's `call.answer` (sealed to the controller). */
  async onAnswer(from: string, seq: number, p: CallAnswerPayload): Promise<void> {
    const seat = this.deps.seatOf(from)
    const ref = await this.deps.clientRef(from)
    const reject = (what: string) => this.anomaly(ref, seq, what)
    const call = this.calls.get(p.callId)
    if (!seat || seat.kind !== 'player' || !seat.roleId)
      return reject('call answer from a non-player')
    if (!call || call.status === 'ended') return reject('answer to a call that is not open')
    if (!reaches(seat, call.targets)) return reject('answer from a seat the call was not for')
    if (p.turn !== call.turn || call.answeredTurns.includes(p.turn))
      return reject('answer to a turn that is not open')
    let audio: Uint8Array | undefined
    if (p.audio) {
      if (p.audio.kind !== 'audio' || p.audio.bytes > this.deps.maxAnswerBytes())
        return reject('answer recording is not audio or is too large')
      try {
        audio = await this.deps.getBlob(p.audio)
      } catch {
        return reject('answer recording could not be fetched')
      }
    }
    call.answeredTurns.push(p.turn)
    call.status = 'answered'
    await this.log('call.answer', call.callId, {
      turn: p.turn,
      seat: seat.label,
      ...(p.text !== undefined ? { text: p.text } : {}),
      ...(audio ? { audioBytes: audio.length } : {}),
    })
    this.deps.changed(call.callId)
    this.deps.answered({
      callId: call.callId,
      turn: p.turn,
      ...(call.personaId ? { personaId: call.personaId } : {}),
      seatLabel: seat.label,
      roleId: seat.roleId,
      ...(p.text !== undefined ? { text: p.text } : {}),
      ...(audio ? { audio } : {}),
    })
  }

  /** What the speech model heard, kept in the log beside the answer. */
  async noteTranscript(callId: string, turn: number, text: string): Promise<void> {
    await this.log('call.answer', callId, { turn, transcript: text })
  }

  async onPlayerEnd(from: string, seq: number, p: CallEndPayload): Promise<void> {
    const ref = await this.deps.clientRef(from)
    const seat = this.deps.seatOf(from)
    const call = this.calls.get(p.callId)
    if (p.by !== 'player' || !seat || !call || !reaches(seat, call.targets))
      return this.anomaly(ref, seq, 'call end from a seat the call was not for')
    if (call.status === 'ended') return
    call.status = 'ended'
    await this.log('call.end', call.callId, { by: 'player', reason: p.reason, turn: call.turn })
    this.deps.changed(call.callId)
    this.deps.ended(call.callId, 'player', p.reason)
  }

  async end(callId: string, reason: CallEndPayload['reason'] = 'completed'): Promise<void> {
    const call = this.calls.get(callId)
    if (!call) throw new AppError('NOT_FOUND', 'No such call')
    if (call.status === 'ended') return
    call.status = 'ended'
    for (const to of call.targets)
      await this.deps.send('call.end', to, { callId, turn: call.turn, reason, by: 'controller' })
    await this.log('call.end', callId, { by: 'controller', reason, turn: call.turn })
    this.deps.changed(callId)
    this.deps.ended(callId, 'controller', reason)
  }

  private async log(
    kind: 'call.ring' | 'call.answer' | 'call.end',
    callId: string,
    data: Record<string, unknown>,
  ) {
    await this.deps.log.append({
      kind,
      ex: await this.deps.clock(),
      actor: { kind: 'controller' },
      ref: { itemId: ID22.test(callId) ? callId : undefined },
      data: { callId, ...data },
    })
  }

  private async anomaly(ref: string, seq: number, what: string): Promise<void> {
    await this.deps.log.append({
      kind: 'anomaly',
      actor: { kind: 'client', clientRef: ref },
      data: { what },
      env: { from: ref, seq },
    })
  }
}
