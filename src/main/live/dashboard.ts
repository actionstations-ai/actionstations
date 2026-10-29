/**
 * The Room dashboard (spec 0417 FR-8, FR-9): a pure fold of the session log into counts for the
 * facilitator. Nothing here reads the disk; `now` is passed in so the unanswered rules are
 * testable with a fixed clock. State follows the log, so a past session is read the same way.
 */
import type {
  DashboardView,
  InjectRow,
  RosterRow,
  SessionLogEntry,
  UnansweredRow,
} from '@shared/schemas/live'

export const DEFAULT_UNANSWERED_AFTER_MIN = 10

export interface DashboardRole {
  id: string
  name: string
  team?: string | undefined
}

export interface DashboardContext {
  roles: readonly DashboardRole[]
  now: number
  live: boolean
  sessionId?: string
  /** Minutes before a release that expects a response is flagged (default 10). */
  unansweredAfterMin?: number
  logBytes?: number
}

type SeatKind = 'player' | 'evaluator' | 'observer'
interface Client {
  seat: string
  kind: SeatKind
  roleId?: string | undefined
  teamId?: string | undefined
  state: 'in' | 'out' | 'removed'
  name?: string | undefined
}

const ms = (iso: string): number => Date.parse(iso)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function median(values: readonly number[]): number | undefined {
  if (!values.length) return undefined
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function seatKey(e: SessionLogEntry): { seat: string; kind: SeatKind } {
  const kind = e.actor.seat?.kind
  if (kind === 'evaluator') return { seat: 'evaluators', kind: 'evaluator' }
  if (kind === 'observer') return { seat: 'observers', kind: 'observer' }
  return { seat: e.actor.seat?.roleId ?? 'unassigned', kind: 'player' }
}

function trackClients(entries: readonly SessionLogEntry[]): Map<string, Client> {
  const clients = new Map<string, Client>()
  for (const e of entries) {
    const ref = e.actor.clientRef
    if (!ref) continue
    if (e.kind === 'client.join' || e.kind === 'client.reseat') {
      clients.set(ref, {
        ...seatKey(e),
        roleId: e.actor.seat?.roleId,
        teamId: e.actor.seat?.teamId,
        state: 'in',
        name: e.actor.displayName,
      })
    } else if (e.kind === 'client.leave' || e.kind === 'client.kick') {
      const c = clients.get(ref)
      if (c) c.state = e.kind === 'client.kick' ? 'removed' : 'out'
    }
  }
  return clients
}

function roster(clients: Map<string, Client>, roles: readonly DashboardRole[]): RosterRow[] {
  const rows = new Map<string, RosterRow>()
  const row = (seat: string, label: string, kind: SeatKind) => {
    if (!rows.has(seat)) {
      rows.set(seat, { seat, label, kind, connected: 0, removed: 0, names: [], empty: false })
    }
    return rows.get(seat)!
  }
  for (const r of roles) row(r.id, r.name, 'player')
  for (const c of clients.values()) {
    const label = roles.find((r) => r.id === c.seat)?.name
    const r = row(c.seat, label ?? labelFor(c), c.kind)
    if (c.state === 'in') {
      r.connected += 1
      if (c.name) r.names.push(c.name)
    } else if (c.state === 'removed') r.removed += 1
  }
  for (const r of rows.values()) r.empty = r.kind === 'player' && r.connected === 0
  return [...rows.values()]
}

const labelFor = (c: Client): string =>
  c.kind === 'evaluator'
    ? 'Evaluators'
    : c.kind === 'observer'
      ? 'Observers'
      : 'Players without a role'

/** Does a release's target list reach this device's seat? */
export function targeted(
  targets: readonly string[],
  c: Client,
  roles: readonly DashboardRole[],
): boolean {
  const team = c.teamId ?? roles.find((r) => r.id === c.roleId)?.team
  return targets.some(
    (t) =>
      t === 'all' ||
      (t.startsWith('role:') && (t.slice(5) === c.roleId || t.slice(5) === c.seat)) ||
      (t.startsWith('team:') && team !== undefined && t.slice(5) === team),
  )
}

interface Release {
  entry: SessionLogEntry
  releaseId: string
  rowId: string
  targets: string[]
  at: number
  withdrawn: boolean
  reads: Map<string, number>
  receipts: Map<string, Set<string>>
  answer?: { by: InjectRow['answered']; at: number }
}

function collectReleases(entries: readonly SessionLogEntry[]): Map<string, Release> {
  const out = new Map<string, Release>()
  for (const e of entries) {
    const id = e.ref?.releaseId
    if (e.kind === 'inject.release' && id) {
      const targets = Array.isArray(e.data.targets) ? e.data.targets.map(String) : []
      out.set(id, {
        entry: e,
        releaseId: id,
        rowId: e.ref?.rowId ?? '',
        targets,
        at: ms(e.at),
        withdrawn: false,
        reads: new Map(),
        receipts: new Map(),
      })
    } else if (e.kind === 'inject.retract' && id) {
      const r = out.get(id)
      if (r) r.withdrawn = true
    }
  }
  return out
}

function noteAnswer(r: Release, by: NonNullable<Release['answer']>['by'], at: number) {
  if (!r.answer || at < r.answer.at) r.answer = { by, at }
}

function applyActivity(
  entries: readonly SessionLogEntry[],
  releases: Map<string, Release>,
  clients: Map<string, Client>,
  roles: readonly DashboardRole[],
) {
  for (const e of entries) {
    const at = ms(e.at)
    const ref = e.actor.clientRef
    const client = ref ? clients.get(ref) : undefined
    if (e.kind === 'inject.receipt' && ref && e.ref?.releaseId) {
      const r = releases.get(e.ref.releaseId)
      const status = str(e.data.status)
      if (!r || !status) continue
      const set = r.receipts.get(ref) ?? new Set<string>()
      set.add(status)
      r.receipts.set(ref, set)
      if (status === 'read' && !r.reads.has(ref)) r.reads.set(ref, at - r.at)
      if (status === 'actioned' && client && targeted(r.targets, client, roles)) {
        noteAnswer(r, 'actioned', at)
      }
    } else if (e.kind === 'inject.answered' && e.ref?.releaseId) {
      const r = releases.get(e.ref.releaseId)
      if (r) noteAnswer(r, 'marked', at)
    } else if (e.kind === 'message' && e.actor.kind === 'client' && client) {
      for (const r of releases.values()) {
        if (at >= r.at && targeted(r.targets, client, roles)) noteAnswer(r, 'message', at)
      }
    }
  }
}

function injectRows(
  releases: Map<string, Release>,
  clients: Map<string, Client>,
  c: DashboardContext,
  windowMin: number,
) {
  const rows: InjectRow[] = []
  const unanswered: UnansweredRow[] = []
  for (const r of releases.values()) {
    const ageMin = Math.max(0, (c.now - r.at) / 60_000)
    const expected = [...clients.values()].filter((x) => targeted(r.targets, x, c.roles)).length
    const has = (s: string) => [...r.receipts.values()].filter((set) => set.has(s)).length
    const firstRead = median([...r.reads.values()].map((d) => d / 1000))
    const expectsResponse = r.entry.data.expectsResponse === true
    rows.push({
      releaseId: r.releaseId,
      rowId: r.rowId,
      targets: r.targets,
      releasedAt: r.entry.at,
      withdrawn: r.withdrawn,
      expected,
      delivered: r.receipts.size,
      read: has('read'),
      actioned: has('actioned'),
      ...(firstRead !== undefined ? { firstReadSec: firstRead } : {}),
      expectsResponse,
      ...(r.answer
        ? { answered: r.answer.by, responseSec: Math.max(0, (r.answer.at - r.at) / 1000) }
        : {}),
      ageMin,
    })
    if (expectsResponse && !r.withdrawn && !r.answer && ageMin >= windowMin) {
      unanswered.push({ releaseId: r.releaseId, rowId: r.rowId, ageMin, windowMin })
    }
  }
  unanswered.sort((a, b) => b.ageMin - a.ageMin)
  return { rows, unanswered }
}

/** Releases flagged as unanswered at `now` (FR-9). */
export function unanswered(
  entries: readonly SessionLogEntry[],
  c: DashboardContext,
): UnansweredRow[] {
  return dashboardView(entries, c).unanswered
}

function messageStats(
  entries: readonly SessionLogEntry[],
  c: DashboardContext,
  clients: Map<string, Client>,
) {
  const lastByChannel = new Map<string, { fromClient: boolean; at: number }>()
  const pending = new Map<string, number>()
  const replies: number[] = []
  const perRole = new Map<string, number>()
  for (const e of entries) {
    const channel = e.ref?.channel
    if (e.kind !== 'message' || !channel) continue
    const at = ms(e.at)
    const fromClient = e.actor.kind === 'client'
    lastByChannel.set(channel, { fromClient, at })
    if (fromClient) {
      if (!pending.has(channel)) pending.set(channel, at)
      const seat =
        e.actor.seat?.roleId ??
        (e.actor.clientRef ? clients.get(e.actor.clientRef)?.seat : undefined)
      if (seat) perRole.set(seat, (perRole.get(seat) ?? 0) + 1)
    } else if (pending.has(channel)) {
      replies.push((at - pending.get(channel)!) / 1000)
      pending.delete(channel)
    }
  }
  const waiting = [...lastByChannel]
    .filter(([, v]) => v.fromClient)
    .map(([channel, v]) => ({
      channel,
      waitingMin: Math.max(0, (c.now - (pending.get(channel) ?? v.at)) / 60_000),
    }))
    .sort((a, b) => b.waitingMin - a.waitingMin)
  const medianReply = median(replies)
  return {
    threads: lastByChannel.size,
    waiting,
    ...(medianReply !== undefined ? { medianReplySec: medianReply } : {}),
    perRole: [...perRole].map(([seat, count]) => ({
      role: c.roles.find((r) => r.id === seat)?.name ?? seat,
      count,
    })),
  }
}

interface VoteFold {
  voteId: string
  question: string
  options: Map<string, string>
  counts: Map<string, number>
  closed?: { results: Map<string, number> }
}

function voteStats(entries: readonly SessionLogEntry[]): DashboardView['votes'] {
  const votes = new Map<string, VoteFold>()
  const tally = (v: VoteFold, source: Map<string, number>) =>
    [...v.options].map(([id, label]) => ({ label, count: source.get(id) ?? 0 }))
  for (const e of entries) {
    const id = e.ref?.voteId
    if (!id) continue
    if (e.kind === 'vote.open') {
      const options = new Map<string, string>()
      for (const o of Array.isArray(e.data.options) ? e.data.options : []) {
        const oid = str((o as { id?: unknown }).id)
        if (oid) options.set(oid, str((o as { label?: unknown }).label) || oid)
      }
      votes.set(id, { voteId: id, question: str(e.data.question), options, counts: new Map() })
    } else if (e.kind === 'vote.cast') {
      const v = votes.get(id)
      const opt = str(e.data.optionId)
      if (v && opt) v.counts.set(opt, (v.counts.get(opt) ?? 0) + 1)
    } else if (e.kind === 'vote.close') {
      const v = votes.get(id)
      if (!v) continue
      const results = new Map<string, number>()
      for (const r of Array.isArray(e.data.results) ? e.data.results : []) {
        const rr = r as { optionId?: unknown; count?: unknown }
        results.set(str(rr.optionId), typeof rr.count === 'number' ? rr.count : 0)
      }
      v.closed = { results }
    }
  }
  const all = [...votes.values()]
  const open = all.filter((v) => !v.closed).at(-1)
  const closed = all.filter((v) => v.closed).at(-1)
  return {
    ...(open
      ? { open: { voteId: open.voteId, question: open.question, tally: tally(open, open.counts) } }
      : {}),
    ...(closed
      ? {
          lastClosed: {
            voteId: closed.voteId,
            question: closed.question,
            tally: tally(closed, closed.closed!.results),
          },
        }
      : {}),
  }
}

function hotwashStats(entries: readonly SessionLogEntry[]): DashboardView['hotwash'] {
  const items = new Set<string>()
  const promoted = new Set<string>()
  let plusOnes = 0
  let open = false
  for (const e of entries) {
    const id = e.ref?.itemId ?? str(e.data.itemId)
    if (e.kind === 'hotwash.open') open = true
    else if (e.kind === 'hotwash.close') open = false
    else if (e.kind === 'hotwash.plus' || (e.kind === 'hotwash.item' && e.data.plusOneOf))
      plusOnes += 1
    else if (e.kind === 'hotwash.item' && id && !e.data.retractOf) items.add(id)
    else if (e.kind === 'hotwash.retract') items.delete(id || str(e.data.retractOf))
    else if (e.kind === 'hotwash.promoted' && id) promoted.add(id)
    else if (e.kind === 'hotwash.unpromoted') promoted.delete(id)
  }
  return {
    open,
    items: items.size,
    plusOnes,
    promoted: [...promoted].filter((i) => items.has(i)).length,
  }
}

function healthStats(
  entries: readonly SessionLogEntry[],
  c: DashboardContext,
): DashboardView['health'] {
  const dropped = new Map<string, number>()
  let rejected = 0
  let protocolVersion: number | undefined
  for (const e of entries) {
    if (e.kind === 'session.start' && typeof e.data.protocol === 'number')
      protocolVersion = e.data.protocol
    if (e.kind !== 'anomaly') continue
    if (e.data.what === 'frame dropped') {
      const reason = str(e.data.reason) || 'unknown'
      dropped.set(reason, (dropped.get(reason) ?? 0) + 1)
    } else rejected += 1
  }
  return {
    dropped: [...dropped].map(([reason, count]) => ({ reason, count })),
    rejected,
    ...(protocolVersion ? { protocolVersion } : {}),
    lastIndex: entries.at(-1)?.i ?? 0,
    logBytes: c.logBytes ?? 0,
  }
}

export function dashboardView(
  entries: readonly SessionLogEntry[],
  c: DashboardContext,
): DashboardView {
  const windowMin = c.unansweredAfterMin ?? DEFAULT_UNANSWERED_AFTER_MIN
  const clients = trackClients(entries)
  const releases = collectReleases(entries)
  applyActivity(entries, releases, clients, c.roles)
  const { rows, unanswered: late } = injectRows(releases, clients, c, windowMin)
  const observations = new Set(
    entries
      .filter((e) => e.kind === 'eval.observation')
      .map((e) => e.ref?.observationId ?? String(e.i)),
  )
  return {
    ...(c.sessionId ? { sessionId: c.sessionId } : {}),
    live: c.live,
    unansweredAfterMin: windowMin,
    connected: [...clients.values()].filter((x) => x.state === 'in').length,
    roster: roster(clients, c.roles),
    injects: rows,
    unanswered: late,
    messages: messageStats(entries, c, clients),
    votes: voteStats(entries),
    hotwash: hotwashStats(entries),
    evaluation: {
      observations: observations.size,
      evaluatorsConnected: [...clients.values()].filter(
        (x) => x.kind === 'evaluator' && x.state === 'in',
      ).length,
    },
    health: healthStats(entries, c),
  }
}
