// Writes the "For other platforms" targets under <export folder>/platforms/ (so the distribution
// ZIP puts them in facilitator/platforms/ and never in players/). They copy the media files the
// media target wrote into the export folder.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ensureDir, writeFileAtomic } from '../../lib/fs'
import type { ExportedFile } from '../media'
import type { ExportModel } from '../model'
import type { DocumentFileNames } from '../naming'
import { capFiles } from './cap-xml'
import { conducttrCsv, conducttrMediaCsv } from './conducttr'
import {
  eocCsv,
  eocReadme,
  eocRows,
  eocWorkbook,
  injectTextName,
  packageMediaNames,
} from './eoc-package'
import { platformRows } from './rows'

export interface PlatformContext {
  model: ExportModel
  names: DocumentFileNames
  /** The export folder. */
  folder: string
  /** Files the media target wrote (paths relative to the folder, media/…). */
  media: ExportedFile[]
  /** Records a written file (absolute path). */
  written: (absPath: string) => void
  warnings: string[]
}

export const PLATFORMS_DIR = 'platforms'

async function put(ctx: PlatformContext, dir: string, name: string, data: string | Uint8Array) {
  await ensureDir(dir)
  const path = join(dir, name)
  await writeFileAtomic(path, data)
  ctx.written(path)
}

async function copyMedia(
  ctx: PlatformContext,
  dir: string,
  nameOf: (f: ExportedFile) => string | undefined,
): Promise<void> {
  for (const f of ctx.media) {
    const name = nameOf(f)
    if (!name) continue
    await put(ctx, dir, name, await fs.readFile(join(ctx.folder, f.file)))
  }
}

/** Conducttr: <Title>-S<n>-conducttr-mel.csv, conducttr-media.csv and conducttr-media/. */
export async function writeConducttr(ctx: PlatformContext): Promise<void> {
  const dir = join(ctx.folder, PLATFORMS_DIR)
  await put(ctx, dir, ctx.names.conducttrCsv, conducttrCsv(ctx.model))
  const wanted = ctx.media.filter((f) => f.kind !== 'poster' && f.kind !== 'mp3')
  await put(ctx, dir, ctx.names.conducttrMediaCsv, conducttrMediaCsv(wanted, 'conducttr-media'))
  await copyMedia(ctx, join(dir, 'conducttr-media'), (f) =>
    wanted.includes(f) ? f.file.replace(/^media\//, '') : undefined,
  )
}

/** WebEOC / SimulationDeck package folder (unverified). */
export async function writeEocPackage(ctx: PlatformContext): Promise<void> {
  const dir = join(ctx.folder, PLATFORMS_DIR, ctx.names.eocFolder)
  const mediaNames = packageMediaNames(ctx.media)
  const rows = eocRows(ctx.model, ctx.media, mediaNames)
  await put(ctx, dir, 'msel.xlsx', await eocWorkbook(ctx.model, rows))
  await put(ctx, dir, 'msel.csv', eocCsv(rows))
  await put(ctx, dir, 'README.txt', eocReadme(ctx.model))
  for (const r of platformRows(ctx.model))
    await put(ctx, join(dir, 'injects'), injectTextName(r), `${r.text}\n`)
  await copyMedia(ctx, join(dir, 'media'), (f) => mediaNames.get(f.file))
}

const NO_CAP = 'No CAP alert injects in this scenario, so no CAP XML was written.'

/** cap/<row id>.xml for every CAP alert inject. */
export async function writeCapXml(ctx: PlatformContext): Promise<void> {
  const { files, warnings } = capFiles(ctx.model)
  ctx.warnings.push(...warnings)
  if (!files.length) {
    if (!warnings.length) ctx.warnings.push(NO_CAP)
    return
  }
  const dir = join(ctx.folder, PLATFORMS_DIR, 'cap')
  for (const f of files) await put(ctx, dir, f.name, f.xml)
}
