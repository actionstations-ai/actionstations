import { app, BrowserWindow, dialog, shell } from 'electron'
import { defineHandlers } from '../registry'
import { getSettings, updateSettings } from '../../settings/store'
import { userDataDir } from '../../lib/paths'
import { onUnsavedReport } from '../../lib/quit-guard'
import { takePendingOpens, takePendingPackOpens } from '../../lib/open-requests'
import { AppError } from '../../lib/errors'
import { TIPS, guideUrl } from '@shared/tips'

const focused = (): BrowserWindow | undefined =>
  BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

export default defineHandlers({
  'app:info': () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron ?? '',
    userDataPath: userDataDir(),
    isPackaged: app.isPackaged,
  }),

  'dialog:open-directory': async ({ title, defaultPath }) => {
    const win = focused()
    const opts = { title, defaultPath, properties: ['openDirectory', 'createDirectory'] as const }
    const r = win
      ? await dialog.showOpenDialog(win, { ...opts, properties: [...opts.properties] })
      : await dialog.showOpenDialog({ ...opts, properties: [...opts.properties] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  },

  'dialog:open-files': async ({ title, filters, multi }) => {
    const properties: ('openFile' | 'multiSelections')[] = multi
      ? ['openFile', 'multiSelections']
      : ['openFile']
    const win = focused()
    const r = win
      ? await dialog.showOpenDialog(win, { title, filters, properties })
      : await dialog.showOpenDialog({ title, filters, properties })
    return r.canceled ? [] : r.filePaths
  },

  'dialog:save-file': async ({ title, defaultPath, filters }) => {
    const win = focused()
    const r = win
      ? await dialog.showSaveDialog(win, { title, defaultPath, filters })
      : await dialog.showSaveDialog({ title, defaultPath, filters })
    return r.canceled ? null : (r.filePath ?? null)
  },

  'app:unsaved-report': ({ requestId, items }) => {
    onUnsavedReport(requestId, items)
  },

  'app:pending-opens': () => takePendingOpens(),

  'app:pending-pack-opens': () => takePendingPackOpens(),

  'help:open-guide': async ({ tipId }) => {
    const tip = TIPS.find((t) => t.id === tipId)
    if (!tip) throw new AppError('VALIDATION', `No tip with id ${tipId}`)
    await shell.openExternal(guideUrl(tip, app.getVersion(), app.isPackaged))
  },

  'shell:show-item': ({ path }) => {
    shell.showItemInFolder(path)
  },

  'settings:get': () => getSettings(),

  'settings:update': (patch) =>
    updateSettings((s) => {
      if (patch.ui) {
        const { tips, ...rest } = patch.ui
        s.ui = { ...s.ui, ...rest, tips: { ...s.ui.tips, ...tips } }
      }
      if (patch.embeddings) s.embeddings = { ...s.embeddings, ...patch.embeddings }
      if (patch.generation) s.generation = { ...s.generation, ...patch.generation }
      if (patch.surveys) s.surveys = { ...s.surveys, ...patch.surveys }
      if (patch.live) s.live = { ...s.live, ...patch.live }
      if (patch.defaultRouting) s.defaultRouting = patch.defaultRouting
      if (patch.onboardingComplete !== undefined) s.onboardingComplete = patch.onboardingComplete
      if (patch.defaultProjectsDir !== undefined) s.defaultProjectsDir = patch.defaultProjectsDir
      if (patch.setup) s.setup = { ...s.setup, ...patch.setup }
      if (patch.keyReentryDismissed !== undefined && s.keyReentry)
        s.keyReentry.dismissed = patch.keyReentryDismissed
    }),
})
