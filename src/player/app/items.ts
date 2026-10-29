/**
 * What the inbox and the feed show: one `Item` per opened frame the shell knows how to
 * display, sorted by exercise time (newest on top) and deduplicated by sender and sequence so
 * a reconnect or a catch-up never shows a frame twice. The page keeps every item it can open
 * and filters by seat at render time, so a reseat rebuilds the inbox from what it already
 * holds (FR-9).
 *
 * Feature specs plug in here: #412 replaces the generic inject card with the full one (media,
 * receipts), #413 adds messages, #414 votes, #415 hot wash, #422 surveys.
 */
import type { Opened } from '../../shared/live/codec'
import type { MessageType } from '../../shared/live/protocol'
import type { ClientId, Destination } from '../../shared/live/schemas'
import { RESERVED_ROLE_IDS, type Seat } from '../../shared/live/schemas'
import { formatClock, parseExerciseTime } from './clock'
import { STRINGS } from './strings'

export type ItemKind = 'inject' | 'notice' | 'clock' | 'announcement' | 'reseat'
export type NoticeLevel = 'info' | 'warning' | 'urgent'
export type FeatureTab = 'votes' | 'hotwash' | 'surveys'

export interface Item {
  /** `${from}:${seq}`: the same frame, live or from catch-up, has one key. */
  key: string
  kind: ItemKind
  type: MessageType
  from: ClientId
  to: Destination
  seq: number
  ts: number
  /** Server arrival index when the frame came from catch-up. */
  index?: number
  /** Exercise minutes the item is ordered by: the payload's exercise time, else the clock at arrival. */
  atMin: number
  /** Exercise time label (`H:MM`). */
  exerciseTime: string
  title: string
  body?: string
  altText?: string
  sender?: string
  level?: NoticeLevel
  dismissible?: boolean
  /** Media the item carries; shown as a count until #412 renders it. */
  attachments?: number
  /** The More tab an announcement points to. */
  tab?: FeatureTab
  /** The feature's own id (release, vote, survey): what later specs key on. */
  ref?: string
}

export interface SeatView {
  clientId: ClientId
  roleId?: string
  teamId?: string
  kind?: 'player' | 'evaluator' | 'observer' | 'simcell'
}

export function itemKey(msg: Pick<Opened, 'from' | 'seq'>): string {
  return `${msg.from}:${msg.seq}`
}

/** Message types that produce no item here because another spec owns them. */
export const DEFERRED_TYPES: ReadonlySet<MessageType> = new Set<MessageType>([
  'message.send',
  'inject.recall',
  'hotwash.item',
  'hotwash.update',
  'vote.cast',
  'survey.response',
  'eval.assign',
  'eval.observation',
  'call.ring',
  'call.answer',
  'call.end',
])

/**
 * Build the item for an opened frame, or undefined when the frame is not something the shell
 * lists (session frames, server frames, deferred features). `clockMinAt(ts)` gives the exercise
 * clock at the frame's send time for items that carry no exercise time of their own.
 */
export function itemFromMessage(msg: Opened, clockMinAt: (ts: number) => number): Item | undefined {
  const at = clockMinAt(msg.ts)
  const base = {
    key: itemKey(msg),
    type: msg.type,
    from: msg.from,
    to: msg.to,
    seq: msg.seq,
    ts: msg.ts,
    ...(msg.index === undefined ? {} : { index: msg.index }),
    atMin: at,
    exerciseTime: formatClock(at),
  }
  switch (msg.type) {
    case 'inject.release': {
      const p = (msg as Opened<'inject.release'>).payload
      const min = parseExerciseTime(p.exerciseTime) ?? at
      return {
        ...base,
        kind: 'inject',
        atMin: min,
        exerciseTime: p.exerciseTime,
        title: p.title,
        body: p.text.headline ? `${p.text.headline}\n${p.text.body}` : p.text.body,
        altText: p.text.altText,
        ...(p.sender ? { sender: p.sender } : {}),
        attachments: p.media.length,
        ref: p.releaseId,
      }
    }
    case 'controller.notice': {
      const p = (msg as Opened<'controller.notice'>).payload
      if (p.kind === 'reseat')
        return { ...base, kind: 'reseat', title: STRINGS.feed.reseated, body: p.text }
      if (p.kind === 'hotwash.open' || p.kind === 'hotwash.close')
        return {
          ...base,
          kind: 'announcement',
          tab: 'hotwash',
          title: p.kind === 'hotwash.open' ? STRINGS.feed.hotwashOpen : STRINGS.feed.hotwashClosed,
          body: p.text,
          level: p.level,
          ...(p.ref ? { ref: p.ref } : {}),
        }
      return {
        ...base,
        kind: 'notice',
        title: STRINGS.levels[p.level],
        body: p.text,
        level: p.level,
        dismissible: p.dismissible,
        ref: p.noticeId,
      }
    }
    case 'clock.state': {
      const p = (msg as Opened<'clock.state'>).payload
      if (!p.reason) return undefined
      return { ...base, kind: 'clock', title: clockTitle(p.reason, p.elapsedMin, p.rate) }
    }
    case 'vote.open': {
      const p = (msg as Opened<'vote.open'>).payload
      return {
        ...base,
        kind: 'announcement',
        tab: 'votes',
        title: STRINGS.feed.voteOpened,
        body: p.question,
        ref: p.voteId,
      }
    }
    case 'vote.close': {
      const p = (msg as Opened<'vote.close'>).payload
      return {
        ...base,
        kind: 'announcement',
        tab: 'votes',
        title: STRINGS.feed.voteClosed,
        ref: p.voteId,
      }
    }
    case 'survey.open': {
      const p = (msg as Opened<'survey.open'>).payload
      return {
        ...base,
        kind: 'announcement',
        tab: 'surveys',
        title: STRINGS.feed.surveyOpened,
        body: p.title,
        ref: p.surveyId,
      }
    }
    case 'survey.close': {
      const p = (msg as Opened<'survey.close'>).payload
      return {
        ...base,
        kind: 'announcement',
        tab: 'surveys',
        title: STRINGS.feed.surveyClosed,
        ref: p.surveyId,
      }
    }
    default:
      return undefined
  }
}

function clockTitle(
  reason: NonNullable<Opened<'clock.state'>['payload']['reason']>,
  elapsedMin: number,
  rate: number,
): string {
  switch (reason) {
    case 'start':
      return STRINGS.feed.clockStart
    case 'pause':
      return STRINGS.feed.clockPause
    case 'set':
      return `${STRINGS.feed.clockSet} to ${formatClock(elapsedMin)}`
    case 'jump':
      return STRINGS.feed.clockJump(formatClock(elapsedMin))
    case 'rate':
      return STRINGS.feed.clockRate(rate)
    case 'reset':
      return STRINGS.feed.clockReset
    case 'nudge':
      return STRINGS.feed.clockNudge
  }
}

/** The destinations a seat reads as "mine" (FR-4). */
export function seatDestinations(seat: SeatView): Set<string> {
  const out = new Set<string>([`client:${seat.clientId}`])
  if (seat.roleId) out.add(`role:${seat.roleId}`)
  if (seat.teamId) out.add(`team:${seat.teamId}`)
  if (seat.kind === 'evaluator') out.add(`role:${RESERVED_ROLE_IDS[0]}`)
  if (seat.kind === 'observer') out.add(`role:${RESERVED_ROLE_IDS[1]}`)
  return out
}

/** Items addressed to this seat (role, team or device), notices excepted: those are feed. */
export function isInboxItem(item: Item, seat: SeatView | undefined): boolean {
  if (!seat || item.kind !== 'inject') return false
  return seatDestinations(seat).has(item.to)
}

/** Items everyone saw plus notices, clock changes and announcements addressed to this seat. */
export function isFeedItem(item: Item, seat: SeatView | undefined): boolean {
  if (item.to === 'all') return true
  if (item.kind === 'inject') return false
  return seat !== undefined && seatDestinations(seat).has(item.to)
}

/** Newest on top: by exercise time, then by arrival. */
export function compareItems(a: Item, b: Item): number {
  if (a.atMin !== b.atMin) return b.atMin - a.atMin
  if (a.index !== undefined && b.index !== undefined && a.index !== b.index)
    return b.index - a.index
  if (a.ts !== b.ts) return b.ts - a.ts
  return b.seq - a.seq
}

/** The list with `item` added (or replaced, same key), sorted. Returns the same array when nothing changed. */
export function insertItem(items: readonly Item[], item: Item): Item[] {
  const without = items.filter((x) => x.key !== item.key)
  const existing = items.length - without.length
  if (
    existing &&
    sameItem(
      items.find((x) => x.key === item.key)!,
      item,
    )
  )
    return items as Item[]
  return [...without, item].sort(compareItems)
}

function sameItem(a: Item, b: Item): boolean {
  return a.title === b.title && a.body === b.body && a.atMin === b.atMin && a.to === b.to
}

/** Seat and team names for `role:` and `team:` destinations, from the seats the controller sent. */
export function seatNamer(seats: readonly Seat[]): (to: string) => string | undefined {
  const names = new Map<string, string>()
  for (const s of seats) {
    names.set(`role:${s.id}`, s.name)
    if (s.teamId && s.teamName) names.set(`team:${s.teamId}`, s.teamName)
  }
  return (to) => names.get(to)
}
