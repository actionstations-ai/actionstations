// Reference documents from installed packs (#265): list and import.
import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { ensurePacksLoaded } from '../../packs/state'
import {
  importPackDocuments,
  listPackDocuments,
  projectDocuments,
} from '../../ingest/pack-documents'

export default defineHandlers({
  'packs:documents': async (req) => {
    await ensurePacksLoaded()
    const docs = req?.projectPath
      ? await projectDocuments(await requireProject(req.projectPath))
      : []
    return listPackDocuments(docs)
  },
  'packs:importDocuments': async ({ projectPath, documents }) => {
    const root = await requireProject(projectPath)
    await ensurePacksLoaded()
    return importPackDocuments(root, documents)
  },
})
