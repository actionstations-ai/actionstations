// Template layers and the inject type registry (ADR-0018, #261): registry for the pickers,
// templates refused at load, and the explicit "Update from pack" of a project copy.
import { defineHandlers } from '../registry'
import { ensurePacksLoaded } from '../../packs/state'
import { requireProject } from '../../project/guard'
import { updateTemplateFromPack } from '../../render/template-copies'
import { listInjectTypes } from '../../render/template-registry'
import { refusedTemplates } from '../../render/templates'

const rootOf = async (req: { projectPath?: string | undefined } | undefined) =>
  req?.projectPath ? requireProject(req.projectPath) : undefined

export default defineHandlers({
  'templates:taxonomy': async (req) => {
    await ensurePacksLoaded()
    return listInjectTypes(await rootOf(req))
  },

  'templates:refused': async (req) => {
    await ensurePacksLoaded()
    return refusedTemplates(await rootOf(req)).map(({ pack, ...r }) => ({
      ...r,
      ...(pack ? { packId: pack.id, packVersion: pack.version, packName: pack.name } : {}),
    }))
  },

  'templates:updateFromPack': async ({ projectPath, type, confirmEdited }) => {
    await ensurePacksLoaded()
    const root = await requireProject(projectPath)
    return updateTemplateFromPack(root, type, { confirmEdited: confirmEdited ?? false })
  },
})
