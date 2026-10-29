/**
 * Frame checks a server runs before anything else (spec 0406 "Routing"): the size cap, then the
 * envelope schema. A server reads the header fields only; the payload must be an object (the
 * schema says so) and is never looked into.
 */
import { byteLength } from '@shared/live/bytes'
import type { Limits } from '@shared/live/protocol'
import { Envelope } from '@shared/live/schemas/envelope'
import type { RelayErrorCode } from '@shared/live/schemas/relay'

export type FrameCheck =
  | { ok: true; envelope: Envelope; frame: string }
  | { ok: false; code: Extract<RelayErrorCode, 'TOO_LARGE' | 'INVALID'>; message: string }

/** A frame as a socket delivers it: text, or bytes the adapter did not decode. */
export type IncomingFrame = string | ArrayBuffer | Uint8Array

export function checkFrame(data: IncomingFrame, limits: Limits): FrameCheck {
  if (typeof data !== 'string') return { ok: false, code: 'INVALID', message: 'Frames are text' }
  // UTF-8 is at least one byte per character, so a long string fails before it is measured.
  if (data.length > limits.envelopeBytes || byteLength(data) > limits.envelopeBytes) {
    return { ok: false, code: 'TOO_LARGE', message: 'Frame over the size cap' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return { ok: false, code: 'INVALID', message: 'Frame did not parse' }
  }
  const parsed = Envelope.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'INVALID', message: 'Frame did not parse' }
  return { ok: true, envelope: parsed.data, frame: data }
}
