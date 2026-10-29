// Distribution ZIP: facilitator/ gets every file this export run wrote (never leftovers from
// an earlier export into the same folder, #213); players/ gets only the Player Briefing
// Packet, the blank ICS forms, the Player Handouts (when the scenario has any; Controller
// Materials stay in facilitator/) and the participant survey forms this run printed (never
// debrief forms or survey results, #422). The players/ list is checked against an
// allow-list before anything is written, so the MSEL, deck or handbook can never leak to it.
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
 *  handouts and the participant survey forms named by the caller, nothing else. */
export function playerFileNames(names: DocumentFileNames, surveyForms: string[] = []): string[] {
  const refused = new Set<string>([names.surveyResults])
  return [
    names.briefing,
    names.ics201,
    names.ics203,
    names.handouts,
    ...surveyForms.filter((f) => !refused.has(f)),
  ]
}

/** Player files a scenario may not have (no handouts written): skipped, not an error. */
const optionalPlayerFiles = (names: DocumentFileNames): Set<string> => new Set([names.handouts])

/** Throw if anything but the allowed player files would land in players/. */
export function assertPlayersOnly(
  entries: ZipEntry[],
  names: DocumentFileNames,
  surveyForms: string[] = [],
): void {
  const allowed = new Set(playerFileNames(names, surveyForms).map((n) => `players/${n}`))
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
): ZipEntry[] {
  const sources = [...new Set(runFiles.filter((f) => insideFolder(folder, f)))].sort()
  const facilitator = sources.map((source) => ({
    source,
    name: `facilitator/${posix(relative(folder, source))}`,
  }))
  const byName = new Map(facilitator.map((e) => [basename(e.source), e.source]))
  const players: ZipEntry[] = []
  for (const name of playerFileNames(names, surveyForms)) {
    const source = byName.get(name)
    if (!source && optionalPlayerFiles(names).has(name)) continue
    if (!source) throw new AppError('INTERNAL', `Player file missing from the export: ${name}`)
    players.push({ source, name: `players/${name}` })
  }
  const entries = [...facilitator, ...players]
  assertPlayersOnly(entries, names, surveyForms)
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
