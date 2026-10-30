// Maps (#436): a site plan with pinned places in Facilitate, a PMTiles map file read through
// maps:tile, and online maps against a local tile server. Nothing here reaches a real tile
// server: the tile provider is a loopback HTTP server, and online maps start switched off.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createWebCryptoProvider } from '../src/shared/live/crypto/webcrypto'
import { HarnessController } from '../src/player/harness/controller'
import { startHarness } from '../src/player/harness/server'
import { goTo, invoker, launch } from './helpers'
import { buildPdf } from '../tests/fixtures/ingest/builders'
import { makePmtiles, solidPng } from '../tests/fixtures/maps/files'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as { msel: { id: string; [k: string]: unknown }[]; [k: string]: unknown }

interface Maps {
  maps: { maps: unknown[]; places: unknown[]; [k: string]: unknown }
  revision: string
}

const AT: Record<string, string[]> = { 'I-01': ['gate'], 'I-06': ['eoc'], 'I-13': ['gate'] }

async function tileServer() {
  const seen: { url: string; ua: string | undefined }[] = []
  const server = createServer((req, res) => {
    seen.push({ url: req.url ?? '', ua: req.headers['user-agent'] })
    res.setHeader('content-type', 'image/png')
    res.end(solidPng(8, [30, 90, 160, 255]))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { origin, seen, close: () => new Promise<void>((r) => server.close(() => r())) }
}

test('maps: site plan pins in Facilitate, a map file through maps:tile, online maps off then on', async () => {
  test.setTimeout(120_000)
  const tiles = await tileServer()
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-e2e-maps-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir: dir,
      name: 'Maps E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Smoke at the gate',
    })
    const msel = FIXTURE.msel.map((r) => ({ ...r, placeIds: AT[r.id] ?? [] }))
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, msel, id: empty.id, projectId: empty.projectId },
    })

    // A site plan with two places.
    const planFile = join(dir, 'terminal.png')
    writeFileSync(planFile, solidPng(64, [220, 220, 200, 255]))
    const added = await invoke<Maps & { mapId: string }>('maps:import-plan', {
      projectPath,
      filePath: planFile,
      title: 'Terminal level 1',
    })
    const place = (id: string, label: string, kind: string, x: number, y: number) => ({
      id,
      label,
      kind,
      note: '',
      positions: [{ mapId: added.mapId, x, y }],
    })
    await invoke('maps:save', {
      projectPath,
      revision: added.revision,
      maps: {
        ...added.maps,
        places: [
          place('gate', 'Gate A1', 'incident', 20, 30),
          place('eoc', 'EOC', 'command', 70, 60),
        ],
      },
    })

    // Facilitate: clock at 1:15, deliver I-01, open the Map tab.
    const key = encodeURIComponent(projectPath)
    await page.evaluate(
      (h) => ((globalThis as unknown as { location: { hash: string } }).location.hash = h),
      `#/p/${key}/facilitate`,
    )
    await page.getByRole('link', { name: 'Flight to Nowhere' }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await page.getByLabel('Exercise time (H:MM)').fill('1:15')
    await page.getByRole('button', { name: 'Set time', exact: true }).click()
    await page
      .getByRole('region', { name: 'Timeline' })
      .getByRole('button', { name: 'Deliver I-01', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Map' }).click()

    const plan = page.getByTestId('site-plan')
    await expect(plan).toBeVisible()
    await expect(page.getByRole('button', { name: 'Gate A1: I-01 delivered' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'EOC: I-06 due' })).toBeVisible()
    // I-13 is at 3:00, so it is upcoming and hidden until Show upcoming is on.
    await expect(page.getByText('I-13')).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Show upcoming' }).check()
    await expect(
      page.getByRole('button', { name: 'Gate A1: I-01 delivered, I-13 upcoming' }),
    ).toBeVisible()
    await expect(page.getByRole('table').getByText('upcoming')).toBeVisible()

    // A PMTiles file is read through maps:tile with no network.
    const file = join(dir, 'fixture.pmtiles')
    makePmtiles(file, solidPng(16, [200, 30, 30, 255]), 'Fixture data')
    const archive = await invoke<{ sha256: string; attribution: string }>('maps:import-archive', {
      filePath: file,
      title: 'Fixture map',
    })
    expect(archive.attribution).toBe('Fixture data')
    const withFile = await invoke<Maps>('maps:get', { projectPath })
    await invoke('maps:save', {
      projectPath,
      revision: withFile.revision,
      maps: {
        ...withFile.maps,
        maps: [
          ...withFile.maps.maps,
          {
            kind: 'geo',
            id: 'geo1',
            title: 'County',
            style: 'light',
            basemap: { kind: 'file', sha256: archive.sha256 },
          },
          {
            kind: 'geo',
            id: 'geo2',
            title: 'Online',
            style: 'light',
            basemap: { kind: 'online', provider: 'osm' },
          },
        ],
      },
    })
    const tile = await invoke<{ data: Uint8Array | Record<string, number>; contentType: string }>(
      'maps:tile',
      {
        projectPath,
        mapId: 'geo1',
        z: 0,
        x: 0,
        y: 0,
      },
    )
    expect(tile.contentType).toBe('image/png')
    expect(Object.keys(tile.data).length).toBeGreaterThan(50)
    const basemap = await invoke<{ mode: string; attribution?: string }>('maps:basemap', {
      projectPath,
      mapId: 'geo1',
    })
    expect(basemap).toMatchObject({ mode: 'archive', attribution: 'Fixture data' })

    // Online maps are off: the map says so and nothing is requested.
    const off = await invoke<{ mode: string; message?: string }>('maps:basemap', {
      projectPath,
      mapId: 'geo2',
    })
    expect(off.mode).toBe('offline-off')
    expect(off.message).toMatch(/Online maps are off/)
    expect(tiles.seen).toHaveLength(0)

    // Turned on with a provider on this computer, a tile is fetched once and then cached.
    await invoke('maps:settings-set', {
      online: { enabled: true, provider: 'osm', osmUrl: `${tiles.origin}/{z}/{x}/{y}.png` },
    })
    const url = `${tiles.origin}/3/2/1.png`
    await invoke('maps:fetch', { url })
    await invoke('maps:fetch', { url })
    expect(tiles.seen).toHaveLength(1)
    expect(tiles.seen[0]!.ua).toMatch(/^ActionStations\/\S+ \(\+https:\/\/actionstations\.ai\)$/)
    const refused = await page.evaluate(
      (u) =>
        (
          globalThis as unknown as {
            ttx: { invoke: (c: string, p: unknown) => Promise<{ ok: boolean }> }
          }
        ).ttx.invoke('maps:fetch', { url: u }),
      'https://example.org/1/1/1.png',
    )
    expect(refused.ok).toBe(false)
    expect(tiles.seen).toHaveLength(1)
  } finally {
    await app.close()
    await tiles.close()
  }
})

test('maps follow-ups: PDF site plan, row places picker, snapshot, map on the presentation window', async () => {
  test.setTimeout(120_000)
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-e2e-maps2-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir: dir,
      name: 'Maps follow-ups',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Smoke at the gate',
    })
    const msel = FIXTURE.msel.map((r) => ({ ...r, placeIds: r.id === 'I-01' ? ['gate'] : [] }))
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, msel, id: empty.id, projectId: empty.projectId },
    })

    // A page of a PDF becomes the site plan: plan.png for display, source.pdf kept.
    const pdf = join(dir, 'terminal.pdf')
    writeFileSync(pdf, buildPdf([{ lines: [{ text: 'Level 1', size: 24 }] }]))
    const added = await invoke<Maps & { mapId: string }>('maps:import-plan', {
      projectPath,
      filePath: pdf,
      title: 'Terminal PDF',
      page: 1,
    })
    const layer = added.maps.maps[0] as { image: string; source: string; width: number }
    expect(layer.image).toMatch(/plan\.png$/)
    expect(layer.source).toMatch(/source\.pdf$/)
    expect(readFileSync(join(projectPath, layer.image)).subarray(1, 4).toString()).toBe('PNG')
    const place = (id: string, label: string, kind: string, x: number, y: number) => ({
      id,
      label,
      kind,
      note: '',
      positions: [{ mapId: added.mapId, x, y }],
    })
    await invoke('maps:save', {
      projectPath,
      revision: added.revision,
      maps: {
        ...added.maps,
        places: [
          place('gate', 'Gate A1', 'incident', 20, 30),
          place('eoc', 'EOC', 'command', 70, 60),
        ],
      },
    })

    // The MSEL row menu opens the places picker, which saves the ticked place.
    const key = encodeURIComponent(projectPath)
    await goTo(page, `#/p/${key}/scenarios/${empty.id}`)
    await page.getByRole('tab', { name: /^MSEL/ }).click()
    await page.getByRole('button', { name: 'Actions for I-06', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Places…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Places for I-06' })
    await dialog.getByRole('checkbox', { name: 'EOC' }).check()
    const found = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .include('[role="dialog"]')
      .analyze()
    expect(found.violations.map((v) => v.id)).toEqual([])
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    // A snapshot of the plan is a PNG made with the map_annotation template. Nothing is
    // delivered, so the room view has no markers; the facilitator view has them.
    const request = { projectPath, scenarioId: empty.id, mapId: added.mapId }
    await expect(invoke('maps:snapshot', { ...request, audience: 'room' })).rejects.toThrow(
      /No places to show/,
    )
    const snap = await invoke<{ path: string }>('maps:snapshot', {
      ...request,
      audience: 'facilitator',
    })
    expect(snap.path).toMatch(/^\.cache\/maps\/[0-9a-f]{24}\.png$/)
    expect(readFileSync(join(projectPath, snap.path)).subarray(1, 4).toString()).toBe('PNG')

    // The presentation window opens on the map and closes cleanly.
    await invoke('facilitator:present-map', request)
    expect(await invoke<{ open: boolean }>('facilitator:present-status', undefined)).toEqual({
      open: true,
    })
    await invoke('facilitator:close-present', undefined)
  } finally {
    await app.close()
  }
})

test('maps on devices: the player page shows the shared plan and its places, then drops it', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const controller = await HarnessController.create({
    crypto: createWebCryptoProvider(),
    scenarioTitle: 'Smoke at the gate',
    sessionName: 'Map rehearsal',
  })
  const harness = await startHarness({ controller })
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } })
  try {
    const page = await context.newPage()
    await page.goto(harness.invite('players'))
    await page.getByRole('radio', { name: /Operations Director/ }).check()
    await page.getByRole('button', { name: 'Join exercise' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()

    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(page.getByText('No map is being shared right now.')).toBeVisible()

    const image = await controller.client.putBlob(
      { kind: 'image', mime: 'image/png', name: 'Terminal', width: 8, height: 8 },
      new Uint8Array(solidPng(8, [30, 90, 160, 255])),
    )
    const state = {
      mapId: 'terminal',
      title: 'Terminal',
      mapKind: 'site_plan',
      image,
      alt: 'Site plan Terminal with 1 place',
      pins: [{ label: 'Gate A1', detail: 'I-01', kind: 'incident', x: 20, y: 30 }],
      targets: ['all'],
    }
    const send = (payload: object) =>
      controller.client.send('map.state', 'all', payload as never, { key: 'players', sign: true })
    await send(state)
    await expect(page.getByRole('heading', { level: 1, name: 'Terminal' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Gate A1' })).toContainText('I-01')
    const picture = page.locator('.pmap__img')
    await expect(picture).toBeVisible()
    expect(await picture.getAttribute('src')).toMatch(/^blob:/)
    const found = await new AxeBuilder({ page }).setLegacyMode(true).analyze()
    expect(found.violations.map((v) => v.id)).toEqual([])

    await send({ ...state, pins: [], closed: true })
    await expect(page.getByText('No map is being shared right now.')).toBeVisible()
  } finally {
    await context.close()
    await harness.close()
  }
})
