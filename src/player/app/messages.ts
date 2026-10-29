/**
 * Messages with the SimCell as the player page holds them (spec 0413). Frames from the
 * controller become `ChatMessage`s; a player's own message is added when it is composed
 * (status `sending`) and settles when the controller's echo arrives (`sent`). Only frames the
 * controller signed are accepted, so another device cannot put words in the SimCell's mouth.
 */
import type { Opened } from '../../shared/live/codec'
import type { BlobRef } from '../../shared/live/schemas'
import { formatClock } from './clock'
import { seatDestinations, type SeatView } from './items'

export type SendStatus = 'sending' | 'sent' | 'failed'

export interface ChatMessage {
  /** The player's `messageId` for their own messages (the echo maps back to it). */
  id: string
  channel: string
  /** Written by this seat (this device or a sibling device). */
  mine: boolean
  /** Persona for the controller's messages ("Channel 5 newsroom"). */
  persona?: string
  /** Show the "played by SimCell" caption. */
  playedBy: boolean
  text: string
  attachments: BlobRef[]
  /** Photos still to upload for a message that has not left this device. */
  pendingPhotos: number
  exerciseTime: string
  ts: number
  replyTo?: string
  status: SendStatus
}

/** Display position: oldest first, then by id so the order is stable. */
export function compareMessages(a: ChatMessage, b: ChatMessage): number {
  return a.ts - b.ts || a.id.localeCompare(b.id)
}

/** The list with `next` added or merged over the same id, sorted. */
export function upsertMessage(list: readonly ChatMessage[], next: ChatMessage): ChatMessage[] {
  const old = list.find((m) => m.id === next.id)
  const merged = old
    ? {
        ...next,
        // The echo settles the message; it never moves it or hides a photo count.
        ts: old.ts,
        exerciseTime: old.exerciseTime,
        pendingPhotos: 0,
        status: next.status === 'sent' || old.status === 'sent' ? ('sent' as const) : next.status,
      }
    : next
  return [...list.filter((m) => m.id !== next.id), merged].sort(compareMessages)
}

/**
 * The message a `message.send` frame carries for this seat, or undefined when it is not one
 * to show: not signed by the controller, or for a channel the seat does not read.
 */
export function chatFromFrame(
  msg: Opened<'message.send'>,
  seat: SeatView | undefined,
  clockMinAt: (ts: number) => number,
): ChatMessage | undefined {
  if (msg.signedBy !== 'host' || !seat) return undefined
  const p = msg.payload
  if (!seatDestinations(seat).has(p.channel)) return undefined
  const base = {
    channel: p.channel,
    text: p.text,
    attachments: p.attachments,
    pendingPhotos: 0,
    exerciseTime: formatClock(clockMinAt(msg.ts)),
    ts: msg.ts,
    ...(p.replyTo ? { replyTo: p.replyTo } : {}),
    status: 'sent' as const,
  }
  if (p.echoOf) {
    // Another seat's echo is not ours to show; a channel can carry only this seat's own.
    if (!seat.roleId || p.fromRole !== seat.roleId) return undefined
    return { ...base, id: p.echoOf, mine: true, playedBy: false }
  }
  return {
    ...base,
    id: p.messageId,
    mine: false,
    playedBy: p.showPlayedBy ?? true,
    ...(p.persona ? { persona: p.persona } : {}),
  }
}

/** Threads this seat has: its own role channel always, plus any other channel with messages. */
export function threadChannels(
  messages: readonly ChatMessage[],
  ownChannel: string | undefined,
): string[] {
  const seen = new Set<string>(ownChannel ? [ownChannel] : [])
  for (const m of messages) seen.add(m.channel)
  return [...seen]
}

/** Controller messages in `messages` that the page has not shown as read. */
export function unreadCount(messages: readonly ChatMessage[], read: ReadonlySet<string>): number {
  return messages.filter((m) => !m.mine && !read.has(`msg:${m.id}`)).length
}
