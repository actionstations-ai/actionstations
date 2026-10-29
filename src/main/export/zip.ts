// Distribution ZIP: facilitator/ gets every file this export run wrote (never leftovers from
// an earlier export into the same folder, #213); players/ gets only the Player Briefing
// Packet, the blank ICS forms, the Player Handouts (when the scenario has any; Controller
// Materials stay in facilitator/), the participant survey forms this run printed (never
// debrief forms or survey results, #422), the Exercise Plan and, when the designer asked for
// it, the SitMan player edition (#420). Player injects, large-print variants and the Spanish
// set (players/es/) join when the export asked for them (spec 0435). The players/ list is checked against an allow-list
// before anything is written, so the MSEL, deck, handbooks or facilitator SitMan can never
// leak to it.
import { ZipArchive } from 'archiver'
import { createWriteStream, promises as fs } from 'node:fs'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { AppError } from '../lib/errors'
import type { DocumentFileNames } from './naming'

export interface ZipEntry {
  /** Absolute source file. */
  source: string
  /** Path inside the ZIP (POSIX). */
  name: string
}

/** File names allowed in players/: the briefing packet, the blank forms, the player
 *  handouts, the ExPlan, the SitMan player edition and the participant survey forms named by
 *  the caller, nothing else. */
export function playerFileNames(
  names: DocumentFileNames,
  surveyForms: string[] = [],
  variants: PlayerVariants = {},
): string[] {
  const refused = new Set<string>([names.surveyResults])
  const english = variants.english !== false
  return [
    ...(english ? [names.briefing] : []),
    names.ics201,
    names.ics203,
    ...(english ? [names.handouts] : []),
    names.explan,
    names.sitmanPlayer,
    ...(variants.extra ?? []),
    ...surveyForms.filter((f) => !refused.has(f)),
  ]
}

/**
 * Player material in other languages and print sizes (spec 0435). `english: false` keeps the
 * English briefing and handouts out of players/ (the Spanish-only choice); `extra` are further
 * English files this run wrote (player injects, large print); `es` are the Spanish files, which
 * go to players/es/.
 */
export interface PlayerVariants {
  english?: boolean
  extra?: string[]
  es?: string[]
}

/** Player files an export may not have (no handouts, no player SitMan asked for): skipped. */
const optionalPlayerFiles = (names: DocumentFileNames, variants: PlayerVariants): Set<string> =>
  new Set([names.handouts, names.sitmanPlayer, ...(variants.extra ?? [])])

/** Throw if anything but the allowed player files would land in players/. */
export function assertPlayersOnly(
  entries: ZipEntry[],
  names: DocumentFileNames,
  surveyForms: string[] = [],
  variants: PlayerVariants = {},
): void {
  const allowed = new Set([
    ...playerFileNames(names, surveyForms, variants).map((n) => `players/${n}`),
    ...(variants.es ?? []).map((n) => `players/es/${n}`),
  ])
  const leaked = entries
    .filter((e) => e.name.startsWith('players/'))
    .filter((e) => !allowed.has(e.name))
  if (leaked.length) {
    throw new AppError(
      'INTERNAL',
      `Refusing to put facilitator material in players/: ${leaked.map((e) => e.name).join(', ')}`,
    )
  }
}

const posix = (p: string): string => p.split(sep).join('/')

function insideFolder(folder: string, abs: string): boolean {
  const rel = relative(resolve(folder), resolve(abs))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Entries for the distribution ZIP from the files this run wrote (absolute paths). Anything
 * outside the export folder (the ZIP itself, for one) is left out. `surveyForms`: file names of
 * the participant survey forms this run wrote (debrief forms are never passed).
 */
export function distributionEntries(
  folder: string,
  names: DocumentFileNames,
  runFiles: string[],
  surveyForms: string[] = [],
  variants: PlayerVariants = {},
): ZipEntry[] {
  const sources = [...new Set(runFiles.filter((f) => insideFolder(folder, f)))].sort()
  const facilitator = sources.map((source) => ({
    source,
    name: `facilitator/${posix(relative(folder, source))}`,
  }))
  const byName = new Map(facilitator.map((e) => [basename(e.source), e.source]))
  const players: ZipEntry[] = []
  for (const name of playerFileNames(names, surveyForms, variants)) {
    const source = byName.get(name)
    if (!source && optionalPlayerFiles(names, variants).has(name)) continue
    if (!source) throw new AppError('INTERNAL', `Player file missing from the export: ${name}`)
    players.push({ source, name: `players/${name}` })
  }
  for (const name of variants.es ?? []) {
    const source = byName.get(name)
    if (!source) throw new AppError('INTERNAL', `Player file missing from the export: ${name}`)
    players.push({ source, name: `players/es/${name}` })
  }
  const entries = [...facilitator, ...players]
  assertPlayersOnly(entries, names, surveyForms, variants)
  return entries
}

/** Write the ZIP to `zipPath` (atomically via a temp file). */
export async function writeZip(zipPath: string, entries: ZipEntry[]): Promise<number> {
  const tmp = `${zipPath}.${process.pid}.tmp`
  const archive = new ZipArchive({ zlib: { level: 9 } })
  const output = createWriteStream(tmp)
  const closed = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.on('warning', reject)
  })
  archive.pipe(output)
  for (const e of entries) archive.file(e.source, { name: e.name })
  await archive.finalize()
  await closed
  await fs.rename(tmp, zipPath)
  return archive.pointer()
}
