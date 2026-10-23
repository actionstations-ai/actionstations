import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { createProject, loadProject, openProject, updateProject } from '../../project/store'
import { forgetRecent, listRecent, syncRecent } from '../../project/recent'
import { duplicateProject } from '../../project/duplicate'
import { ensureIndex } from '../../project/ensure-index'
import { applyProjectPatch } from '../../project/patch'
import { clearLogo, importLogo } from '../../project/logo'
import {
  readFacilityView,
  resetFacilityFacts,
  saveFacilityFacts,
} from '../../generate/facility-edit'

export default defineHandlers({
  'project:list-recent': () => listRecent(),

  // create/open register the path (touchRecent), which is what requireProject checks later.
  'project:create': (req) => createProject(req),

  // A copied folder (duplicate, example, git checkout) has no index.sqlite: rebuild it.
  'project:open': async ({ path }) => {
    const opened = await openProject(path)
    await ensureIndex(opened.path, opened.project)
    return opened
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
    const project = await updateProject(root, (draft) => applyProjectPatch(draft, patch))
    if (patch.name !== undefined || patch.orgName !== undefined) await syncRecent(root, project)
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
