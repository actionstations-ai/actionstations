/**
 * Reading a session's folder (spec 0417 FR-1, FR-6, FR-10, FR-11): the path of a session, the
 * slice API other features read the log through (`readSlice`), the Log view's windowed tail and
 * the sessions list. Nothing outside this file and `log.ts` parses `log.jsonl`.
 */
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import { SessionId } from '@shared/live/schemas/envelope'
import { SafeId } from '@shared/schemas/common'
import {
  LiveSession,
  type LiveSessionCounts,
  type LiveSessionSummary,
  type LogSliceRow,
  type SessionLogEntry,
} from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import { exists, safeJoin } from '../lib/fs'
import { scenarioLayout } from '../scenario/layout'
import { summarize } from './log-summary'

export const LOG_FILE = 'log.jsonl'
export const SESSION_FILE = 'session.json'

export const liveRoot = (root: string, scenarioId: string): string =>
  safeJoin(scenarioLayout(root, scenarioId).dir, 'live')

/** A session folder name: a protocol session id (22 base64url characters) or a plain safe id. */
export const isSessionName = (name: string): boolean =>
  SessionId.safeParse(name).success || SafeId.safeParse(name).success

/** `scenarios/<id>/live/<sessionId>`; the id is validated before it becomes a path segment. */
export function sessionFolder(root: string, scenarioId: string, sessionId: string): string {
  if (!isSessionName(sessionId)) throw new AppError('VALIDATION', 'Invalid session id')
  return safeJoin(liveRoot(root, scenarioId), sessionId)
}

export const logFile = (root: string, scenarioId: string, sessionId: string): string =>
  safeJoin(sessionFolder(root, scenarioId, sessionId), LOG_FILE)

/**
 * What a reader needs of a line. Deliberately loose: a hand-edited or older log still reads, and
 * an unknown field is ignored rather than failing the line. The writer (`log.ts`) is strict.
 */
const LooseEntry = z.looseObject({
  i: z.number().int().nonnegative(),
  at: z.string(),
  ex: z.string().optional(),
  kind: z.string(),
  actor: z.looseObject({}).default({}),
  ref: z.looseObject({}).optional(),
  data: z.record(z.string(), z.unknown()).default({}),
})

/** Caps so a hand-edited log cannot exhaust memory. */
const MAX_ENTRIES = 50_000

/** Parse a log file's text; lines that are not entries (a torn last line) are counted, not fatal. */
export function parseLogText(raw: string): { entries: SessionLogEntry[]; skipped: number } {
  const entries: SessionLogEntry[] = []
  let skipped = 0
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    if (entries.length >= MAX_ENTRIES) break
    try {
      const parsed = LooseEntry.safeParse(JSON.parse(line))
      if (parsed.success) entries.push(parsed.data as unknown as SessionLogEntry)
      else skipped++
    } catch {
      skipped++
    }
  }
  entries.sort((a, b) => a.i - b.i)
  return { entries, skipped }
}

async function readParsed(path: string) {
  try {
    return parseLogText(await fs.readFile(path, 'utf8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], skipped: 0 }
    throw e
  }
}

export async function readAll(path: string): Promise<SessionLogEntry[]> {
  return (await readParsed(path)).entries
}

function toSliceRow(e: SessionLogEntry): LogSliceRow {
  const replyTo = e.data.replyTo
  const text = e.data.text
  const { seat, evaluator, persona } = e.actor
  return {
    i: e.i,
    kind: e.kind,
    at: e.at,
    ...(e.ex ? { ex: e.ex } : {}),
    ...(e.ref?.rowId ? { rowId: e.ref.rowId } : {}),
    ...(e.ref?.releaseId ? { releaseId: e.ref.releaseId } : {}),
    ...(typeof replyTo === 'string' ? { inReplyTo: replyTo } : {}),
    ...(seat?.roleId ? { fromRoleId: seat.roleId } : {}),
    ...(typeof text === 'string' ? { text } : {}),
    // The actor without `displayName` and `clientRef`: consumers get roles, never identities.
    actor: {
      kind: e.actor.kind ?? 'system',
      ...(seat ? { seat } : {}),
      ...(evaluator ? { evaluator } : {}),
      ...(persona ? { persona } : {}),
    },
    ...(e.ref ? { ref: e.ref } : {}),
    data: e.data,
  }
}

export interface SliceOptions {
  kinds?: readonly string[]
  /** Only entries with an index above this one. */
  after?: number
}

/** The entries of one session, optionally filtered by kind and index (FR-11). Empty if no log. */
export async function readSlice(
  root: string,
  scenarioId: string,
  sessionId: string,
  opts: SliceOptions = {},
): Promise<LogSliceRow[]> {
  return (await readSliceDetailed(root, scenarioId, sessionId, opts)).rows
}

/** `readSlice` plus the number of lines that were not entries (the AAR warns about them). */
export async function readSliceDetailed(
  root: string,
  scenarioId: string,
  sessionId: string,
  opts: SliceOptions = {},
): Promise<{ rows: LogSliceRow[]; skipped: number }> {
  const kinds = opts.kinds ? new Set(opts.kinds) : undefined
  const { entries, skipped } = await readParsed(logFile(root, scenarioId, sessionId))
  const rows = entries
    .filter((e) => (opts.after === undefined || e.i > opts.after) && (!kinds || kinds.has(e.kind)))
    .map(toSliceRow)
  return { rows, skipped }
}

export interface TailOptions {
  before?: number
  limit?: number
  kinds?: readonly string[]
  q?: string
}

/** The Log view's window: newest first, `limit` entries below `before`, filtered (FR-10). */
export function tailEntries(
  entries: readonly SessionLogEntry[],
  opts: TailOptions,
  roleName: (id: string | undefined) => string | undefined,
  starred: ReadonlySet<string>,
) {
  const kinds = opts.kinds?.length ? new Set(opts.kinds) : undefined
  const q = opts.q?.trim().toLowerCase()
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500)
  const rows: ReturnType<typeof viewRow>[] = []
  let hasMore = false
  for (let k = entries.length - 1; k >= 0; k--) {
    const e = entries[k]!
    if (opts.before !== undefined && e.i >= opts.before) continue
    if (kinds && !kinds.has(e.kind)) continue
    const row = viewRow(e, roleName, starred)
    if (q && !`${row.kind} ${row.actor} ${row.summary}`.toLowerCase().includes(q)) continue
    if (rows.length >= limit) {
      hasMore = true
      break
    }
    rows.push(row)
  }
  return { entries: rows, hasMore }
}

export function actorLabel(
  e: SessionLogEntry,
  roleName: (id: string | undefined) => string | undefined,
): string {
  if (e.actor.kind === 'controller')
    return e.actor.persona ? `SimCell (${e.actor.persona})` : 'controller'
  if (e.actor.evaluator) return `evaluator ${e.actor.evaluator}`
  if (e.actor.seat?.roleId) return roleName(e.actor.seat.roleId) ?? e.actor.seat.roleId
  if (e.actor.seat) return e.actor.seat.kind
  return e.actor.kind
}

function viewRow(
  e: SessionLogEntry,
  roleName: (id: string | undefined) => string | undefined,
  starred: ReadonlySet<string>,
) {
  const messageId = e.kind === 'message' ? e.ref?.messageId : undefined
  return {
    i: e.i,
    at: e.at,
    ...(e.ex ? { ex: e.ex } : {}),
    kind: e.kind,
    actor: actorLabel(e, roleName),
    summary: summarize(e, roleName),
    ...(messageId ? { messageId, starred: starred.has(messageId) } : {}),
  }
}

/** Message ids currently starred (the last `message.star` per id wins). */
export function starredMessages(entries: readonly SessionLogEntry[]): Set<string> {
  const out = new Set<string>()
  for (const e of entries) {
    const id = e.ref?.messageId
    if (e.kind !== 'message.star' || !id) continue
    if (e.data.on === false) out.delete(id)
    else out.add(id)
  }
  return out
}

/** Counts for `session.json.summary` and the sessions list (FR-1, FR-6). */
export function countEntries(entries: readonly SessionLogEntry[]): LiveSessionCounts {
  const distinct = (kind: string, key: (e: SessionLogEntry) => string | undefined) =>
    new Set(entries.filter((e) => e.kind === kind).map(key)).size
  const count = (kind: string) => entries.filter((e) => e.kind === kind).length
  return {
    clients: distinct('client.join', (e) => e.actor.clientRef),
    releases: count('inject.release'),
    receipts: count('inject.receipt'),
    messages: count('message'),
    votes: count('vote.open'),
    hotwashItems: entries.filter(
      (e) => e.kind === 'hotwash.item' && !e.data.plusOneOf && !e.data.retractOf,
    ).length,
    observations: distinct('eval.observation', (e) => e.ref?.observationId ?? String(e.i)),
    surveys: count('survey.open'),
  }
}

async function readSessionFile(dir: string): Promise<LiveSession | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(safeJoin(dir, SESSION_FILE), 'utf8'))
    const parsed = LiveSession.safeParse(raw)
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/** Past and interrupted sessions of a scenario, interrupted first, then newest first (FR-6). */
export async function listSessions(
  root: string,
  scenarioId: string,
  runningId?: string,
): Promise<LiveSessionSummary[]> {
  const base = liveRoot(root, scenarioId)
  const names = await fs.readdir(base).catch(() => [] as string[])
  const out: LiveSessionSummary[] = []
  for (const name of names) {
    if (!isSessionName(name)) continue
    const dir = safeJoin(base, name)
    const session = await readSessionFile(dir)
    if (!session) continue
    const counts = session.summary ?? countEntries(await readAll(safeJoin(dir, LOG_FILE)))
    out.push({
      id: session.id,
      name: session.name,
      startedAt: session.startedAt,
      ...(session.endedAt ? { endedAt: session.endedAt } : {}),
      interrupted: !session.endedAt && session.id !== runningId,
      attribution: session.attribution,
      counts,
    })
  }
  return out.sort(
    (a, b) =>
      Number(b.interrupted) - Number(a.interrupted) || b.startedAt.localeCompare(a.startedAt),
  )
}

/** The session the dashboard should read: the one asked for, else the newest. */
export async function newestSessionId(
  root: string,
  scenarioId: string,
): Promise<string | undefined> {
  return (await listSessions(root, scenarioId))
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.id
}

export async function logSize(path: string): Promise<number> {
  return (await exists(path)) ? (await fs.stat(path)).size : 0
}
