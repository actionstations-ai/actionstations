// Copy-on-use for pack items (ADR-0018 § Uninstall). The template, workflow, document and
// example layers call copyPackItem the first time a project uses a pack item; the copy lives in
// the project's own layer and is recorded in <project>/packs.json with a sha256 per file.
// copyState compares a record with the files on disk and the installed pack, for the
// "edited" / "not installed" / "Update available" badges (#269). Updating a copy is always
// an explicit action: copyPackItem refuses to replace an edited copy unless `replaceEdited`.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
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
      if (sha256(await fs.readFile(safeJoin(projectRoot, f.path))) !== f.sha256) return true
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
    const bytes = await fs.readFile(f.from)
    const dest = safeJoin(projectRoot, f.to)
    await ensureDir(dirname(dest))
    await writeFileAtomic(dest, bytes)
    files.push({ path: f.to, sha256: sha256(bytes) })
  }
  const kept = new Set(files.map((f) => f.path))
  for (const old of previous?.files ?? [])
    if (!kept.has(old.path)) await fs.rm(safeJoin(projectRoot, old.path), { force: true })
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
