// Reference documents from installed packs (#265): list and import, and adding the user's own
// copy of a document a pack lists without its file (#1101).
import { extname } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { ensurePacksLoaded } from '../../packs/state'
import {
  importPackDocuments,
  listPackDocuments,
  projectDocuments,
  userDocumentOf,
} from '../../ingest/pack-documents'
import { addSuppliedDocument } from '../../packs/supplied-documents'

/** The native picker for one document, filtered to its file type. */
async function pickFile(title: string, path: string): Promise<string | undefined> {
  const ext = extname(path).slice(1)
  const opts = {
    title: `Add your copy of ${title}`.slice(0, 200),
    filters: [{ name: `${ext.toUpperCase()} document`, extensions: [ext] }],
    properties: ['openFile' as const],
  }
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return r.canceled ? undefined : r.filePaths[0]
}

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
  'packs:addSuppliedDocument': async (ref) => {
    await ensurePacksLoaded()
    const { doc } = userDocumentOf(ref)
    const file = await pickFile(doc.title, doc.path)
    if (!file) return { ok: false, canceled: true }
    return addSuppliedDocument(doc, file)
  },
})
