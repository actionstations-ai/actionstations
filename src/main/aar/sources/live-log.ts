// The live-play session log → the record (#419, FR-1 and FR-10). Replays
// scenarios/<id>/live/<sessionId>/log.jsonl in the format of spec 0417 (one JSON entry per line:
// `i`, `at`, `ex`, `kind`, `actor`, `ref`, `data`) with the payloads of spec 0406, and maps the
// entries onto the record: inject.release → delivered; message (+ message.pinned) → messages;
// vote.open / vote.cast / vote.close → votes; hotwash.item / plus / retract / update / promoted
// → hotwash; eval.observation → observations (highest revision wins; kind `note` becomes a
// note). survey.response is left alone: live play mirrors responses into the survey store, which
// the surveys adapter reads.
//
// This adapter is the only module here that knows the log's shape, and it is where identities
// are removed: `actor.displayName` is never read, seats become role labels or "a player", and an
// evaluator reaches the record only as the label they signed with. A missing or unreadable log
// yields no live source and a warning, never a failed draft. The file is read through
// `readSlice` (spec 0417 FR-11), which already leaves out display names and client references.
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import type { LiveSessionInfo } from '@shared/ipc/aar'
import {
  HotwashItemKind,
  type ExerciseRecord,
  type RecordHotwashItem,
  type RecordMessage,
  type RecordObservation,
  type RecordVote,
} from '@shared/schemas/aar'
import { Rating } from '@shared/schemas/evaluation'
import type { Scenario } from '@shared/schemas/scenario'
import { exists, safeJoin } from '../../lib/fs'
import {
  LOG_FILE,
  SESSION_FILE,
  isSessionName,
  liveRoot,
  logFile,
  parseLogText,
  readAll,
  readSliceDetailed,
} from '../../live/log-read'
import { roleLabel } from './facilitator'

/** The parts of a log entry this adapter reads: a slice row, or a parsed log line. */
export interface LogEntry {
  i: number
  at: string
  ex?: string | undefined
  kind: string
  actor?:
    | {
        kind?: string | undefined
        seat?: { kind?: string | undefined; roleId?: string | undefined } | undefined
        evaluator?: string | undefined
        persona?: string | undefined
      }
    | undefined
  ref?:
    | {
        rowId?: string | undefined
        releaseId?: string | undefined
        messageId?: string | undefined
        voteId?: string | undefined
        itemId?: string | undefined
        observationId?: string | undefined
      }
    | undefined
  data: Record<string, unknown>
}

export interface LiveLogResult {
  sessionId: string
  entries: LogEntry[]
  /** Lines that were not valid entries (a torn last line after a crash, for one). */
  skipped: number
}

/** Caps so a hand-edited log cannot exhaust memory: entries read and text kept per field. */
const MAX_TEXT = 4000

const SessionFile = z.looseObject({
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
})

export const liveDir = liveRoot

/** Parse a log file's text (used by tests; the adapter itself reads through `readSlice`). */
export const parseLog = parseLogText

async function sessionInfo(dir: string, id: string): Promise<LiveSessionInfo> {
  const entries = await readAll(safeJoin(dir, LOG_FILE))
  const meta = await fs
    .readFile(safeJoin(dir, SESSION_FILE), 'utf8')
    .then((raw) => SessionFile.safeParse(JSON.parse(raw)))
    .then((r) => (r.success ? r.data : {}))
    .catch(() => ({}) as z.infer<typeof SessionFile>)
  const started = meta.startedAt ?? entries[0]?.at
  const ended = meta.endedAt ?? entries.find((e) => e.kind === 'session.end')?.at
  const iso = (s: string | undefined) => (s && !Number.isNaN(Date.parse(s)) ? s : undefined)
  return {
    id,
    ...(iso(started) ? { startedAt: new Date(started!).toISOString() } : {}),
    ...(iso(ended) ? { endedAt: new Date(ended!).toISOString() } : {}),
    entries: entries.length,
  }
}

/** Sessions with a log, ended ones first (most recent end first), then interrupted ones. */
export async function listLiveSessions(
  root: string,
  scenarioId: string,
): Promise<LiveSessionInfo[]> {
  const dir = liveDir(root, scenarioId)
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const infos: LiveSessionInfo[] = []
  for (const name of names) {
    if (!isSessionName(name)) continue
    const sessionDir = safeJoin(dir, name)
    if (!(await exists(safeJoin(sessionDir, LOG_FILE)))) continue
    infos.push(await sessionInfo(sessionDir, name).catch(() => ({ id: name, entries: 0 })))
  }
  const rank = (s: LiveSessionInfo) => (s.endedAt ? 0 : 1)
  return infos.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.endedAt ?? b.startedAt ?? '').localeCompare(a.endedAt ?? a.startedAt ?? '') ||
      a.id.localeCompare(b.id),
  )
}

/**
 * The log of one session (the most recent ended one when `sessionId` is absent), or undefined
 * when the scenario has no live session. A log that cannot be read throws; the caller turns
 * that into a warning.
 */
export async function readLiveLog(
  root: string,
  scenarioId: string,
  sessionId?: string,
): Promise<LiveLogResult | undefined> {
  const id = sessionId ?? (await listLiveSessions(root, scenarioId))[0]?.id
  if (!id) return undefined
  if (!(await exists(logFile(root, scenarioId, id)))) return undefined
  const { rows, skipped } = await readSliceDetailed(root, scenarioId, id)
  return { sessionId: id, entries: rows, skipped }
}

// ---------------------------------------------------------------------------------------------
// Mapping entries onto the record

const str = (v: unknown, max = MAX_TEXT): string =>
  typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : ''
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
/** The payload's own exercise time (an observation's, a release's), else the entry's clock. */
const exerciseTime = (e: LogEntry): string | undefined =>
  typeof e.data.exerciseTime === 'string' ? e.data.exerciseTime : e.ex

/** A seat as a role label; a player without a role, or no seat at all, is "a player". */
function seatLabel(scenario: Scenario, e: LogEntry): string {
  const actor = e.actor
  if (actor?.kind === 'controller') return actor.persona ? `SimCell (${actor.persona})` : 'SimCell'
  if (actor?.seat?.kind === 'evaluator') return 'an evaluator'
  return roleLabel(scenario, actor?.seat?.roleId) ?? 'a player'
}

/** "role:<id>" → role label; "team:<id>" → the team; anything else → "a player". */
function channelLabel(scenario: Scenario, channel: string): string | undefined {
  if (!channel) return undefined
  if (channel.startsWith('role:')) return roleLabel(scenario, channel.slice(5)) ?? 'a player'
  if (channel.startsWith('team:')) {
    const team = scenario.roles.find((r) => r.id === channel.slice(5))?.team
    return team ? `team ${team}` : 'a team'
  }
  return 'a player'
}

export type LivePart = Pick<
  ExerciseRecord,
  'delivered' | 'notes' | 'hotwash' | 'observations' | 'votes' | 'messages' | 'messageCounts'
>

interface VoteState {
  vote: RecordVote
  options: { id: string; label: string }[]
  casts: Map<string, number>
  closed: boolean
}

function mapDelivered(entries: LogEntry[]): ExerciseRecord['delivered'] {
  const seen = new Set<string>()
  const out: ExerciseRecord['delivered'] = []
  for (const e of entries) {
    if (e.kind !== 'inject.release') continue
    const rowId = str(e.ref?.rowId || e.data.mselRowId, 64)
    if (!rowId || seen.has(rowId)) continue
    seen.add(rowId)
    out.push({ rowId, exerciseTime: exerciseTime(e) ?? '0:00', at: e.at })
  }
  return out
}

function mapMessages(entries: LogEntry[], scenario: Scenario) {
  const releases = new Map<string, string>()
  const messages = new Map<string, RecordMessage>()
  for (const e of entries) {
    if (e.kind === 'inject.release') {
      const releaseId = str(e.ref?.releaseId || e.data.releaseId, 64)
      const rowId = str(e.ref?.rowId || e.data.mselRowId, 64)
      if (releaseId && rowId) releases.set(releaseId, rowId)
    } else if (e.kind === 'message') {
      const id = str(e.ref?.messageId || e.data.messageId, 64)
      const text = str(e.data.text)
      if (!id || !text) continue
      const replyTo = str(e.data.replyTo, 64)
      const rowId = releases.get(replyTo)
      const toRole = channelLabel(scenario, str(e.data.channel, 160))
      const ex = exerciseTime(e)
      messages.set(id, {
        ref: `msg:${id}`,
        ...(ex ? { exerciseTime: ex } : {}),
        fromRole: seatLabel(scenario, e),
        ...(toRole ? { toRole } : {}),
        text,
        ...(rowId ? { rowId } : {}),
        pinned: false,
      })
    } else if (e.kind === 'message.pinned') {
      const m = messages.get(str(e.ref?.messageId || e.data.messageId, 64))
      if (m) m.pinned = e.data.pinned !== false
    }
  }
  const counts = new Map<string, number>()
  for (const m of messages.values()) counts.set(m.fromRole, (counts.get(m.fromRole) ?? 0) + 1)
  return {
    messages: [...messages.values()],
    messageCounts: [...counts].map(([role, count]) => ({ role, count })),
  }
}

function voteOptions(raw: unknown): { id: string; label: string }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((o) => ({
      id: str((o as { id?: unknown })?.id, 64),
      label: str((o as { label?: unknown })?.label, 200),
    }))
    .filter((o) => o.id)
    .slice(0, 10)
}

function mapVotes(entries: LogEntry[]): RecordVote[] {
  const votes = new Map<string, VoteState>()
  for (const e of entries) {
    const voteId = str(e.ref?.voteId || e.data.voteId, 64)
    if (!voteId) continue
    if (e.kind === 'vote.open' && !votes.has(voteId)) {
      const rowId = str(e.ref?.rowId || e.data.mselRowId, 64)
      const ex = exerciseTime(e)
      const options = voteOptions(e.data.options)
      votes.set(voteId, {
        vote: {
          ref: `vote:${voteId}`,
          ...(rowId ? { rowId } : {}),
          ...(ex ? { exerciseTime: ex } : {}),
          question: str(e.data.question),
          options: options.map((o) => ({ label: o.label || o.id, count: 0 })),
        },
        options,
        casts: new Map(),
        closed: false,
      })
    } else if (e.kind === 'vote.cast') {
      const v = votes.get(voteId)
      const option = str(e.data.optionId, 64)
      if (v && option) {
        v.casts.set(option, (v.casts.get(option) ?? 0) + 1)
        // A changed ballot replaces the one it came from (it carries no device, only the option).
        const from = str(e.data.changedFrom, 64)
        if (from) v.casts.set(from, Math.max(0, (v.casts.get(from) ?? 0) - 1))
      }
    } else if (e.kind === 'vote.close') {
      const v = votes.get(voteId)
      if (!v) continue
      const results = Array.isArray(e.data.results) ? e.data.results : []
      const counts = new Map(
        results.map((r) => [
          str((r as { optionId?: unknown })?.optionId, 64),
          int((r as { count?: unknown })?.count),
        ]),
      )
      v.vote.options = v.options.map((o) => ({
        label: o.label || o.id,
        count: counts.get(o.id) ?? 0,
      }))
      v.vote.voted = int(e.data.voted)
      if (e.data.eligible !== undefined) v.vote.eligible = int(e.data.eligible)
      v.closed = true
    }
  }
  return [...votes.values()].map((v) => {
    if (v.closed) return v.vote
    const options = v.options.map((o) => ({
      label: o.label || o.id,
      count: v.casts.get(o.id) ?? 0,
    }))
    const voted = options.reduce((n, o) => n + o.count, 0)
    return { ...v.vote, options, voted }
  })
}

function mapHotwash(entries: LogEntry[]): RecordHotwashItem[] {
  const items = new Map<string, RecordHotwashItem>()
  for (const e of entries) {
    if (!e.kind.startsWith('hotwash.')) continue
    const itemId = str(e.ref?.itemId || e.data.itemId, 64)
    const plusOneOf = str(e.data.plusOneOf, 64)
    const retractOf = str(e.data.retractOf, 64)
    if (e.kind === 'hotwash.item' && itemId && !plusOneOf && !retractOf) {
      const kind = HotwashItemKind.safeParse(e.data.kind)
      const text = str(e.data.text)
      if (!kind.success || !text) continue
      const objectiveRef = str(e.data.objectiveId, 128)
      const rowId = str(e.data.mselRowId, 64)
      items.set(itemId, {
        ref: `hw:${itemId}`,
        kind: kind.data,
        text,
        ...(objectiveRef ? { objectiveRef } : {}),
        ...(rowId ? { rowId } : {}),
        plusOnes: 0,
        promoted: false,
      })
    } else if (plusOneOf || e.kind === 'hotwash.plus') {
      const target = items.get(plusOneOf || itemId)
      if (target) target.plusOnes += 1
    } else if (retractOf || e.kind === 'hotwash.retract') {
      items.delete(retractOf || itemId)
    } else if (
      e.kind === 'hotwash.update' ||
      e.kind === 'hotwash.promoted' ||
      e.kind === 'hotwash.unpromoted'
    ) {
      applyHotwashUpdate(items, itemId, e)
    }
  }
  return [...items.values()]
}

function applyHotwashUpdate(items: Map<string, RecordHotwashItem>, itemId: string, e: LogEntry) {
  const item = items.get(itemId)
  if (!item) return
  const action =
    e.kind === 'hotwash.promoted'
      ? 'promote'
      : e.kind === 'hotwash.unpromoted'
        ? 'unpromote'
        : str(e.data.action, 20)
  switch (action) {
    case 'hide':
      items.delete(itemId)
      return
    case 'promote':
      item.promoted = true
      return
    case 'unpromote':
      item.promoted = false
      return
    case 'edit':
    case 'tag': {
      const text = str(e.data.text)
      const kind = HotwashItemKind.safeParse(e.data.kind)
      const objectiveRef = str(e.data.objectiveId, 128)
      const rowId = str(e.data.mselRowId, 64)
      if (text) item.text = text
      if (kind.success) item.kind = kind.data
      if (objectiveRef) item.objectiveRef = objectiveRef
      if (rowId) item.rowId = rowId
      if (typeof e.data.plus === 'number') item.plusOnes = int(e.data.plus)
      return
    }
    default:
      return
  }
}

const epochIso = (v: unknown, fallback: string): string => {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString()
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString()
  return fallback
}

function mapObservations(entries: LogEntry[]) {
  const latest = new Map<string, { revision: number; entry: LogEntry }>()
  for (const e of entries) {
    if (e.kind !== 'eval.observation') continue
    const id = str(e.ref?.observationId || e.data.observationId, 64)
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) continue
    const revision = int(e.data.revision) || 1
    const prev = latest.get(id)
    if (!prev || revision >= prev.revision) latest.set(id, { revision, entry: e })
  }
  const observations: RecordObservation[] = []
  const notes: ExerciseRecord['notes'] = []
  for (const [id, { entry: e }] of latest) {
    const rating = Rating.safeParse(e.data.rating)
    const rowId = str(e.data.mselRowId || e.ref?.rowId, 64)
    const text = str(e.data.notes)
    if (e.data.kind === 'note' || !rating.success) {
      if (text) notes.push({ ref: `note:${id}`, ...(rowId ? { rowId } : {}), text })
      continue
    }
    const taskId = str(e.data.taskId, 128)
    const criterionId = str(e.data.criterionId, 200)
    const ex = exerciseTime(e)
    const evaluator = str(e.actor?.evaluator, 60)
    observations.push({
      ref: `obs:${id}`,
      id,
      at: epochIso(e.data.observedAt, e.at),
      ...(ex ? { exerciseTime: ex } : {}),
      ...(rowId ? { rowId } : {}),
      ...(taskId ? { taskId } : {}),
      ...(criterionId ? { criterionId } : taskId ? { criterionId: taskId } : {}),
      rating: rating.data,
      note: text,
      ...(evaluator ? { evaluator } : {}),
      source: 'live',
    })
  }
  return { observations, notes }
}

/** The record's live part. Nothing from `actor.displayName` or any client identifier is read. */
export function livePart(entries: LogEntry[], scenario: Scenario): LivePart {
  const { messages, messageCounts } = mapMessages(entries, scenario)
  const { observations, notes } = mapObservations(entries)
  return {
    delivered: mapDelivered(entries),
    notes,
    hotwash: mapHotwash(entries),
    observations,
    votes: mapVotes(entries),
    messages,
    messageCounts,
  }
}
