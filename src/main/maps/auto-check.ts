// The map catalog check that rides on the app's update check (#500, spec 0436 FR-14, #442).
// It runs only when the user turned on both "Check for new versions" (Settings > Updates) and
// "Check for new state map files" (Settings > Maps), at most once a day, and it only compares
// checksums: nothing is downloaded. The result is kept in the maps settings.
import { packAppVersion } from '../packs/app-version'
import { getSettings, updateSettings } from '../settings/store'
import { fetchCatalog, updatesFor } from './catalog'
import { isLoopback, setMapsAppVersion } from './net'

const DAY_MS = 24 * 60 * 60 * 1000

/** Replaced in tests. */
export const autoCheckDeps = { now: (): number => Date.now() }

/** The catalog ids with a newer file, or undefined when no check was due or allowed. */
export async function checkMapCatalogAtStartup(): Promise<string[] | undefined> {
  const s = await getSettings()
  if (s.updates.check !== 'on' || !s.maps.checkUpdates) return undefined
  const last = s.maps.lastCatalogCheck ? Date.parse(s.maps.lastCatalogCheck.at) : 0
  if (autoCheckDeps.now() - last < DAY_MS) return undefined
  setMapsAppVersion(packAppVersion())
  const catalogUrl = s.maps.catalogUrl
  const catalog = await fetchCatalog({
    catalogUrl,
    ...(isLoopback(catalogUrl) ? { allowLoopback: true } : {}),
  })
  const updates = (await updatesFor(catalog)).map((u) => u.id)
  await updateSettings((d) => {
    d.maps.lastCatalogCheck = { at: new Date(autoCheckDeps.now()).toISOString(), updates }
  })
  return updates
}
