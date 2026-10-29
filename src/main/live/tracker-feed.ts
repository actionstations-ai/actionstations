/**
 * What the Facilitate tracker reads of a live session (spec 0428 §4, task 7): the session log
 * folded into the slice `evaluate` takes. Receipts feed T2 (released but not opened), a device's
 * message, an actioned receipt or a closed vote on a row feed the answered check, and the text of
 * messages is offered so the commitment detector can read promises made in them.
 */
import type { SessionEntry } from '@shared/facilitator/tracker'
import type { SessionLogEntry } from '@shared/schemas/live'
import { collectReleases, targeted, trackClients, type DashboardRole } from './dashboard'

export interface FeedMessage {
  messageId: string
  text: string
  /** The row the message answers, when it can be told. */
  rowId?: string
  at: number
}

export interface TrackerFeed {
  live: boolean
  session: SessionEntry[]
  messages: FeedMessage[]
}

const ms = (iso: string): number => Date.parse(iso)

/** The release rows a device's message answers: those sent to its seat before the message. */
function answeredRows(
  e: SessionLogEntry,
  releases: ReturnType<typeof collectReleases>,
  clients: ReturnType<typeof trackClients>,
  roles: readonly DashboardRole[],
): string[] {
  const client = e.actor.clientRef ? clients.get(e.actor.clientRef) : undefined
  if (!client) return []
  const rows = new Set<string>()
  for (const r of releases.values()) {
    if (r.rowId && ms(e.at) >= r.at && targeted(r.targets, client, roles)) rows.add(r.rowId)
  }
  return [...rows]
}

export function trackerFeed(
  entries: readonly SessionLogEntry[],
  roles: readonly DashboardRole[],
): TrackerFeed {
  const releases = collectReleases(entries)
  const clients = trackClients(entries)
  const voteRows = new Map<string, string>()
  const session: SessionEntry[] = []
  const messages: FeedMessage[] = []
  for (const e of entries) {
    const at = ms(e.at)
    const rowId = e.ref?.rowId
    if (e.kind === 'inject.release' && rowId) {
      session.push({ kind: 'inject.release', at, rowId })
    } else if (e.kind === 'inject.receipt' && rowId && typeof e.data.status === 'string') {
      session.push({ kind: 'inject.receipt', at, rowId, receipt: e.data.status })
    } else if (e.kind === 'vote.open' && e.ref?.voteId && typeof e.data.mselRowId === 'string') {
      voteRows.set(e.ref.voteId, e.data.mselRowId)
    } else if (e.kind === 'vote.close' && e.ref?.voteId && voteRows.has(e.ref.voteId)) {
      session.push({ kind: 'vote.close', at, rowId: voteRows.get(e.ref.voteId)! })
    } else if (e.kind === 'message' && e.ref?.messageId) {
      const fromPlayer = e.actor.kind === 'client'
      const rows = fromPlayer ? answeredRows(e, releases, clients, roles) : []
      for (const row of rows) session.push({ kind: 'message.send', at, rowId: row, fromPlayer })
      const text = typeof e.data.text === 'string' ? e.data.text : ''
      if (text) {
        messages.push({
          messageId: e.ref.messageId,
          text: text.slice(0, 2000),
          ...(rows.length === 1 ? { rowId: rows[0]! } : {}),
          at,
        })
      }
    }
  }
  return { live: true, session, messages: messages.slice(-200) }
}
