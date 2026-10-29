// Conducttr "Import MEL" CSV (spec 0432 FR-10): the columns of Conducttr's core MEL import
// template, in order. The column list comes from Conducttr's public help page (Import Master
// Events List from Excel file, read 2026-10-28): verified against documentation, not against a
// live import. Media Conducttr must host is listed in a companion CSV.
import { conducttrMethod } from './channels'
import { csvText } from './csv'
import { clockTime, platformRows, type PlatformRow } from './rows'
import type { ExportModel } from '../model'
import type { ExportedFile } from '../media'
import { PURPOSE_TAG_INFO } from '@shared/taxonomy'

export const CONDUCTTR_COLUMNS = [
  'Day',
  'Serial',
  'Number',
  'Time',
  'From',
  'Faction',
  'To',
  'To type',
  'Team',
  'Method',
  'Subject',
  'Message',
  'Timestamp',
  'Expected Action',
  'Expected Action Title',
  'Expected Action ImageURL',
] as const

function expectedTitle(model: ExportModel, r: PlatformRow): string {
  const tag = PURPOSE_TAG_INFO[r.row.purposeTag]?.label ?? r.row.purposeTag
  const objectives = (model.scenario.rubric?.metrics ?? [])
    .filter((m) => m.linkedInjectIds.includes(r.row.id))
    .flatMap((m) => m.objectiveRefs)
  return [tag, ...new Set(objectives)].join('; ')
}

/** One CSV row per recipient; a row to everyone is a single row addressed to "All". */
function conducttrRows(model: ExportModel, r: PlatformRow): string[][] {
  const targets = r.recipients.length ? r.recipients : ['All']
  return targets.map((to) => [
    model.scenario.title,
    r.phase,
    r.row.id,
    clockTime(r.row.time),
    r.row.from,
    '',
    to,
    r.recipients.length ? 'Position' : '',
    '',
    conducttrMethod(r.type),
    r.inject?.title ?? r.row.event.slice(0, 80),
    r.text,
    '',
    r.row.expectedAction,
    r.row.expectedAction.trim() ? expectedTitle(model, r) : '',
    '',
  ])
}

export function conducttrCsv(model: ExportModel): string {
  return csvText(
    CONDUCTTR_COLUMNS,
    platformRows(model).flatMap((r) => conducttrRows(model, r)),
  )
}

/** conducttr-media.csv: which file belongs to which row, for the controller to upload. */
export function conducttrMediaCsv(files: readonly ExportedFile[], mediaDir: string): string {
  const rows = files
    .filter((f) => f.kind !== 'poster' && f.kind !== 'mp3')
    .map((f) => [f.rowId, `${mediaDir}/${f.file.replace(/^media\//, '')}`])
  return csvText(['Number', 'file'], rows)
}
