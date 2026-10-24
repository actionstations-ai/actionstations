// Export as pack (#271): list what can be exported, build + validate, save through the main
// process's own save dialog, and open the contribution page on a user click.
import { BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { PACK_CONTRIBUTION_URL, type PackExportRequest } from '@shared/ipc/pack-export'
import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { writeFileAtomic } from '../../lib/fs'
import { documentsDir } from '../../lib/paths'
import { packAppVersion } from '../../packs/app-version'
import { ensurePacksLoaded } from '../../packs/state'
import { buildPackExport, exportSources } from '../../packs/export'

async function withProject(req: PackExportRequest): Promise<PackExportRequest> {
  if (!req.projectPath) return req
  return { ...req, projectPath: await requireProject(req.projectPath) }
}

async function build(req: PackExportRequest) {
  await ensurePacksLoaded()
  return buildPackExport(await withProject(req), { appVersion: packAppVersion() })
}

async function askSavePath(fileName: string): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const opts = {
    title: 'Save pack',
    defaultPath: join(documentsDir(), fileName),
    filters: [{ name: 'Action Stations pack', extensions: ['aspack'] }],
  }
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  return r.canceled || !r.filePath ? null : r.filePath
}

export default defineHandlers({
  'packs:exportSources': async (req) => {
    await ensurePacksLoaded()
    const projectPath = req?.projectPath ? await requireProject(req.projectPath) : undefined
    return exportSources(projectPath, { appVersion: packAppVersion() })
  },
  'packs:exportCheck': async (req) => {
    const r = await build(req)
    return r.ok ? r.built : { ok: false as const, problems: r.problems }
  },
  'packs:exportSave': async (req) => {
    const r = await build(req)
    if (!r.ok) return { ok: false as const, problems: r.problems }
    const path = await askSavePath(r.built.fileName)
    if (!path) return { ok: true as const, canceled: true as const }
    await writeFileAtomic(path, r.buffer)
    return { ...r.built, canceled: false as const, path }
  },
  'packs:openContribution': async () => {
    await shell.openExternal(PACK_CONTRIBUTION_URL)
  },
})
