/**
 * The unanswered-inject and unkept-commitment tracker (spec 0428 FR-13..18). Pure functions over
 * the MSEL and the facilitator state, run on every clock tick, so they stay linear.
 */
import type {
  Commitment,
  CommitmentSuggestion,
  FacilitatorState,
  TrackerState,
} from '../ipc/facilitator'
import { exerciseMinutes } from '../schemas/common'
import type { MselRow, Phase } from '../schemas/scenario'

/** Exercise minutes to wait for a response before flagging a row (also the live dashboard's). */
export const DEFAULT_RESPONSE_WINDOW_MIN = 10
/** Real minutes a released inject may stay unread on a device before T2 flags it. */
export const NOT_OPENED_AFTER_MIN = 3
/** Exercise minutes an open commitment may go without a due time before T4 mentions it. */
export const NO_DUE_TIME_AFTER_MIN = 30

const SILENCE_MATTERS = new Set([
  'CORE_NARRATIVE',
  'PRESSURE',
  'MISINFORMATION',
  'CLUE',
  'TECH_HURDLE',
  'DECISION_POINT',
  'OPERATIONAL_FRICTION',
])

/** Whether silence on a row should be flagged: the row's own choice, else by purpose tag. */
export const expectsResponse = (row: Pick<MselRow, 'purposeTag' | 'expectsResponse'>): boolean =>
  row.expectsResponse ?? SILENCE_MATTERS.has(row.purposeTag)

export const responseWindow = (
  row: Pick<MselRow, 'responseWindowMin'>,
  defaultMin = DEFAULT_RESPONSE_WINDOW_MIN,
): number => row.responseWindowMin ?? defaultMin

export type FlagRule = 'T1' | 'T2' | 'T3' | 'T4' | 'T5'

export interface Flag {
  /** Stable, e.g. "T1:I-07"; dismissals are kept by id. */
  id: string
  rule: FlagRule
  level: 'warn' | 'info'
  rowId?: string
  commitmentId?: string
  /** Exercise minute the flag started counting from. */
  since: number
  text: string
}

/** The slice of the live-play session log the tracker reads (spec 0428 §4). */
export interface SessionEntry {
  kind: 'inject.release' | 'inject.receipt' | 'message.send' | 'vote.close'
  /** Wall time, milliseconds. */
  at: number
  rowId?: string
  /** For a receipt: only `read` counts as opened. */
  receipt?: string
  /** A message that answers a release or names the row; players only. */
  fromPlayer?: boolean
}

export interface TrackerInput {
  msel: readonly MselRow[]
  phases?: readonly Pick<Phase, 'id' | 'endTime'>[]
  state: Pick<FacilitatorState, 'delivered' | 'notes'> & { tracker?: TrackerState | undefined }
  /** Exercise minutes now. */
  minutes: number
  nowMs?: number
  session?: readonly SessionEntry[]
  defaultWindowMin?: number
}

const deliveredAt = (input: TrackerInput, rowId: string): number | undefined => {
  const d = input.state.delivered[rowId]
  return d ? exerciseMinutes(d.exerciseTime) : undefined
}

const fmtMin = (m: number): string => {
  const total = Math.max(0, Math.floor(m))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function answeredFromSession(input: TrackerInput): Set<string> {
  const ids = new Set<string>()
  for (const e of input.session ?? []) {
    if (!e.rowId) continue
    const player = e.kind === 'message.send' && e.fromPlayer
    const acted = e.kind === 'inject.receipt' && e.receipt === 'actioned'
    if (player || acted || e.kind === 'vote.close') ids.add(e.rowId)
  }
  return ids
}

/** T1 (unanswered) and T5 (expected action unconfirmed), per delivered row. */
function rowFlags(input: TrackerInput): Flag[] {
  const responses = input.state.tracker?.responses ?? {}
  const answered = answeredFromSession(input)
  const phaseEnd = new Map((input.phases ?? []).map((p) => [p.id, exerciseMinutes(p.endTime)]))
  const out: Flag[] = []
  for (const row of input.msel) {
    const at = deliveredAt(input, row.id)
    if (at === undefined) continue
    const hasResponse = !!responses[row.id] || answered.has(row.id)
    const age = input.minutes - at
    const window = responseWindow(row, input.defaultWindowMin)
    if (expectsResponse(row) && !hasResponse && age >= window) {
      const text = `${row.id} ${row.event}: no response for ${Math.floor(age)} min`
      out.push({ id: `T1:${row.id}`, rule: 'T1', level: 'warn', rowId: row.id, since: at, text })
    }
    const ended = phaseEnd.get(row.phaseId)
    const noted = !!input.state.notes[row.id]?.trim()
    if (
      row.expectedAction.trim() &&
      !hasResponse &&
      !noted &&
      ended !== undefined &&
      input.minutes > ended
    ) {
      const text = `${row.id} expected action unconfirmed: "${row.expectedAction}"`
      out.push({ id: `T5:${row.id}`, rule: 'T5', level: 'info', rowId: row.id, since: ended, text })
    }
  }
  return out
}

/** T2: released to devices, still unread after a few real minutes. */
function notOpenedFlags(input: TrackerInput): Flag[] {
  if (!input.session || input.nowMs === undefined) return []
  const read = new Set<string>()
  for (const e of input.session)
    if (e.kind === 'inject.receipt' && e.receipt === 'read' && e.rowId) read.add(e.rowId)
  const out: Flag[] = []
  const seen = new Set<string>()
  for (const e of input.session) {
    if (e.kind !== 'inject.release' || !e.rowId || read.has(e.rowId) || seen.has(e.rowId)) continue
    seen.add(e.rowId)
    if (input.nowMs - e.at < NOT_OPENED_AFTER_MIN * 60_000) continue
    const since = deliveredAt(input, e.rowId) ?? input.minutes
    const text = `${e.rowId} was sent to devices and nobody has opened it`
    out.push({ id: `T2:${e.rowId}`, rule: 'T2', level: 'warn', rowId: e.rowId, since, text })
  }
  return out
}

/** T3 (due and open) and T4 (open with no due time for a while). */
function commitmentFlags(input: TrackerInput): Flag[] {
  const out: Flag[] = []
  for (const c of input.state.tracker?.commitments ?? []) {
    if (c.status !== 'open') continue
    const who = c.owner ? `${c.owner}: ` : ''
    if (c.dueAtMin !== undefined && c.dueAtMin <= input.minutes) {
      const text = `Commitment ${who}"${c.text}" was due at ${fmtMin(c.dueAtMin)}`
      out.push({
        id: `T3:${c.id}`,
        rule: 'T3',
        level: 'warn',
        commitmentId: c.id,
        since: c.dueAtMin,
        text,
      })
    } else if (c.dueAtMin === undefined && input.minutes - c.madeAtMin > NO_DUE_TIME_AFTER_MIN) {
      const text = `Commitment ${who}"${c.text}" has no time and is still open`
      out.push({
        id: `T4:${c.id}`,
        rule: 'T4',
        level: 'info',
        commitmentId: c.id,
        since: c.madeAtMin,
        text,
      })
    }
  }
  return out
}

/** Every open flag at this moment, warnings first, oldest first; dismissed ones left out. */
export function evaluate(input: TrackerInput): Flag[] {
  const dismissed = input.state.tracker?.dismissed ?? {}
  return [...rowFlags(input), ...notOpenedFlags(input), ...commitmentFlags(input)]
    .filter((f) => !dismissed[f.id])
    .sort((a, b) => (a.level === b.level ? a.since - b.since : a.level === 'warn' ? -1 : 1))
}

// --- State changes (each returns a new state) -------------------------------------------------

const emptyTracker = (): TrackerState => ({
  responses: {},
  commitments: [],
  suggestions: [],
  dismissed: {},
  scanned: {},
})
const trackerOf = (s: { tracker?: TrackerState | undefined }): TrackerState =>
  s.tracker ?? emptyTracker()
type WithTracker = Pick<FacilitatorState, 'tracker'>

function withTracker<S extends WithTracker>(s: S, change: (t: TrackerState) => TrackerState): S {
  return { ...s, tracker: change(trackerOf(s)) }
}

export function markAnswered<S extends WithTracker>(
  s: S,
  rowId: string,
  at: { iso: string; exerciseMin: number },
  detail: {
    by?: string
    note?: string
    source?: 'manual' | 'message' | 'vote' | 'note'
    ref?: string
  } = {},
): S {
  return withTracker(s, (t) => ({
    ...t,
    responses: {
      ...t.responses,
      [rowId]: {
        at: at.iso,
        exerciseMin: at.exerciseMin,
        note: detail.note ?? '',
        source: detail.source ?? 'manual',
        ...(detail.by ? { by: detail.by } : {}),
        ...(detail.ref ? { ref: detail.ref } : {}),
      },
    },
  }))
}

export function clearAnswer<S extends WithTracker>(s: S, rowId: string): S {
  return withTracker(s, (t) => {
    const { [rowId]: _drop, ...responses } = t.responses
    return { ...t, responses }
  })
}

export function dismissFlag<S extends WithTracker>(s: S, id: string, iso: string, reason = ''): S {
  return withTracker(s, (t) => ({ ...t, dismissed: { ...t.dismissed, [id]: { at: iso, reason } } }))
}

export function addCommitment<S extends WithTracker>(s: S, c: Commitment): S {
  return withTracker(s, (t) => ({ ...t, commitments: [...t.commitments, c].slice(-500) }))
}

export function closeCommitment<S extends WithTracker>(
  s: S,
  id: string,
  status: 'kept' | 'missed' | 'dropped',
  minutes: number,
): S {
  return withTracker(s, (t) => ({
    ...t,
    commitments: t.commitments.map((c) =>
      c.id === id ? { ...c, status, closedAtMin: minutes } : c,
    ),
  }))
}

/** New suggestions only: ones already suggested, accepted or dismissed are skipped. */
export function addSuggestions<S extends WithTracker>(s: S, found: CommitmentSuggestion[]): S {
  return withTracker(s, (t) => {
    const known = new Set([
      ...t.suggestions.map((x) => x.id),
      ...t.commitments.map((x) => x.sourceRef ?? x.id),
      ...Object.keys(t.dismissed),
    ])
    const fresh = found.filter((x) => !known.has(x.id) && !known.has(`S:${x.id}`))
    return { ...t, suggestions: [...t.suggestions, ...fresh].slice(-200) }
  })
}

export function dismissSuggestion<S extends WithTracker>(s: S, id: string, iso: string): S {
  return withTracker(s, (t) => ({
    ...t,
    suggestions: t.suggestions.filter((x) => x.id !== id),
    dismissed: { ...t.dismissed, [`S:${id}`]: { at: iso, reason: '' } },
  }))
}

/** Accept a suggestion as an open commitment owned by `owner`. */
export function acceptSuggestion<S extends WithTracker>(
  s: S,
  id: string,
  madeAtMin: number,
  owner = '',
): S {
  const sug = trackerOf(s).suggestions.find((x) => x.id === id)
  if (!sug) return s
  const commitment: Commitment = {
    id: `p-${sug.id}`,
    text: sug.text,
    owner,
    madeAtMin,
    source: sug.source,
    status: 'open',
    ...(sug.dueAtMin !== undefined ? { dueAtMin: sug.dueAtMin } : {}),
    ...(sug.rowId ? { rowId: sug.rowId } : {}),
    sourceRef: sug.id,
  }
  const accepted = addCommitment(s, commitment)
  return withTracker(accepted, (t) => ({
    ...t,
    suggestions: t.suggestions.filter((x) => x.id !== id),
  }))
}

// --- Report for the AAR (FR-18) ---------------------------------------------------------------

export interface TrackerReport {
  responses: {
    cite: string
    rowId: string
    responseMin: number
    note: string
    source: string
  }[]
  unanswered: string[]
  commitments: {
    cite: string
    text: string
    owner: string
    status: Commitment['status']
    dueAtMin?: number
  }[]
}

/** Per-row response times and commitment outcomes, with cite keys `R<n>` and `P<n>`. */
export function trackerReport(input: TrackerInput): TrackerReport {
  const t = trackerOf(input.state)
  const responses = input.msel
    .filter((r) => t.responses[r.id] && deliveredAt(input, r.id) !== undefined)
    .map((r, i) => {
      const resp = t.responses[r.id]!
      return {
        cite: `R${i + 1}`,
        rowId: r.id,
        responseMin: Math.max(0, Math.round(resp.exerciseMin - deliveredAt(input, r.id)!)),
        note: resp.note,
        source: resp.source,
      }
    })
  const unanswered = input.msel
    .filter(
      (r) => deliveredAt(input, r.id) !== undefined && expectsResponse(r) && !t.responses[r.id],
    )
    .map((r) => r.id)
  const commitments = t.commitments.map((c, i) => ({
    cite: `P${i + 1}`,
    text: c.text,
    owner: c.owner,
    status: c.status,
    ...(c.dueAtMin !== undefined ? { dueAtMin: c.dueAtMin } : {}),
  }))
  return { responses, unanswered, commitments }
}
