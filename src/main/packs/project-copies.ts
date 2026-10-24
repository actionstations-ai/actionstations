// Copy-on-use for pack items (ADR-0018 § Uninstall). The template, workflow, document and
// example layers call copyPackItem the first time a project uses a pack item; the copy lives in
// the project's own layer and is recorded in <project>/packs.json with a sha256 per file.
// copyState compares a record with the files on disk and the installed pack, for the
// "edited" / "not installed" / "Update available" badges (#269). Updating a copy is always
// an explicit action: copyPackItem refuses to replace an edited copy unless `replaceEdited`.
//
// packs.json comes with a shared project, so its record paths are not trusted (#302): each one
// must sit in its kind's own folder (copyPath), and no folder on the way to it, nor the file
// itself, may be a symlink before it is read, written or removed.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  PROJECT_PACKS_FILE,
  ProjectPacks,
  type CopiedPackKind,
  type PackCopyState,
  type ProjectPackCopy,
} from '@shared/schemas/project-packs'
import { compareSemver } from '@shared/schemas/pack'
import { AppError } from '../lib/errors'
import { ensureDir, readJsonOr, safeJoin, writeFileAtomic, writeJsonAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'

const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

const SEGMENT = /^(?!\.\.?$)[^/\\\0:]+$/
const segments = (rel: string): string[] | undefined => {
  const parts = rel.split('/')
  return parts.every((s) => SEGMENT.test(s)) ? parts : undefined
}

/** Whether a record path of `kind` + `id` sits in that kind's folder of the project. */
export function isCopyPathAllowed(kind: CopiedPackKind, id: string, rel: string): boolean {
  const parts = segments(rel)
  if (!parts) return false
  switch (kind) {
    case 'templates': // templates/injects/<type>/<file or sub/file>
      return (
        parts.length >= 4 && parts[0] === 'templates' && parts[1] === 'injects' && parts[2] === id
      )
    case 'workflows': // comfy/workflows/<id>.json | <id>.bindings.json
      return (
        parts.length === 3 &&
        parts[0] === 'comfy' &&
        parts[1] === 'workflows' &&
        (parts[2] === `${id}.json` || parts[2] === `${id}.bindings.json`)
      )
    case 'documents': // documents/<docId>/<file>
      return parts.length === 3 && parts[0] === 'documents'
    default: // domains and examples are not copied into a project yet
      return false
  }
}

/** Refuse when any existing component of `rel` under the project (or the file) is a symlink. */
async function assertNoLinks(projectRoot: string, rel: string): Promise<void> {
  let at = projectRoot
  for (const part of rel.split('/')) {
    at = join(at, part)
    const st = await fs.lstat(at).catch(() => null)
    if (!st) return // the rest does not exist yet
    if (st.isSymbolicLink())
      throw new AppError('PATH_ESCAPE', `packs.json path "${rel}" goes through a symlink`)
  }
}

/**
 * Absolute path of a packs.json record path, checked: inside the kind's folder (PATH_ESCAPE
 * otherwise) and with no symlink on the way. Call it right before each read, write or delete.
 */
export async function copyPath(
  projectRoot: string,
  kind: CopiedPackKind,
  id: string,
  rel: string,
): Promise<string> {
  if (!isCopyPathAllowed(kind, id, rel))
    throw new AppError('PATH_ESCAPE', `packs.json path "${rel}" is not a ${kind} path of "${id}"`)
  const abs = safeJoin(projectRoot, rel)
  await assertNoLinks(projectRoot, rel)
  return abs
}

/** A source file to copy: a regular file, not a link. */
async function readSource(path: string): Promise<Buffer> {
  const st = await fs.lstat(path)
  if (!st.isFile()) throw new AppError('PATH_ESCAPE', `Not a regular file: ${path}`)
  return fs.readFile(path)
}

export async function readProjectPacks(projectRoot: string): Promise<ProjectPacks> {
  return readJsonOr(safeJoin(projectRoot, PROJECT_PACKS_FILE), ProjectPacks, () => ({
    copies: [],
  }))
}

export async function findCopy(
  projectRoot: string,
  kind: CopiedPackKind,
  id: string,
): Promise<ProjectPackCopy | undefined> {
  const { copies } = await readProjectPacks(projectRoot)
  return copies.find((c) => c.kind === kind && c.id === id)
}

/** Whether any recorded file is missing or differs from its recorded sha256. */
export async function isCopyEdited(projectRoot: string, copy: ProjectPackCopy): Promise<boolean> {
  for (const f of copy.files) {
    try {
      const abs = await copyPath(projectRoot, copy.kind, copy.id, f.path)
      if (sha256(await readSource(abs)) !== f.sha256) return true
    } catch {
      return true
    }
  }
  return false
}

export interface PackItemSource {
  pack: { id: string; version: string; name?: string }
  kind: CopiedPackKind
  id: string
  /** Absolute source file (inside the installed pack) → project-relative destination. */
  files: readonly { from: string; to: string }[]
}

/**
 * Copy a pack item's files into the project and record it in packs.json, replacing an
 * earlier record of the same kind + id. Files of the earlier copy that the new one does not
 * have are removed. Refuses (CONFLICT) to replace an edited copy unless `replaceEdited`.
 */
export async function copyPackItem(
  projectRoot: string,
  src: PackItemSource,
  opts: { replaceEdited?: boolean } = {},
): Promise<ProjectPackCopy> {
  const doc = await readProjectPacks(projectRoot)
  const previous = doc.copies.find((c) => c.kind === src.kind && c.id === src.id)
  if (previous && !opts.replaceEdited && (await isCopyEdited(projectRoot, previous)))
    throw new AppError(
      'CONFLICT',
      `The project's copy of ${src.kind} "${src.id}" was edited; replacing it would discard those edits`,
    )
  const files: ProjectPackCopy['files'] = []
  for (const f of src.files) {
    const bytes = await readSource(f.from)
    const dest = await copyPath(projectRoot, src.kind, src.id, f.to)
    await ensureDir(dirname(dest))
    await assertNoLinks(projectRoot, f.to) // a link swapped in while the folders were made
    await writeFileAtomic(dest, bytes)
    files.push({ path: f.to, sha256: sha256(bytes) })
  }
  const kept = new Set(files.map((f) => f.path))
  for (const old of previous?.files ?? []) {
    if (kept.has(old.path)) continue
    // A record path outside the kind's folder or through a link is left alone, never removed.
    const abs = await copyPath(projectRoot, previous!.kind, previous!.id, old.path).catch(
      () => undefined,
    )
    if (abs) await fs.rm(abs, { force: true })
  }
  const copy: ProjectPackCopy = {
    kind: src.kind,
    id: src.id,
    packId: src.pack.id,
    version: src.pack.version,
    ...(src.pack.name ? { packName: src.pack.name } : {}),
    copiedAt: nowIso(),
    files,
  }
  const copies = doc.copies.filter((c) => c !== previous).concat(copy)
  await writeJsonAtomic(safeJoin(projectRoot, PROJECT_PACKS_FILE), { ...doc, copies })
  return copy
}

/** Drop the record of a copy (the files stay; used when the project replaces the item itself). */
export async function forgetCopy(
  projectRoot: string,
  kind: CopiedPackKind,
  id: string,
): Promise<void> {
  const doc = await readProjectPacks(projectRoot)
  const copies = doc.copies.filter((c) => !(c.kind === kind && c.id === id))
  if (copies.length === doc.copies.length) return
  await writeJsonAtomic(safeJoin(projectRoot, PROJECT_PACKS_FILE), { ...doc, copies })
}

/**
 * State of a copy for badges. `installed` is the enabled pack of the same id, if any (pass the
 * pack only when it still provides this item).
 */
export async function copyState(
  projectRoot: string,
  copy: ProjectPackCopy,
  installed: { version: string } | undefined,
): Promise<PackCopyState> {
  return {
    edited: await isCopyEdited(projectRoot, copy),
    packMissing: !installed,
    updateAvailable: !!installed && compareSemver(installed.version, copy.version) > 0,
    ...(installed ? { installedVersion: installed.version } : {}),
  }
}
