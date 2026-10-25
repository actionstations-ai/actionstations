import type { Project } from '@shared/schemas'
import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { createProject, loadProject, openProject, updateProject } from '../../project/store'
import { forgetRecent, listRecent, syncRecent } from '../../project/recent'
import { duplicateProject } from '../../project/duplicate'
import { ensureIndex } from '../../project/ensure-index'
import { markInterruptedDocuments } from '../../ingest/interrupted'
import { applyProjectPatch } from '../../project/patch'
import { clearLogo, importLogo } from '../../project/logo'
import { refreshFacilityFile } from '../../generate/facility-file'
import {
  readFacilityView,
  resetFacilityFacts,
  saveFacilityFacts,
} from '../../generate/facility-edit'

/** What the facts extraction reads from a project's overrides. */
const factDefinitionsKey = (p: Project): string =>
  JSON.stringify([
    p.domainProfileOverrides?.factCategories ?? null,
    p.domainProfileOverrides?.agencyPattern ?? null,
  ])

/** The settings are saved either way; a failed extraction leaves the facts file as it was. */
async function refreshFacts(root: string): Promise<void> {
  try {
    await refreshFacilityFile(root)
  } catch (err) {
    console.warn('[project] facility-facts.md was not re-extracted', err)
  }
}

export default defineHandlers({
  'project:list-recent': () => listRecent(),

  // create/open register the path (touchRecent), which is what requireProject checks later.
  'project:create': (req) => createProject(req),

  // A copied folder (duplicate, example, git checkout) has no index.sqlite: rebuild it.
  'project:open': async ({ path }) => {
    const opened = await openProject(path)
    await ensureIndex(opened.path, opened.project)
    // After ensureIndex, so documents its rebuild covers stay as they are (#309).
    const documents = await markInterruptedDocuments(opened.path, opened.project.documents)
    return { ...opened, project: { ...opened.project, documents } }
  },

  'project:facility-facts': async ({ path }) => {
    const root = await requireProject(path)
    return readFacilityView(root)
  },

  'project:facility-facts-reset': async ({ path }) => {
    const root = await requireProject(path)
    return resetFacilityFacts(root)
  },

  'project:facility-facts-save': async ({ path, categories, revision }) => {
    const root = await requireProject(path)
    return saveFacilityFacts(root, { categories, ...(revision ? { revision } : {}) })
  },

  'project:get': async ({ path }) => {
    const root = await requireProject(path)
    return { path: root, project: await loadProject(root) }
  },

  'project:update': async ({ path, patch }) => {
    const root = await requireProject(path)
    let before = ''
    const project = await updateProject(root, (draft) => {
      before = factDefinitionsKey(draft)
      return applyProjectPatch(draft, patch)
    })
    if (patch.name !== undefined || patch.orgName !== undefined) await syncRecent(root, project)
    // New fact definitions (#180): extract again. An edited facility-facts.md is kept and the
    // new extraction goes to facility-facts.generated.md beside it.
    if (factDefinitionsKey(project) !== before) await refreshFacts(root)
    return { path: root, project }
  },

  'project:set-logo': async ({ path, sourcePath }) => {
    const root = await requireProject(path)
    return { path: root, project: await importLogo(root, sourcePath) }
  },

  'project:clear-logo': async ({ path }) => {
    const root = await requireProject(path)
    return { path: root, project: await clearLogo(root) }
  },

  'project:duplicate': async ({ path, newName, parentDir }) => {
    const root = await requireProject(path)
    const copy = await duplicateProject(root, { newName, ...(parentDir ? { parentDir } : {}) })
    await ensureIndex(copy.path, copy.project)
    return copy
  },

  'project:archive': async ({ path, archived }) => {
    const root = await requireProject(path)
    const project = await updateProject(root, (draft) => {
      draft.archived = archived
    })
    await syncRecent(root, project)
    return { path: root, project }
  },

  // No guard: the folder may already be gone, and forgetting never touches the disk.
  'project:forget-recent': async ({ path }) => {
    await forgetRecent(path)
    return listRecent()
  },
})
