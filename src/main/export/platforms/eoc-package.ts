// WebEOC / SimulationDeck hand-off package (spec 0432 FR-11). Neither platform publishes a file
// import format, so this is a mapped MSEL (XLSX and CSV in the HSEEP column layout plus a media
// file and a channel column), one text file per inject, the media named by row id and a README
// that says how to load them. It is marked unverified in the app and in the README.
import { MSEL_COLUMNS, mselRowValues, tableWorkbook, type ColumnSpec } from '../xlsx'
import type { ExportedFile } from '../media'
import type { ExportModel } from '../model'
import { simulationDeckChannel } from './channels'
import { csvText } from './csv'
import { platformRows, type PlatformRow } from './rows'

export const EOC_COLUMNS = [
  { key: 'time', header: 'Time', width: 10 },
  { key: 'id', header: 'Inject #', width: 10 },
  { key: 'from', header: 'From', width: 18 },
  { key: 'to', header: 'To', width: 18 },
  { key: 'method', header: 'Method', width: 16 },
  { key: 'event', header: 'Inject', width: 60, wrap: true },
  { key: 'expected', header: 'Expected action', width: 48, wrap: true },
  { key: 'objective', header: 'Objective / capability', width: 36, wrap: true },
  { key: 'notes', header: 'Notes', width: 30, wrap: true },
  { key: 'mediaFile', header: 'Media file', width: 30 },
  { key: 'channel', header: 'Channel', width: 18 },
] as const satisfies readonly ColumnSpec[]

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'inject'
const safe = (s: string): string => s.replace(/[^A-Za-z0-9._-]+/g, '_') || 'row'

/** Name inside the package's media/ folder: <row id>-<kind>[-n].<ext>. */
export function packageMediaNames(files: readonly ExportedFile[]): Map<string, string> {
  const used = new Map<string, number>()
  const out = new Map<string, string>()
  for (const f of files) {
    if (f.kind === 'poster' || f.kind === 'mp3') continue
    const ext = f.file.slice(f.file.lastIndexOf('.'))
    const stem = `${safe(f.rowId)}-${f.kind}`
    const n = (used.get(stem) ?? 0) + 1
    used.set(stem, n)
    out.set(f.file, `${stem}${n > 1 ? `-${n}` : ''}${ext}`)
  }
  return out
}

/** Name of the inject's text file: injects/<row id>-<slug>.txt */
export const injectTextName = (r: PlatformRow): string =>
  `${safe(r.row.id)}-${slug(r.inject?.title ?? r.row.event)}.txt`

function mediaFor(
  r: PlatformRow,
  files: readonly ExportedFile[],
  names: Map<string, string>,
): string {
  return files
    .filter((f) => f.rowId === r.row.id && names.has(f.file))
    .map((f) => `media/${names.get(f.file)}`)
    .join('; ')
}

export function eocRows(
  model: ExportModel,
  files: readonly ExportedFile[],
  names: Map<string, string>,
): string[][] {
  return platformRows(model).map((r) => {
    const values = mselRowValues(model, r.row, r.phase)
    const v = (key: (typeof MSEL_COLUMNS)[number]['key']): string =>
      values[MSEL_COLUMNS.findIndex((c) => c.key === key)] ?? ''
    return [
      v('time'),
      v('id'),
      v('from'),
      v('to'),
      v('method'),
      v('event'),
      v('expected'),
      [v('objectives'), v('capabilities')].filter(Boolean).join(' / '),
      v('controllerNotes'),
      mediaFor(r, files, names),
      simulationDeckChannel(r.type),
    ]
  })
}

export const eocCsv = (rows: string[][]): string =>
  csvText(
    EOC_COLUMNS.map((c) => c.header),
    rows,
  )

export function eocWorkbook(model: ExportModel, rows: string[][]): Promise<Buffer> {
  return tableWorkbook([{ name: 'MSEL', columns: EOC_COLUMNS, rows }], {
    creator: model.project.orgName || 'Action Stations',
    created: new Date(model.generatedAt),
  })
}

export function eocReadme(model: ExportModel): string {
  return [
    `${model.scenario.title} - hand-off package for WebEOC / SimulationDeck`,
    '',
    'STATUS: UNVERIFIED. Juvare publishes no file import format for the WebEOC Simulator or for',
    'SimulationDeck, so this package has not been loaded into either. It is a plain MSEL you can',
    'map to the fields of the board your administrator set up.',
    '',
    'Files',
    '  msel.xlsx, msel.csv   The MSEL, one row per inject: time, inject #, from, to, method, inject,',
    '                        expected action, objective / capability, notes, media file, channel.',
    '                        The CSV is UTF-8 with a byte order mark and opens in Excel.',
    '  injects/              The text of each inject, one file per row, in reading order.',
    '  media/                Rendered images, PDFs, audio and video, named by row id.',
    '',
    'Loading it',
    '  - WebEOC Board Data Manager imports XLSX or CSV into boards an administrator has configured.',
    '    Ask the administrator which board and which columns to use.',
    '  - The Simulator and SimulationDeck load MSELs on request: Juvare staff load them for you.',
    '    If you receive a sample MSEL template from Juvare, send it to the Action Stations project',
    '    so a matching export can be added.',
    '  - The channel column groups injects by SimulationDeck channels (broadcast TV news, online',
    '    newspaper, social media, radio, blogs, video). Post them there by hand if you load nothing.',
    '',
    'Nothing in this package was sent anywhere. Every message in it is an exercise message.',
    '',
  ].join('\n')
}
