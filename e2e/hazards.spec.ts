// Optional hazard data (#439) in the built app. A local server on 127.0.0.1 stands in for the four
// public hosts (TTX_HAZARD_BASE, honoured only in test builds). Checks: off by default with no
// fetch offered; the consent dialog names hosts and values; Fetch writes a snapshot; ideas run
// with the snapshot as context; and nothing but loopback traffic leaves the app.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { goTo, invoker, launch, waitForJob } from './helpers'
import { expectLoopbackOnly, netLog } from './net-log'
import * as fx from '../src/main/hazards/sources/fixtures'
import { json, startServer, type TestServer } from '../src/main/packs/test-server'

test.setTimeout(240_000)

let server: TestServer
const agents: string[] = []

test.beforeAll(async () => {
  server = await startServer()
  const answer = (body: unknown) => json(body)
  const track =
    (route: ReturnType<typeof json>): ReturnType<typeof json> =>
    (req, res) => {
      agents.push(String(req.headers['user-agent']))
      route(req, res)
    }
  server.route('/api.weather.gov/alerts/active', track(answer(fx.NWS_ALERTS)))
  server.route('/earthquake.usgs.gov/fdsnws/event/1/query', track(answer(fx.USGS_QUAKES)))
  server.route(
    '/www.fema.gov/api/open/v2/DisasterDeclarationsSummaries',
    track(answer(fx.OPENFEMA)),
  )
})
test.afterAll(() => server.close())

async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)
}

test('hazard data: off by default, consent dialog, fetch, snapshot, ideas with context', async () => {
  const net = netLog('hazards')
  const before = server.hits.length
  const { app, page } = await launch(
    { TTX_MOCK_PROVIDERS: '1', TTX_APP_VERSION: '0.9.0', TTX_HAZARD_BASE: server.base, ...net.env },
    { args: net.args },
  )
  const invoke = invoker(page)
  const work = mkdtempSync(join(tmpdir(), 'ttx-e2e-hazards-'))
  try {
    const md = join(work, 'Plan.md')
    writeFileSync(md, '## 4.3 Flooding\n\nThe EOC activates when river levels reach flood stage.\n')
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir: work,
      name: 'Hazards E2E',
      orgName: 'Harbor Water District',
      orgType: 'water',
    })
    const imported = await invoke<{ jobId: string }>('documents:import', {
      projectPath,
      filePaths: [md],
    })
    await waitForJob(invoke, imported.jobId, 90_000)
    await invoke('project:update', {
      path: projectPath,
      patch: {
        location: {
          label: 'Cook County, IL',
          lat: 41.87811,
          lon: -87.62979,
          stateFips: '17',
          countyFips: '031',
          sendPrecision: 0.01,
        },
      },
    })

    // Off by default: no fetch is offered and nothing was requested.
    const key = encodeURIComponent(projectPath)
    await goTo(page, `#/p/${key}/hazards`)
    await expect(page.getByText('Hazard data is off')).toBeVisible()
    await expect(page.getByRole('button', { name: /Fetch hazard data/ })).toHaveCount(0)
    expect(await axeViolations(page)).toEqual([])
    expect(server.hits.length).toBe(before)

    // Turn it on in Settings.
    await goTo(page, '#/settings')
    const allow = page.getByRole('checkbox', { name: 'Allow fetching public hazard data' })
    await allow.click()
    await expect(allow).toBeChecked()
    await expect(page.getByRole('heading', { name: 'Hazard data' })).toBeVisible()

    // The consent dialog names the hosts and the rounded values; still nothing requested.
    await goTo(page, `#/p/${key}/hazards`)
    await page.getByRole('button', { name: /Fetch hazard data/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Fetch hazard data' })
    await expect(dialog).toContainText('Host: api.weather.gov')
    await expect(dialog).toContainText('rounded coordinates 41.88, -87.63')
    await expect(dialog).toContainText('state and county codes 17 / 031')
    expect(server.hits.length).toBe(before)

    await dialog.getByRole('button', { name: 'Fetch' }).click()
    await expect(page.getByTestId('hazard-snapshot')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Flood Watch issued October 28')).toBeVisible()
    await expect(page.getByRole('table', { name: 'Result of each source' })).toBeVisible()
    expect(await axeViolations(page)).toEqual([])
    expect(new Set(agents)).toEqual(new Set(['ActionStations/0.9.0 (+https://actionstations.ai)']))
    const requested = server.hits.slice(before)
    expect(requested.some((p) => p.startsWith('/api.weather.gov/'))).toBe(true)
    expect(requested.some((p) => p.startsWith('/www.fema.gov/'))).toBe(true)

    // The snapshot is a file in the project; ideas use it without any request.
    const list = await invoke<{ active: string }>('hazards:list', { projectPath })
    const saved = readFileSync(join(projectPath, 'hazards', `${list.active}.json`), 'utf8')
    expect(saved).toContain('Flood Watch')
    const hitsAfterFetch = server.hits.length
    const started = await invoke<{ jobId: string }>('generate:ideas', {
      projectPath,
      count: 2,
      useHazards: true,
    })
    await waitForJob(invoke, started.jobId, 120_000)
    const ideas = await invoke<{ hazardSnapshotId?: string }[]>('generate:ideas-result', {
      projectPath,
    })
    expect(ideas.length).toBeGreaterThan(0)
    expect(ideas[0]!.hazardSnapshotId).toBe(list.active)
    expect(server.hits.length).toBe(hitsAfterFetch)

    // An imported layer is parsed in a worker thread and joins the snapshot (#506).
    const csv = join(work, 'hospitals.csv')
    writeFileSync(csv, 'name,type,latitude,longitude\nLakeside General,Hospital,41.9,-87.6\n')
    const withLayer = await invoke<{ infrastructure: { layer: string; features: unknown[] }[] }>(
      'hazards:import-layer',
      { projectPath, file: csv, layer: 'Hospitals', source: 'HIFLD archive', radiusKm: 50 },
    )
    expect(withLayer.infrastructure[0]).toMatchObject({ layer: 'Hospitals' })
    expect(withLayer.infrastructure[0]!.features).toHaveLength(1)

    // The scenario's provenance names the snapshot it was written with.
    const scenario = await invoke<{ id: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flood drill',
      brief: { hazardSnapshotId: list.active },
    })
    await goTo(page, `#/p/${key}/scenarios/${scenario.id}`)
    await page.getByText('Advanced information', { exact: true }).click()
    const provenance = page.getByRole('region', { name: 'Hazard context' })
    await expect(provenance).toBeVisible()
    await expect(
      provenance.getByRole('table', { name: 'Sources of the hazard snapshot' }),
    ).toBeVisible()
    expect(await axeViolations(page)).toEqual([])
    expect(server.hits.length).toBe(hitsAfterFetch)
  } finally {
    await app.close()
    rmSync(work, { recursive: true, force: true })
  }
  expectLoopbackOnly(net.read())
})
