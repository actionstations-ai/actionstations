// hazards:* (#439, ADR-0061). Every network call here starts from the user pressing Fetch and
// is refused unless Settings → Hazard data is on. The renderer sends no URL; main builds each
// request from the project's location and four fixed hosts, with coordinates rounded.
import { app, shell } from 'electron'
import type { HazardFetchOptions, HazardPlan } from '@shared/ipc/hazards'
import type { ProjectLocation } from '@shared/schemas'
import { AppError } from '../../lib/errors'
import { boundGet } from '../../hazards/http'
import { importLayer } from '../../hazards/layer'
import { searchCounties } from '../../hazards/gazetteer'
import { planItems } from '../../hazards/plan'
import { fetchSnapshot, type FetchOptions } from '../../hazards/snapshot'
import { deleteSnapshot, getSnapshot, readIndex, updateSnapshot } from '../../hazards/store'
import { packAppVersion } from '../../packs/app-version'
import { loadProject } from '../../project/store'
import { requireProject } from '../../project/guard'
import { encryptionAvailable, getSecret, hasSecret, setSecret } from '../../secrets'
import { getSettings, updateSettings } from '../../settings/store'
import { defineHandlers } from '../registry'

export const FIRMS_SECRET = 'firms'
export const FIRMS_SIGNUP_URL = 'https://firms.modaps.eosdis.nasa.gov/api/map_key/'

/** Swapped in tests: the fetch, the clock and the version. */
export const hazardDeps: {
  fetchImpl: typeof fetch | undefined
  now: () => Date
  version: () => string
} = { fetchImpl: undefined, now: () => new Date(), version: () => packAppVersion() }

/** Test builds only: send every allowed host to a local server (see e2e/hazards.spec.ts). */
function testBase(): string | undefined {
  const base = process.env.TTX_HAZARD_BASE
  return base && process.env.NODE_ENV === 'test' && !app.isPackaged ? base : undefined
}

async function appSettings() {
  return {
    enabled: (await getSettings()).hazards.enabled,
    hasFirmsKey: await hasSecret(FIRMS_SECRET).catch(() => false),
    encryptionAvailable: encryptionAvailable(),
  }
}

async function requireEnabled(): Promise<void> {
  if (!(await getSettings()).hazards.enabled)
    throw new AppError('FORBIDDEN', 'Hazard data is off. Turn it on in Settings first.')
}

async function locationOf(root: string): Promise<ProjectLocation | undefined> {
  return (await loadProject(root)).location
}

async function requireLocation(root: string): Promise<ProjectLocation> {
  const where = await locationOf(root)
  if (!where)
    throw new AppError('VALIDATION', 'Set the project location first (Project settings, Location).')
  return where
}

const toFetchOptions = (o: HazardFetchOptions): Omit<FetchOptions, 'sources'> => ({
  firmsDays: o.firmsDays,
  recent: { radiusKm: o.recentRadiusKm, minMagnitude: o.recentMinMagnitude },
  historical: { radiusKm: o.historicalRadiusKm, minMagnitude: o.historicalMinMagnitude },
})

export default defineHandlers({
  'hazards:settings': () => appSettings(),

  'hazards:settings-save': async ({ enabled }) => {
    await updateSettings((s) => {
      s.hazards.enabled = enabled
    })
    return appSettings()
  },

  'hazards:firms-key-set': async ({ key }) => {
    await setSecret(FIRMS_SECRET, key)
    return appSettings()
  },

  'hazards:firms-key-remove': async () => {
    await setSecret(FIRMS_SECRET, null)
    return appSettings()
  },

  'hazards:firms-signup-open': async () => {
    await shell.openExternal(FIRMS_SIGNUP_URL)
  },

  'hazards:gazetteer-search': ({ query }) => searchCounties(query),

  'hazards:plan': async ({ projectPath, options }): Promise<HazardPlan> => {
    const root = await requireProject(projectPath)
    const enabled = (await getSettings()).hazards.enabled
    const where = await locationOf(root)
    if (!enabled || !where) return { enabled, hasLocation: !!where, items: [] }
    const hasKey = await hasSecret(FIRMS_SECRET).catch(() => false)
    return { enabled, hasLocation: true, items: planItems(where, toFetchOptions(options), hasKey) }
  },

  'hazards:fetch': async ({ projectPath, sources, options }) => {
    await requireEnabled()
    const root = await requireProject(projectPath)
    const where = await requireLocation(root)
    const firmsKey = sources.includes('firms') ? await getSecret(FIRMS_SECRET) : undefined
    const base = testBase()
    const get = boundGet({
      version: hazardDeps.version(),
      ...(hazardDeps.fetchImpl ? { fetchImpl: hazardDeps.fetchImpl } : {}),
      ...(base ? { testBase: base } : {}),
    })
    return fetchSnapshot(
      root,
      where,
      { sources: sources.filter((s) => s !== 'infrastructure'), ...toFetchOptions(options) },
      { get, now: hazardDeps.now, ...(firmsKey ? { firmsKey } : {}) },
    )
  },

  'hazards:import-layer': async ({ projectPath, file, layer, source, radiusKm }) => {
    await requireEnabled()
    const root = await requireProject(projectPath)
    return importLayer(root, await requireLocation(root), { file, layer, source, radiusKm })
  },

  'hazards:list': async ({ projectPath }) => readIndex(await requireProject(projectPath)),

  'hazards:get': async ({ projectPath, id }) => getSnapshot(await requireProject(projectPath), id),

  'hazards:update': async ({ projectPath, id, ...patch }) =>
    updateSnapshot(await requireProject(projectPath), id, patch),

  'hazards:delete': async ({ projectPath, id }) =>
    deleteSnapshot(await requireProject(projectPath), id),
})
