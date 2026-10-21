import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { createProject, loadProject, openProject, updateProject } from '../../project/store'
import { forgetRecent, listRecent, syncRecent } from '../../project/recent'
import { duplicateProject } from '../../project/duplicate'
import { applyProjectPatch } from '../../project/patch'

export default defineHandlers({
  'project:list-recent': () => listRecent(),

  // create/open register the path (touchRecent), which is what requireProject checks later.
  'project:create': (req) => createProject(req),

  'project:open': ({ path }) => openProject(path),

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

  'project:duplicate': async ({ path, newName, parentDir }) => {
    const root = await requireProject(path)
    return duplicateProject(root, { newName, ...(parentDir ? { parentDir } : {}) })
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
