// hazards:* through the IPC dispatcher with a fake fetch: never a real request (#439).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HazardSnapshot } from '@shared/schemas'

const electron = vi.hoisted(() => ({
  shell: { openExternal: vi.fn(async (_url: string) => undefined) },
}))
vi.mock('electron', () => ({
  app: { getVersion: () => '0.9.0', isPackaged: false, getPath: () => tmpdir(), on: vi.fn() },
  shell: electron.shell,
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (s: string) => Buffer.from('enc:' + s),
    decryptString: (b: Buffer) => b.toString().slice(4),
  },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./hazards')).default
const { hazardDeps, FIRMS_SIGNUP_URL } = await import('./hazards')
const { createProject, updateProject } = await import('../../project/store')
const { resetSettingsCache } = await import('../../settings/store')
const { resetHazardCooldowns } = await import('../../hazards/snapshot')
const { resetSecretsQueue } = await import('../../secrets')
const fx = await import('../../hazards/sources/fixtures')

const KEY = 'firmskeyfortests0001'

async function call<T = unknown>(channel: string, req?: unknown): Promise<T> {
  const res = await dispatch(handlers, channel, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

const urls: string[] = []
const agents: string[] = []
function fakeFetch(): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    urls.push(u)
    agents.push((init?.headers as Record<string, string>)['user-agent']!)
    const body = u.includes('alerts/active')
      ? fx.NWS_ALERTS
      : u.includes('fema.gov')
        ? fx.OPENFEMA
        : u.includes('firms')
          ? undefined
          : fx.USGS_QUAKES
    const text = body === undefined ? fx.FIRMS_CSV : JSON.stringify(body)
    return new Response(text, { status: 200 })
  }) as typeof fetch
}

let project: string
beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-hazard-ud-'))
  resetSettingsCache()
  resetSecretsQueue()
  resetHazardCooldowns()
  urls.length = 0
  agents.length = 0
  hazardDeps.fetchImpl = fakeFetch()
  project = (
    await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-hp-')), name: 'Harbor' })
  ).path
  await updateProject(project, (p) => {
    p.location = {
      label: 'Cook County, IL',
      lat: 41.87811,
      lon: -87.62979,
      stateFips: '17',
      countyFips: '031',
      sendPrecision: 0.01,
    }
    return p
  })
})

describe('off by default', () => {
  it('reports the feature off and refuses to fetch', async () => {
    expect(await call('hazards:settings')).toMatchObject({ enabled: false, hasFirmsKey: false })
    await expect(
      call('hazards:fetch', { projectPath: project, sources: ['openfema'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(urls).toEqual([])
  })

  it('plans nothing while off', async () => {
    expect(await call('hazards:plan', { projectPath: project })).toMatchObject({
      enabled: false,
      items: [],
    })
  })

  it('refuses a layer import while off', async () => {
    await expect(
      call('hazards:import-layer', {
        projectPath: project,
        file: '/x.csv',
        layer: 'a',
        source: 'b',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('when turned on', () => {
  beforeEach(async () => {
    await call('hazards:settings-save', { enabled: true })
  })

  it('plans what would be sent, with no request', async () => {
    const plan = await call<{ items: { id: string; host: string; sends: string }[] }>(
      'hazards:plan',
      { projectPath: project },
    )
    expect(plan.items.find((i) => i.id === 'nws_alerts')).toMatchObject({
      host: 'api.weather.gov',
      sends: 'rounded coordinates 41.88, -87.63',
    })
    expect(urls).toEqual([])
  })

  it('fetches the chosen sources and saves a snapshot the next session can read', async () => {
    const snap = await call<HazardSnapshot>('hazards:fetch', {
      projectPath: project,
      sources: ['nws_alerts', 'usgs_recent', 'openfema'],
    })
    expect(snap.alerts).toHaveLength(2)
    expect(
      urls.every((u) =>
        /^https:\/\/(api\.weather\.gov|earthquake\.usgs\.gov|www\.fema\.gov)\//.test(u),
      ),
    ).toBe(true)
    expect(new Set(agents)).toEqual(new Set(['ActionStations/0.9.0 (+https://actionstations.ai)']))
    const list = await call<{ active: string; snapshots: unknown[] }>('hazards:list', {
      projectPath: project,
    })
    expect(list.active).toBe(snap.id)
    const again = await call<HazardSnapshot>('hazards:get', { projectPath: project, id: snap.id })
    expect(again.declarations).toHaveLength(2)
  })

  it('needs a project location', async () => {
    await updateProject(project, (p) => {
      delete p.location
      return p
    })
    await expect(
      call('hazards:fetch', { projectPath: project, sources: ['openfema'] }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('keeps the FIRMS key in secure storage only', async () => {
    expect(await call('hazards:firms-key-set', { key: KEY })).toMatchObject({ hasFirmsKey: true })
    const snap = await call<HazardSnapshot>('hazards:fetch', {
      projectPath: project,
      sources: ['firms'],
    })
    expect(snap.fires?.count).toBe(2)
    expect(urls[0]).toContain(`/csv/${KEY}/`)
    const everything = [project, process.env.TTX_USER_DATA!].flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((f) => join(dir, f)),
    )
    for (const file of everything.filter((f) => /\.(json|md)$/.test(f))) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toContain(KEY)
    }
    expect(await call('hazards:firms-key-remove')).toMatchObject({ hasFirmsKey: false })
  })

  it('imports a layer file from disk without any request', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ttx-layer-')), 'h.geojson')
    writeFileSync(file, JSON.stringify(fx.LAYER_GEOJSON))
    const snap = await call<HazardSnapshot>('hazards:import-layer', {
      projectPath: project,
      file,
      layer: 'Hospitals',
      source: 'HIFLD archive, Hospitals',
    })
    expect(snap.infrastructure[0]!.features).toHaveLength(1)
    expect(urls).toEqual([])
  })

  it('opens only the FIRMS sign-up page, when asked', async () => {
    expect(electron.shell.openExternal).not.toHaveBeenCalled()
    await call('hazards:firms-signup-open')
    expect(electron.shell.openExternal).toHaveBeenCalledWith(FIRMS_SIGNUP_URL)
  })

  it('searches the bundled county list', async () => {
    const found = await call<{ label: string }[]>('hazards:gazetteer-search', { query: 'cook il' })
    expect(found[0]!.label).toBe('Cook County, IL')
  })
})
