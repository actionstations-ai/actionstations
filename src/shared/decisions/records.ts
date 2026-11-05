/**
 * Reading decisions back (spec 0448 FR-14): the session log carries each decision as a
 * `decision.submitted` line, and a facilitator without devices keeps them in the facilitator
 * file. The metrics builder and the after-action report read both through these functions and
 * get the same typed record. Names never sit in a line's data, only in the actor, so a log
 * exported without names stays without them.
 */
import { z } from 'zod'
import {
  DecisionRecord,
  DecisionValue,
  RecordedArea,
  type DecisionSeat,
} from '../schemas/decisions'
import type { SessionLogEntry } from '../schemas/live'

export const DECISION_LOG_KIND = 'decision.submitted'

const LineData = z.object({
  decisionId: z.string(),
  formId: z.string(),
  kind: z.string(),
  title: z.string(),
  source: z.enum(['device', 'facilitator']),
  fields: z.record(z.string(), DecisionValue),
  area: RecordedArea.optional(),
  seatLabel: z.string().optional(),
  roleId: z.string().optional(),
})

/** The `data` of a decision's log line: the record without its seat and times. */
export function decisionLogData(record: DecisionRecord): Record<string, unknown> {
  return {
    decisionId: record.id,
    formId: record.formId,
    kind: record.kind,
    title: record.title,
    source: record.source,
    fields: record.fields,
    ...(record.area ? { area: record.area } : {}),
    ...(record.seat.label ? { seatLabel: record.seat.label } : {}),
    ...(record.seat.roleId ? { roleId: record.seat.roleId } : {}),
    // The shape the metrics builder reads. The seat never carries a name here.
    structured: {
      id: record.id,
      time: record.time,
      kind: record.kind,
      ...(record.area ? { area: record.area } : {}),
      fields: record.fields,
      seat: { ...record.seat, name: undefined },
    },
  }
}

function seatOf(entry: SessionLogEntry, data: z.infer<typeof LineData>): DecisionSeat {
  const seat = entry.actor.seat
  const base: DecisionSeat =
    data.source === 'device'
      ? { kind: 'player' }
      : { kind: 'facilitator', ...(data.roleId ? { roleId: data.roleId } : {}) }
  return {
    ...base,
    ...(seat?.roleId ? { roleId: seat.roleId } : {}),
    ...(seat?.teamId ? { teamId: seat.teamId } : {}),
    ...(data.seatLabel ? { label: data.seatLabel } : {}),
    ...(entry.actor.displayName ? { name: entry.actor.displayName } : {}),
  }
}

/** The record of one log line, or undefined when it is not a well-formed decision line. */
export function decisionRecordOf(entry: SessionLogEntry): DecisionRecord | undefined {
  if (entry.kind !== DECISION_LOG_KIND) return undefined
  const data = LineData.safeParse(entry.data)
  if (!data.success) return undefined
  const d = data.data
  const record = DecisionRecord.safeParse({
    id: d.decisionId,
    time: entry.at,
    ...(entry.ex ? { exerciseTime: entry.ex } : {}),
    kind: d.kind,
    formId: d.formId,
    title: d.title,
    ...(d.area ? { area: d.area } : {}),
    fields: d.fields,
    seat: seatOf(entry, d),
    source: d.source,
  })
  return record.success ? record.data : undefined
}

/** Every decision in a session log, oldest first. */
export function decisionRecordsFromLog(entries: Iterable<SessionLogEntry>): DecisionRecord[] {
  const out: DecisionRecord[] = []
  for (const e of entries) {
    const r = decisionRecordOf(e)
    if (r) out.push(r)
  }
  return out
}

/**
 * Decisions from several places (the session log, the facilitator file) as one list: a decision
 * with the same id appears once, the first list winning, oldest first.
 */
export function mergeDecisionRecords(
  ...lists: readonly (readonly DecisionRecord[])[]
): DecisionRecord[] {
  const byId = new Map<string, DecisionRecord>()
  for (const list of lists) for (const r of list) if (!byId.has(r.id)) byId.set(r.id, r)
  return [...byId.values()].sort((a, b) => a.time.localeCompare(b.time))
}
