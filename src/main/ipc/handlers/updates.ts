// updates:* (#442). The renderer never sends a URL: updates:open names a target and main opens
// only the stored release page (re-checked) or the guide section it builds itself.
import { app, shell } from 'electron'
import { defineHandlers } from '../registry'
import { AppError } from '../../lib/errors'
import { getSettings, updateSettings } from '../../settings/store'
import { abortCheck, checkForUpdate, MAX_ASKS, statusOf, updateStatus } from '../../updates/check'
import { RELEASES_REPO, isReleasePageUrl } from '../../updates/release'
import { emit } from '../../lib/events'

/** The Updates section of the Getting started guide, at this app's version. */
export function updatesGuideUrl(version: string, isPackaged: boolean): string {
  const ref = isPackaged ? `v${version}` : 'main'
  return `https://github.com/${RELEASES_REPO}/blob/${ref}/docs/guides/getting-started.md#updates`
}

async function releasePageUrl(): Promise<string> {
  const result = (await getSettings()).updates.lastResult
  if (result?.kind !== 'ok' || !isReleasePageUrl(result.latest.url))
    throw new AppError('NOT_FOUND', 'No release page to open. Check for updates first.')
  return result.latest.url
}

export default defineHandlers({
  'updates:status': () => updateStatus(),

  'updates:check': () => checkForUpdate('manual'),

  'updates:set': async ({ check, dismissedVersion, asked }) => {
    const saved = await updateSettings((s) => {
      if (check) s.updates.check = check
      if (dismissedVersion !== undefined) s.updates.dismissedVersion = dismissedVersion
      if (asked) s.updates.askedCount = Math.min(MAX_ASKS, s.updates.askedCount + 1)
    })
    // After the write, so a stopped check reports the new setting.
    if (check === 'off') abortCheck()
    emit('updates:changed', {})
    return statusOf(saved)
  },

  'updates:open': async ({ target }) => {
    const url =
      target === 'release'
        ? await releasePageUrl()
        : updatesGuideUrl(app.getVersion(), app.isPackaged)
    await shell.openExternal(url)
  },
})
