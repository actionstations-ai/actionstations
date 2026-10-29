/**
 * The seam between the live session and the SimCell assistant (spec 0429). The session owns the
 * connection, the seats and the log; the assistant owns drafts and personas. This file builds the
 * two pieces that connect them: `Calls` (turn-based voice calls) and the `LiveBridge` the
 * assistant uses to read threads, reply as a persona, ring and write to the log.
 */
import type { BlobMeta, BlobRef, Destination } from '@shared/live/schemas'
import type { SessionLogInput } from '@shared/schemas/live'
import type { Simcell, BridgeLine, LiveBridge } from '../simcell/service'
import { Calls, type CallSeat } from './calls'
import type { Messages } from './messages'

export interface LinkHost {
  sessionId: string
  /** The session folder, `live/<sessionId>`. */
  dir: string
  send: (
    type: 'call.ring' | 'call.end',
    to: Destination,
    payload: Record<string, unknown>,
  ) => Promise<unknown>
  putBlob: (meta: BlobMeta, bytes: Uint8Array) => Promise<BlobRef>
  getBlob: (ref: BlobRef) => Promise<Uint8Array>
  maxAnswerBytes: () => number
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  seatOf: (clientId: string) => CallSeat | undefined
  clientRef: (clientId: string) => Promise<string>
  clock: () => Promise<string>
  newId: () => string
  changed: (callId: string) => void
  messages: Messages
  releases: () => Promise<{ releaseId: string; rowId: string }[]>
}

export function makeCalls(host: LinkHost, simcell: Simcell): Calls {
  return new Calls({
    send: host.send,
    putBlob: host.putBlob,
    getBlob: host.getBlob,
    log: host.log,
    seatOf: host.seatOf,
    clientRef: host.clientRef,
    clock: host.clock,
    maxAnswerBytes: host.maxAnswerBytes,
    newId: host.newId,
    changed: host.changed,
    answered: (turn) =>
      void simcell
        .onCallAnswer({
          callId: turn.callId,
          turn: turn.turn,
          ...(turn.personaId ? { personaId: turn.personaId } : {}),
          ...(turn.text !== undefined ? { text: turn.text } : {}),
          ...(turn.audio ? { audio: turn.audio } : {}),
        })
        .catch((e: unknown) => console.error('[simcell] call answer:', e)),
    ended: (callId) => simcell.onCallEnded(callId),
  })
}

export function makeBridge(host: LinkHost, calls: Calls): LiveBridge {
  const lines = (threadId: string): BridgeLine[] =>
    host.messages.peek(threadId).map((m) => ({
      messageId: m.messageId,
      from: m.from.kind === 'client' ? 'player' : 'controller',
      ...(m.from.kind === 'controller' ? { persona: m.from.persona } : {}),
      text: m.text,
      exerciseTime: m.exerciseTime,
      at: m.at,
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    }))
  return {
    sessionId: host.sessionId,
    dir: host.dir,
    thread: lines,
    threadIds: () => host.messages.threadIds(),
    threadLabel: (id) => host.messages.threadLabel(id),
    destination: (id) => host.messages.destination(id),
    replyAs: (r) =>
      host.messages.sendControllerMessage({
        channel: r.channel,
        text: r.text,
        persona: r.persona,
        ...(r.replyTo ? { replyTo: r.replyTo } : {}),
      }),
    log: (input) => host.log.append(input),
    rowForReply: async (replyTo) =>
      (await host.releases()).find((r) => r.releaseId === replyTo)?.rowId,
    ring: (req) =>
      calls.ring({
        ...(req.callId ? { callId: req.callId } : {}),
        targets: req.targets as Destination[],
        personaId: req.personaId,
        persona: req.persona,
        transcript: req.transcript,
        ...(req.audio ? { audio: req.audio } : {}),
        canSpeak: req.canSpeak,
        expectedWaitSec: req.expectedWaitSec,
      }),
    noteTranscript: (callId, turn, text) => calls.noteTranscript(callId, turn, text),
    endCall: (callId) => calls.end(callId, 'completed'),
  }
}
