// Case data on disk (spec 0448 FR-7, NFR-4, NFR-5): scenarios/<id>/case/manifest.json, the data
// files it names and fetch-log.jsonl. Every write goes through `writeCaseFile`, which accepts
// only a plain file name inside case/ with an allowed extension, and refuses a path that would
// leave the folder through a symlink.
import { promises as fs, realpathSync } from 'node:fs'
import { dirname, extname, relative, sep } from 'node:path'
import {
  CASE_FILE_EXTENSIONS,
  CaseFileName,
  CaseManifest,
  SeriesFile,
  TextFile,
  type CaseDataset,
} from '@shared/schemas/case-data'
import { AppError } from '../lib/errors'
import { ensureDir, readJson, safeJoin, writeFileAtomic, writeJsonAtomic } from '../lib/fs'
import { scenarioLayout, withScenarioLock } from '../scenario/layout'

export const caseDir = (root: string, scenarioId: string): string =>
  safeJoin(scenarioLayout(root, scenarioId).dir, 'case')

const manifestFile = (root: string, scenarioId: string): string =>
  safeJoin(caseDir(root, scenarioId), 'manifest.json')

export const fetchLogFile = (root: string, scenarioId: string): string =>
  safeJoin(caseDir(root, scenarioId), 'fetch-log.jsonl')

/** The scenario's case manifest, or undefined when it has no case data. */
export async function readManifest(
  root: string,
  scenarioId: string,
): Promise<CaseManifest | undefined> {
  try {
    return await readJson(manifestFile(root, scenarioId), CaseManifest)
  } catch (err) {
    if ((err as { code?: string }).code === 'NOT_FOUND') return undefined
    throw err
  }
}

export async function writeManifest(
  root: string,
  scenarioId: string,
  manifest: CaseManifest,
): Promise<void> {
  await ensureDir(caseDir(root, scenarioId))
  await writeJsonAtomic(manifestFile(root, scenarioId), CaseManifest.parse(manifest))
}

const PNG = [0x89, 0x50, 0x4e, 0x47]
const startsWith = (data: Uint8Array, magic: number[]): boolean =>
  magic.every((b, i) => data[i] === b)
const isWebp = (d: Uint8Array): boolean =>
  startsWith(d, [0x52, 0x49, 0x46, 0x46]) &&
  [0x57, 0x45, 0x42, 0x50].every((b, i) => d[8 + i] === b)

/** Throws unless the bytes are what the file name's extension says they are. */
export function assertFileType(name: string, data: Uint8Array | string): void {
  const ext = extname(name).slice(1).toLowerCase()
  if (!(CASE_FILE_EXTENSIONS as readonly string[]).includes(ext))
    throw new AppError('VALIDATION', `Case data may not contain .${ext || '(none)'} files`)
  if (ext === 'png' || ext === 'webp') {
    if (typeof data === 'string') throw new AppError('VALIDATION', `${name} is not an image`)
    const ok = ext === 'png' ? startsWith(data, PNG) : isWebp(data)
    if (!ok) throw new AppError('VALIDATION', `${name} is not a valid ${ext.toUpperCase()} image`)
  }
}

function assertInside(base: string, target: string, name: string): void {
  const rel = relative(realpathSync(base), realpathSync(target))
  if (rel === '..' || rel.startsWith(`..${sep}`))
    throw new AppError('PATH_ESCAPE', `Case file ${name} would leave the case folder`)
}

/** Write one data file inside case/ and return its size in bytes. */
export async function writeCaseFile(
  root: string,
  scenarioId: string,
  name: string,
  data: Uint8Array | string,
): Promise<number> {
  if (!CaseFileName.safeParse(name).success)
    throw new AppError('VALIDATION', `Invalid case file name: ${name}`)
  assertFileType(name, data)
  const base = caseDir(root, scenarioId)
  const target = safeJoin(base, name)
  await ensureDir(base)
  await ensureDir(dirname(target))
  assertInside(base, dirname(target), name)
  await writeFileAtomic(target, data)
  return typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength
}

/** Absolute path of a file the manifest names, refusing symlinks that leave case/. */
export function caseFilePath(root: string, scenarioId: string, name: string): string {
  if (!CaseFileName.safeParse(name).success)
    throw new AppError('VALIDATION', `Invalid case file name: ${name}`)
  const base = caseDir(root, scenarioId)
  const target = safeJoin(base, name)
  assertInside(base, target, name)
  return target
}

async function sizeOf(dir: string): Promise<number> {
  let total = 0
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = safeJoin(dir, entry.name)
    if (entry.isDirectory()) total += await sizeOf(full)
    else if (entry.isFile()) total += (await fs.stat(full)).size
  }
  return total
}

/** Bytes the scenario's case folder holds now. */
export const caseBytes = (root: string, scenarioId: string): Promise<number> =>
  sizeOf(caseDir(root, scenarioId))

export const MB = 1024 * 1024

/** Bytes still allowed under the limit (never negative). */
export async function roomLeft(
  root: string,
  scenarioId: string,
  maxMbPerScenario: number,
): Promise<number> {
  return Math.max(0, maxMbPerScenario * MB - (await caseBytes(root, scenarioId)))
}

/** One dataset's data, validated against its kind's file shape. */
export async function readDatasetFile(
  root: string,
  scenarioId: string,
  dataset: CaseDataset,
): Promise<unknown> {
  if (!dataset.file) return undefined
  const path = caseFilePath(root, scenarioId, dataset.file)
  if (dataset.kind === 'series') return readJson(path, SeriesFile)
  if (dataset.kind === 'text' || dataset.kind === 'reports') return readJson(path, TextFile)
  return JSON.parse(await fs.readFile(path, 'utf8')) as unknown
}

export interface NewCaseFile {
  name: string
  data: Uint8Array | string
}

/**
 * Add datasets and their files to the scenario. Files are written first, then the manifest, so a
 * failure part-way leaves files the manifest does not name rather than a manifest naming nothing.
 * A dataset with an id already in the manifest replaces it.
 */
export function addDatasets(
  root: string,
  scenarioId: string,
  datasets: CaseDataset[],
  files: NewCaseFile[],
): Promise<CaseManifest> {
  return withScenarioLock(root, scenarioId, async () => {
    for (const f of files) await writeCaseFile(root, scenarioId, f.name, f.data)
    const current = (await readManifest(root, scenarioId)) ?? CaseManifest.parse({})
    const ids = new Set(datasets.map((d) => d.id))
    const next: CaseManifest = {
      ...current,
      datasets: [...current.datasets.filter((d) => !ids.has(d.id)), ...datasets],
    }
    await writeManifest(root, scenarioId, next)
    return next
  })
}

export function removeDataset(
  root: string,
  scenarioId: string,
  datasetId: string,
): Promise<CaseManifest> {
  return withScenarioLock(root, scenarioId, async () => {
    const current = await readManifest(root, scenarioId)
    const gone = current?.datasets.find((d) => d.id === datasetId)
    if (!current || !gone) throw new AppError('NOT_FOUND', 'That dataset is not in this scenario')
    const names = [gone.file, ...(gone.frames ?? []).map((f) => f.file)].filter(
      (n): n is string => !!n,
    )
    for (const n of names) await fs.rm(caseFilePath(root, scenarioId, n), { force: true })
    const next = { ...current, datasets: current.datasets.filter((d) => d.id !== datasetId) }
    await writeManifest(root, scenarioId, next)
    return next
  })
}

export function saveTimeMapping(
  root: string,
  scenarioId: string,
  timeMapping: CaseManifest['timeMapping'],
): Promise<CaseManifest> {
  return withScenarioLock(root, scenarioId, async () => {
    const current = (await readManifest(root, scenarioId)) ?? CaseManifest.parse({})
    const next: CaseManifest = { ...current }
    if (timeMapping) next.timeMapping = timeMapping
    else delete next.timeMapping
    await writeManifest(root, scenarioId, next)
    return next
  })
}
