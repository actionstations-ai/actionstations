// Distribution ZIP: facilitator/ gets everything in the export folder; players/ gets only the
// Player Briefing Packet and the blank ICS forms. The players/ list is checked against an
// allow-list before anything is written, so the MSEL, deck or handbook can never leak to it.
import { ZipArchive } from 'archiver'
import { createWriteStream, promises as fs } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { AppError } from '../lib/errors'
import type { DocumentFileNames } from './naming'

export interface ZipEntry {
  /** Absolute source file. */
  source: string
  /** Path inside the ZIP (POSIX). */
  name: string
}

/** File names allowed in players/: the briefing packet and the blank forms, nothing else. */
export function playerFileNames(names: DocumentFileNames): string[] {
  return [names.briefing, names.ics201, names.ics203]
}

/** Throw if anything but the allowed player files would land in players/. */
export function assertPlayersOnly(entries: ZipEntry[], names: DocumentFileNames): void {
  const allowed = new Set(playerFileNames(names).map((n) => `players/${n}`))
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

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(abs)))
    else if (entry.isFile()) out.push(abs)
  }
  return out.sort()
}

const posix = (p: string): string => p.split(sep).join('/')

/** Entries for the distribution ZIP from a finished export folder. */
export async function distributionEntries(
  folder: string,
  names: DocumentFileNames,
): Promise<ZipEntry[]> {
  const facilitator = (await listFiles(folder)).map((source) => ({
    source,
    name: `facilitator/${posix(relative(folder, source))}`,
  }))
  const byName = new Map(facilitator.map((e) => [basename(e.source), e.source]))
  const players: ZipEntry[] = []
  for (const name of playerFileNames(names)) {
    const source = byName.get(name)
    if (!source) throw new AppError('INTERNAL', `Player file missing from the export: ${name}`)
    players.push({ source, name: `players/${name}` })
  }
  const entries = [...facilitator, ...players]
  assertPlayersOnly(entries, names)
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
