// Copy-on-use for pack templates (ADR-0018 § Uninstall, #261). When an inject of a type the
// project resolves from a pack is created, saved or rendered, the template folder is copied
// into <project>/templates/injects/<type>/ and recorded in <project>/packs.json, so the
// project keeps rendering after the pack is updated or uninstalled. "Update from pack"
// replaces the copy only on request and refuses an edited copy unless confirmed.
import type { TemplateInfo } from '@shared/ipc'
import type { ProjectPackCopy } from '@shared/schemas/project-packs'
import { AppError } from '../lib/errors'
import { packById, packFilePath, packItemFiles, type InstalledPack } from '../packs/layers'
import { copyPackItem, copyState, findCopy } from '../packs/project-copies'
import {
  listTemplateTypes,
  loadTemplate,
  resolveTemplateLayer,
  templateInfo,
  type LoadedTemplate,
} from './templates'

const locks = new Map<string, Promise<unknown>>()

/** One copy at a time per project + type (two saves of new injects at once). */
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(fn)
  locks.set(key, run)
  try {
    return await run
  } finally {
    if (locks.get(key) === run) locks.delete(key)
  }
}

async function copyFromPack(
  projectRoot: string,
  type: string,
  pack: InstalledPack,
  replaceEdited: boolean,
): Promise<ProjectPackCopy> {
  const prefix = `templates/${type}/`
  const files = packItemFiles(pack, 'templates', type).map((f) => ({
    from: packFilePath(pack, f.path),
    to: `templates/injects/${type}/${f.path.slice(prefix.length)}`,
  }))
  return copyPackItem(
    projectRoot,
    {
      pack: { id: pack.id, version: pack.version, name: pack.name },
      kind: 'templates',
      id: type,
      files,
    },
    { replaceEdited },
  )
}

/**
 * If the project resolves `type` from a pack, copy that template into the project's layer and
 * record it. Returns the new copy, or undefined when nothing was copied (no template, already
 * in the project, user or built-in layer).
 */
export async function adoptPackTemplate(
  projectRoot: string,
  type: string,
): Promise<ProjectPackCopy | undefined> {
  if (!resolveTemplateLayer(type, projectRoot)?.pack) return undefined
  return withLock(`${projectRoot}\0${type}`, async () => {
    const layer = resolveTemplateLayer(type, projectRoot)
    const pack = layer?.pack && packById(layer.pack.id)
    if (!layer || layer.source !== 'pack' || !pack) return undefined
    return copyFromPack(projectRoot, type, pack, false)
  })
}

/** adoptPackTemplate that never fails the caller (saving an inject must not depend on it). */
export async function adoptPackTemplateQuietly(projectRoot: string, type: string): Promise<void> {
  try {
    await adoptPackTemplate(projectRoot, type)
  } catch (e) {
    console.error(`[templates] could not copy pack template "${type}" into the project:`, e)
  }
}

/** templateInfo plus the packs.json provenance and copy state of a project copy. */
export async function projectTemplateInfo(
  t: LoadedTemplate,
  projectRoot?: string,
): Promise<TemplateInfo> {
  if (!projectRoot || t.source !== 'project') return templateInfo(t)
  const copy = await findCopy(projectRoot, 'templates', t.meta.type)
  if (!copy) return templateInfo(t)
  const installed = packById(copy.packId)
  const provides = installed?.manifest.contents.templates.includes(copy.id) ? installed : undefined
  return templateInfo(t, { copy, state: await copyState(projectRoot, copy, provides) })
}

/** Every template the project (or no project) can use, with provenance (templates:list). */
export async function listTemplateInfos(projectRoot?: string): Promise<TemplateInfo[]> {
  const out: TemplateInfo[] = []
  for (const type of listTemplateTypes(projectRoot)) {
    let t: LoadedTemplate
    try {
      t = loadTemplate(type, projectRoot)
    } catch (e) {
      console.error(`[templates] ${type}:`, (e as Error).message)
      continue
    }
    out.push(await projectTemplateInfo(t, projectRoot))
  }
  return out
}

/**
 * "Update from pack": replace the project's copy of `type` with the installed pack's version.
 * Refuses (CONFLICT) to replace an edited copy unless `confirmEdited`.
 */
export async function updateTemplateFromPack(
  projectRoot: string,
  type: string,
  opts: { confirmEdited?: boolean } = {},
): Promise<TemplateInfo> {
  return withLock(`${projectRoot}\0${type}`, async () => {
    const copy = await findCopy(projectRoot, 'templates', type)
    if (!copy)
      throw new AppError('NOT_FOUND', `The project has no copy of a pack template "${type}"`)
    const pack = packById(copy.packId)
    if (!pack || !pack.manifest.contents.templates.includes(type))
      throw new AppError(
        'NOT_FOUND',
        `${copy.packName ?? copy.packId} is not installed and enabled, or no longer has "${type}"`,
      )
    await copyFromPack(projectRoot, type, pack, opts.confirmEdited ?? false)
    return projectTemplateInfo(loadTemplate(type, projectRoot), projectRoot)
  })
}
