/**
 * Exporting a session log as JSON or CSV (spec 0417 FR-5). Display names are written only when
 * the session was `named` and the facilitator ticked "Include display names"; client references
 * are never written to the CSV. The file is written to a path the facilitator chose.
 */
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { LiveSession, SessionLogEntry } from '@shared/schemas/live'
import { writeFileAtomic } from '../lib/fs'
import { toCsv } from '../export/csv'
import { summarize, type RoleName } from './log-summary'

export const EXPORT_FORMAT = 'actionstations/live-session'

export interface ExportOptions {
  includeNames: boolean
  session?: Pick<LiveSession, 'id' | 'name' | 'startedAt' | 'endedAt' | 'attribution'>
  roleName?: RoleName
}

const CSV_HEADER = [
  'index',
  'at',
  'exercise_time',
  'kind',
  'actor_kind',
  'role',
  'team',
  'evaluator',
  'display_name',
  'ref_row',
  'ref_id',
  'summary',
  'data_json',
]

/** Names are included only for a named session when the caller asked for them. */
const namesAllowed = (o: ExportOptions): boolean =>
  o.includeNames && o.session?.attribution === 'named'

function withoutNames(e: SessionLogEntry): SessionLogEntry {
  const { displayName: _dropped, ...actor } = e.actor
  return { ...e, actor }
}

export function exportJsonText(entries: readonly SessionLogEntry[], o: ExportOptions): string {
  const rows = namesAllowed(o) ? entries : entries.map(withoutNames)
  return JSON.stringify(
    { format: EXPORT_FORMAT, formatVersion: 1, session: o.session ?? null, entries: rows },
    null,
    2,
  )
}

function refId(e: SessionLogEntry): string {
  const r = e.ref ?? {}
  return r.releaseId ?? r.messageId ?? r.voteId ?? r.itemId ?? r.observationId ?? r.surveyId ?? ''
}

export function exportCsvText(entries: readonly SessionLogEntry[], o: ExportOptions): string {
  const names = namesAllowed(o)
  const roleName = o.roleName ?? (() => undefined)
  return toCsv(
    CSV_HEADER,
    entries.map((e) => [
      e.i,
      e.at,
      e.ex ?? '',
      e.kind,
      e.actor.kind,
      e.actor.seat?.roleId ?? '',
      e.actor.seat?.teamId ?? '',
      e.actor.evaluator ?? '',
      names ? (e.actor.displayName ?? '') : '',
      e.ref?.rowId ?? '',
      refId(e),
      summarize(names ? e : withoutNames(e), roleName),
      JSON.stringify(e.data),
    ]),
  )
}

export async function writeExport(
  outPath: string,
  format: 'json' | 'csv',
  entries: readonly SessionLogEntry[],
  o: ExportOptions,
): Promise<number> {
  const text = format === 'json' ? exportJsonText(entries, o) : exportCsvText(entries, o)
  await fs.mkdir(dirname(outPath), { recursive: true })
  await writeFileAtomic(outPath, text)
  return entries.length
}
