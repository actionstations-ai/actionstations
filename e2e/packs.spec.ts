// Packs end to end (#273), against the built app (`pnpm build:app`): install from a file through
// the review, the pack template badged and used in a project that keeps rendering after the pack
// is uninstalled, a local catalog on 127.0.0.1 (refresh, install, update, then Update from pack
// for a project's copy of the template), malicious archives
// refused, an example opened from a pack, and Export as pack round-tripped through an install.
// Every launch gets its own userData, TTX_HEADLESS=1, mock providers and TTX_APP_VERSION=0.3.0
// (the unpackaged-only stand-in for the release the fixture packs need).
//
// No request leaves 127.0.0.1: every launch records the main process's outbound traffic from its
// first line of code (e2e/net-recorder.cjs, loaded with `-r`: fetch, http(s) and TCP sockets)
// and Chromium's (`--log-net-log`: every URL any session requests, renderer and net.fetch). After
// each app closes, every recorded host must be loopback.
//
// GUIDE_SHOTS=1 also writes the user-guide screenshots to docs/guides/images/packs/ (1440 × 900,
// like the other guide images), from the fixture pack and fictional names only.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch, openProjectSettings, waitForJob } from './helpers'
import { PACK_FIXTURES, buildPack, validPackTree } from '../tests/fixtures/packs/build'
import {
  bytes,
  catalogBody,
  catalogEntry,
  json,
  sha256,
  startServer,
} from '../src/main/packs/test-server'

test.setTimeout(180_000)

const PACK_ID = 'ai.actionstations.freight-rail'
const PACK_NAME = 'Freight Rail Operations'
const SHOTS = process.env.GUIDE_SHOTS === '1'
const SHOTS_DIR = resolve('docs/guides/images/packs')
const RECORDER = resolve('e2e/net-recorder.cjs')
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1'])

const SCENARIO = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown> & { msel: { id: string }[] }

type Invoke = ReturnType<typeof invoker>

interface PacksApp {
  app: ElectronApplication
  page: Page
  userData: string
  invoke: Invoke
  /** Close the app, then check the network logs of the run. */
  close: () => Promise<NetRecord[]>
}

interface NetRecord {
  via: string
  host?: string
  origin?: string
  url?: string
}

const fresh = (prefix: string) => mkdtempSync(join(tmpdir(), `ttx-packs-${prefix}-`))
/** Where the exported pack is saved: a short path for the Share screenshot. */
const exportDir = () =>
  SHOTS && process.platform !== 'win32' ? mkdtempSync('/tmp/packs-') : fresh('export-out')

/** Every host the app talked to, from both logs. */
function readNetLogs(dir: string): NetRecord[] {
  const node = join(dir, 'node.jsonl')
  const records: NetRecord[] = existsSync(node)
    ? readFileSync(node, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as NetRecord)
    : []
  expect(
    records.some((r) => r.via === 'start'),
    'the recorder ran in the main process',
  ).toBe(true)
  const chromium = join(dir, 'chromium.json')
  expect(existsSync(chromium), 'Chromium wrote its network log').toBe(true)
  for (const m of readFileSync(chromium, 'utf8').matchAll(/"url":"([^"]+)"/g))
    records.push({ via: 'chromium', url: m[1]! })
  return records
}

/** The host a record reached, or undefined for local pipes and the app's own schemes. */
function hostOf(r: NetRecord): string | undefined {
  const url = r.url ?? r.origin
  if (url) {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ws:'
      ? u.hostname
      : undefined
  }
  return r.host ?? undefined
}

/** Fails with the offending records when any host is not loopback. */
function expectLoopbackOnly(records: NetRecord[]) {
  const remote = records
    .filter((r) => r.via !== 'start')
    .filter((r) => {
      const host = hostOf(r)
      return host !== undefined && !LOOPBACK.has(host)
    })
  expect(remote, 'requests that left 127.0.0.1').toEqual([])
}

async function launchPacks(prefix: string, env: Record<string, string> = {}): Promise<PacksApp> {
  const logs = fresh(`${prefix}-net`)
  const { app, page, userData } = await launch(
    {
      TTX_MOCK_PROVIDERS: '1',
      TTX_APP_VERSION: '0.3.0',
      TTX_NET_LOG: join(logs, 'node.jsonl'),
      ...env,
    },
    { args: ['-r', RECORDER, `--log-net-log=${join(logs, 'chromium.json')}`] },
  )
  if (SHOTS)
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
    )
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 })
  let closed: NetRecord[] | undefined
  return {
    app,
    page,
    userData,
    invoke: invoker(page),
    close: async () => {
      if (closed) return closed
      await app.close()
      closed = readNetLogs(logs)
      expectLoopbackOnly(closed)
      return closed
    },
  }
}

/** A guide screenshot (GUIDE_SHOTS=1 only), without leftover notifications. */
async function shot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS_DIR, { recursive: true })
  await page
    .locator('.toast')
    .evaluateAll((els) =>
      els.forEach((e) => ((e as unknown as { style: { display: string } }).style.display = 'none')),
    )
  await page.evaluate(() =>
    (
      globalThis as unknown as { document: { activeElement?: { blur?: () => void } } }
    ).document.activeElement?.blur?.(),
  )
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`), scale: 'css' })
}

/** The next native open dialog returns these paths. */
async function stubOpenDialog(app: ElectronApplication, paths: string[]) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: p })) as never
  }, paths)
}

async function stubSaveDialog(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never
  }, path)
}

async function writePack(dir: string, name: string, buf: Promise<Buffer> | Buffer) {
  const path = join(dir, name)
  writeFileSync(path, await buf)
  return path
}

const railPack = (version = '1.0.0') =>
  buildPack(undefined, {
    manifest: (m) => {
      m.version = version
    },
  })

async function openPacks(page: Page) {
  await goTo(page, '#/packs')
  await expect(page.getByRole('heading', { level: 1, name: 'Packs' })).toBeVisible()
}

/** packs:list without the packs included with the app (ADR-0020). */
async function installedPacks<T>(invoke: Invoke): Promise<T[]> {
  return (await invoke<(T & { bundled?: boolean })[]>('packs:list')).filter((p) => !p.bundled)
}

async function installByIpc(invoke: Invoke, file: string) {
  await invoke('packs:install', { path: file, source: { kind: 'file', name: 'rail.aspack' } })
}

async function newProject(invoke: Invoke, name: string, orgType: string) {
  const parentDir = fresh('project')
  const { path } = await invoke<{ path: string }>('project:create', { parentDir, name, orgType })
  return { path, key: encodeURIComponent(path) }
}

test('install from a file: review shows contents and licenses, the template gets a pack badge', async () => {
  const dir = fresh('install')
  const file = await writePack(dir, 'freight-rail-1.0.0.aspack', railPack())
  const p = await launchPacks('install')
  try {
    await openPacks(p.page)
    await expect(p.page.getByText('No packs installed')).toBeVisible()
    await shot(p.page, 'packs-installed-empty')

    await p.page.getByRole('tab', { name: 'Browse' }).click()
    await expect(
      p.page.getByRole('button', { name: 'Add the official catalog (actionstations.ai)' }),
    ).toBeVisible()
    await shot(p.page, 'packs-browse-official')
    await p.page.getByRole('tab', { name: 'Installed' }).click()

    await stubOpenDialog(p.app, [file])
    await p.page.getByRole('button', { name: 'Install from file…' }).first().click()
    const review = p.page.getByRole('region', { name: new RegExp(PACK_NAME) })
    await expect(review.getByText('Review before installing')).toBeVisible()
    // Facts, every kind of content, and every document with its license.
    await expect(review.getByText(PACK_ID, { exact: true })).toBeVisible()
    await expect(review.getByText('CC-BY-4.0').first()).toBeVisible()
    const contents = review.getByRole('region', { name: 'Contents' })
    for (const id of [
      'rail_dispatch_board',
      'inject_text',
      'freight_rail',
      'yard-cctv-still',
      'rail-emergency-plan',
      'harbor-junction',
    ])
      await expect(contents.getByText(id, { exact: true })).toBeVisible()
    const licenses = review.getByRole('table')
    await expect(
      licenses.getByRole('row', { name: /Railroad Emergency Response Plan.*CC-BY-4\.0/ }),
    ).toBeVisible()
    await expect(
      licenses.getByRole('row', { name: /Hazmat release quick reference.*CC0-1\.0/ }),
    ).toBeVisible()
    await expect(review.getByText('Needs custom nodes')).toBeVisible()
    await shot(p.page, 'packs-review')

    await review.getByRole('button', { name: 'Install', exact: true }).click()
    const row = p.page.getByRole('listitem', { name: new RegExp(PACK_NAME) })
    await expect(row).toContainText('1.0.0')
    await expect(row).toContainText('Enabled')
    await shot(p.page, 'packs-installed')

    await goTo(p.page, '#/templates')
    // The pack's domain profile is a domain filter like the built-in ones.
    await p.page
      .getByRole('group', { name: 'Category' })
      .getByRole('button', { name: 'Operational displays' })
      .click()
    await p.page
      .getByRole('group', { name: 'Domain' })
      .getByRole('button', { name: 'Freight rail' })
      .click()
    const badge = p.page.getByRole('img', { name: new RegExp(`From pack ${PACK_NAME} 1\\.0\\.0`) })
    await expect(badge.first()).toBeVisible({ timeout: 15_000 })
    await expect(badge.first()).toContainText(`Pack: ${PACK_NAME} 1.0.0`)
    await expect(p.page.getByText('Rendering…')).toHaveCount(0, { timeout: 30_000 })
    await badge.first().evaluate((el) =>
      (el as unknown as { scrollIntoView: (o: object) => void }).scrollIntoView({
        block: 'center',
      }),
    )
    await shot(p.page, 'templates-pack-badge')
  } finally {
    await p.close()
  }
})

/** A freight-rail project with one dispatch board inject (which copies the pack template). */
async function projectWithBoardInject(invoke: Invoke) {
  const project = await newProject(invoke, 'Lakeshore Junction Railroad', 'freight_rail')
  const scenario = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
    projectPath: project.path,
    title: 'Yard switch failure',
  })
  await invoke('scenarios:save', {
    projectPath: project.path,
    scenario: { ...SCENARIO, id: scenario.id, projectId: scenario.projectId },
  })
  await invoke('injects:create', {
    projectPath: project.path,
    scenarioId: scenario.id,
    mselRowId: SCENARIO.msel[0]!.id,
    type: 'rail_dispatch_board',
  })
  expect(
    existsSync(join(project.path, 'templates/injects/rail_dispatch_board/template.html')),
  ).toBe(true)
  return project
}

test('a project uses the pack template and still renders it after the pack is uninstalled', async () => {
  const dir = fresh('use')
  const p = await launchPacks('use')
  try {
    await installByIpc(p.invoke, await writePack(dir, 'rail.aspack', railPack()))
    const project = await newProject(p.invoke, 'Lakeshore Junction Railroad', 'freight_rail')
    const scenario = await p.invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath: project.path,
      title: 'Yard switch failure',
    })
    // Any complete scenario will do; the inject below is what uses the pack template.
    await p.invoke('scenarios:save', {
      projectPath: project.path,
      scenario: { ...SCENARIO, id: scenario.id, projectId: scenario.projectId },
    })
    const inject = await p.invoke<Record<string, unknown> & { id: string }>('injects:create', {
      projectPath: project.path,
      scenarioId: scenario.id,
      mselRowId: SCENARIO.msel[0]!.id,
      type: 'rail_dispatch_board',
    })
    const preview = JSON.parse(
      validPackTree()['templates/rail_dispatch_board/preview.json'] as string,
    ) as { fields: Record<string, unknown> }
    await p.invoke('injects:save', {
      projectPath: project.path,
      scenarioId: scenario.id,
      inject: { ...inject, fields: preview.fields },
    })
    const render = () =>
      p.invoke<{ path: string }[]>('render:inject', {
        projectPath: project.path,
        scenarioId: scenario.id,
        injectId: inject.id,
      })
    const before = await render()
    expect(before.length).toBeGreaterThan(0)
    // Copy-on-use: the template now lives in the project, recorded in packs.json.
    expect(
      existsSync(join(project.path, 'templates/injects/rail_dispatch_board/template.html')),
    ).toBe(true)
    const copies = JSON.parse(readFileSync(join(project.path, 'packs.json'), 'utf8')) as {
      copies: { kind: string; id: string; packId: string }[]
    }
    expect(copies.copies).toContainEqual(
      expect.objectContaining({ kind: 'templates', id: 'rail_dispatch_board', packId: PACK_ID }),
    )

    // The documents of the pack, offered on the project's Documents screen.
    await goTo(p.page, `#/p/${project.key}/documents`)
    await p.page.getByRole('button', { name: /Add from pack/ }).click()
    const dialog = p.page.getByRole('dialog', { name: 'Add documents from packs' })
    await expect(dialog.getByText('Railroad Emergency Response Plan (template)')).toBeVisible()
    await expect(dialog.getByText(/License CC0-1\.0/)).toBeVisible()
    await shot(p.page, 'documents-add-from-pack')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await openPacks(p.page)
    await p.page.getByRole('button', { name: `Uninstall ${PACK_NAME}` }).click()
    const confirm = p.page.getByRole('dialog', { name: `Uninstall ${PACK_NAME}?` })
    await confirm.getByRole('button', { name: 'Uninstall', exact: true }).click()
    await expect(p.page.getByText('No packs installed')).toBeVisible()
    expect(await installedPacks(p.invoke)).toEqual([])

    const after = await render()
    expect(after.length).toBeGreaterThan(0)
    for (const a of after) expect(existsSync(join(project.path, a.path))).toBe(true)
    const templates = await p.invoke<
      { type: string; source: string; copy?: { packMissing?: boolean } }[]
    >('templates:list', { projectPath: project.path })
    expect(templates.find((t) => t.type === 'rail_dispatch_board')).toMatchObject({
      source: 'project',
      copy: { packMissing: true },
    })
  } finally {
    await p.close()
  }
})

test('a local catalog: add, refresh, install, update; no request leaves 127.0.0.1', async () => {
  const server = await startServer()
  const v1 = await railPack('1.0.0')
  const v2 = await railPack('1.1.0')
  const entry = (version: string, buf: Buffer) =>
    catalogEntry({
      id: PACK_ID,
      name: PACK_NAME,
      version,
      summary: 'Freight rail domain, dispatch board, prompt, workflow, documents and an example.',
      author: { name: 'Action Stations' },
      kinds: ['templates', 'prompts', 'domains', 'workflows', 'documents', 'examples'],
      size: buf.length,
      sha256: sha256(buf),
      url: server.url(`/files/${PACK_ID}-${version}.aspack`),
    })
  server.route(`/files/${PACK_ID}-1.0.0.aspack`, bytes(v1))
  server.route(`/files/${PACK_ID}-1.1.0.aspack`, bytes(v2))
  server.route(
    '/index.json',
    json(catalogBody([entry('1.0.0', v1)], { name: 'Rail Yard Catalog' })),
  )
  const p = await launchPacks('catalog')
  let records: NetRecord[]
  try {
    await openPacks(p.page)
    await p.page.getByRole('tab', { name: 'Browse' }).click()
    await p.page.getByLabel('Catalog URL').fill(server.url('/index.json'))
    await p.page.getByRole('button', { name: 'Add catalog' }).click()

    const card = p.page.getByRole('listitem').filter({ hasText: PACK_NAME })
    await expect(card).toContainText('From Rail Yard Catalog', { timeout: 15_000 })
    await card.getByRole('button', { name: /^Review and install/ }).click()
    const review = p.page.getByRole('region', { name: new RegExp(PACK_NAME) })
    await expect(review.getByText('Matches the sha256 the catalog lists.')).toBeVisible({
      timeout: 15_000,
    })
    await review.getByRole('button', { name: 'Install', exact: true }).click()
    const row = p.page.getByRole('listitem', { name: new RegExp(PACK_NAME) })
    await expect(row).toContainText('1.0.0')
    // A project copies the pack's dispatch board when an inject of that type is created.
    const project = await projectWithBoardInject(p.invoke)

    // The catalog publishes 1.1.0; Refresh shows the update.
    server.route(
      '/index.json',
      json(catalogBody([entry('1.1.0', v2)], { name: 'Rail Yard Catalog' })),
    )
    await p.page.getByRole('tab', { name: 'Browse' }).click()
    await p.page.getByRole('button', { name: 'Refresh' }).click()
    await expect(card).toContainText('Update available (have 1.0.0)', { timeout: 15_000 })
    await card.getByRole('button', { name: /^Review update to 1\.1\.0/ }).click()
    await review.getByRole('button', { name: 'Update to 1.1.0' }).click({ timeout: 15_000 })
    await expect(row).toContainText('1.1.0')
    const list = await installedPacks<{ id: string; version: string }>(p.invoke)
    expect(list.map((x) => `${x.id}@${x.version}`)).toEqual([`${PACK_ID}@1.1.0`])

    // The project's copy shows Update available; Update from pack replaces it (#310).
    await goTo(p.page, `#/p/${project.key}/documents`) // opens the project
    await expect(p.page.getByRole('button', { name: /Add from pack/ })).toBeVisible()
    await goTo(p.page, '#/templates?type=rail_dispatch_board')
    const detail = p.page.getByRole('region', { name: 'Rail dispatch board' })
    await expect(
      detail.getByRole('img', { name: /update available \(1\.1\.0 installed\)/ }),
    ).toBeVisible({ timeout: 15_000 })
    await detail.getByRole('button', { name: 'Update from pack' }).click()
    await expect(
      detail.getByRole('img', { name: `Project copy from pack ${PACK_NAME} 1.1.0` }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(detail.getByRole('button', { name: 'Update from pack' })).toHaveCount(0)
    const copies = JSON.parse(readFileSync(join(project.path, 'packs.json'), 'utf8')) as {
      copies: { kind: string; id: string; version: string }[]
    }
    expect(copies.copies).toContainEqual(
      expect.objectContaining({ kind: 'templates', id: 'rail_dispatch_board', version: '1.1.0' }),
    )
    expect(server.hits).toEqual(
      expect.arrayContaining([
        '/index.json',
        `/files/${PACK_ID}-1.0.0.aspack`,
        `/files/${PACK_ID}-1.1.0.aspack`,
      ]),
    )
  } finally {
    records = await p.close()
    await server.close()
  }
  // The recorder saw the catalog traffic (so an empty "remote" list means something).
  const port = new URL(server.base).port
  expect(
    records.some((r) => r.via === 'fetch' && r.origin === `http://127.0.0.1:${port}`),
    'the network recorder saw the catalog fetch',
  ).toBe(true)
})

for (const name of ['zip-slip', 'template-script'] as const) {
  test(`a malicious pack (${name}) is refused with a message; nothing is installed`, async () => {
    const dir = fresh(name)
    const file = await writePack(dir, `${name}.aspack`, PACK_FIXTURES[name]!.build())
    const p = await launchPacks(name)
    try {
      await openPacks(p.page)
      await stubOpenDialog(p.app, [file])
      await p.page.getByRole('button', { name: 'Install from file…' }).first().click()
      const refused = p.page.getByRole('region', { name: 'This pack cannot be installed' })
      await expect(refused).toBeVisible()
      await expect(refused.getByRole('listitem').first()).toHaveText(PACK_FIXTURES[name]!.expect)
      await expect(p.page.getByRole('button', { name: 'Install', exact: true })).toHaveCount(0)
      await refused.getByRole('button', { name: 'Back' }).click()
      await expect(p.page.getByText('No packs installed')).toBeVisible()
      expect(await installedPacks(p.invoke)).toEqual([])
      const packsDir = join(p.userData, 'packs')
      const left = existsSync(packsDir) ? readdirSync(packsDir) : []
      expect(left.filter((f) => f.startsWith('ai.'))).toEqual([])
      for (const at of [join(p.userData, 'evil.md'), join(p.userData, 'packs', 'evil.md')])
        expect(existsSync(at)).toBe(false)
    } finally {
      await p.close()
    }
  })
}

test('included packs: the airport pack turns off, the core cannot; an airport project still renders', async () => {
  const p = await launchPacks('included')
  try {
    // A project on the airport domain, created while the Airports pack is on.
    const airport = await newProject(p.invoke, 'North Coast International Airport', 'airport')
    await openPacks(p.page)
    const included = p.page.getByRole('region', { name: 'Included with the app' })
    const core = included.getByRole('listitem', { name: /Action Stations Core/ })
    await expect(core.getByRole('switch', { name: 'Enabled' })).toBeDisabled()
    await expect(core).toContainText('Always on')
    await expect(core.getByRole('button', { name: /Uninstall/ })).toHaveCount(0)
    const row = included.getByRole('listitem', { name: /^Airports/ })
    await expect(row).toContainText('Included with the app')
    await row.getByRole('switch', { name: 'Enabled' }).click()
    await expect(row).toContainText('Disabled')
    await shot(p.page, 'packs-included')

    // Gone from the domain picker of a new project…
    await goTo(p.page, '#/projects')
    await p.page.getByRole('button', { name: 'New project' }).click()
    const dialog = p.page.getByRole('dialog', { name: 'New project' })
    await dialog.getByRole('combobox', { name: 'Domain' }).fill('airport')
    await expect(dialog.getByRole('option', { name: /^Unmanned/ })).toHaveCount(1)
    await expect(dialog.getByRole('option', { name: /^Airport/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    // …and from the Templates gallery and the examples.
    const templates = await p.invoke<{ type: string; hidden?: boolean }[]>('templates:list')
    expect(templates.find((t) => t.type === 'fids_board')?.hidden).toBe(true)
    const examples = await p.invoke<{ slug: string }[]>('examples:list')
    expect(examples.map((e) => e.slug)).not.toContain('airport-ncia')

    // The airport project keeps its profile and still renders the airport templates.
    const got = await p.invoke<{ project: { orgType: string } }>('project:get', {
      path: airport.path,
    })
    expect(got.project.orgType).toBe('airport')
    const fids = (
      await p.invoke<{ type: string; preview: Record<string, unknown>; packId?: string }[]>(
        'templates:list',
        { projectPath: airport.path },
      )
    ).find((t) => t.type === 'fids_board')!
    expect(fids.packId).toBe('ai.actionstations.airport')
    const shot2 = await p.invoke<{ dataUrl: string; width: number }>('render:preview', {
      type: 'fids_board',
      fields: fids.preview,
      projectPath: airport.path,
    })
    expect(shot2.dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(shot2.width).toBeGreaterThan(0)
    await goTo(p.page, `#/p/${airport.key}`)
    await openProjectSettings(p.page)
    await expect(p.page.getByRole('option', { selected: true })).toHaveText(/^Airport/)
  } finally {
    await p.close()
  }
})

test('an example from a pack opens as a project with its pack shown', async () => {
  const dir = fresh('example')
  const parent = fresh('example-copies')
  const p = await launchPacks('example')
  try {
    await installByIpc(p.invoke, await writePack(dir, 'rail.aspack', railPack()))
    await goTo(p.page, '#/projects')
    const card = p.page.locator('li.example-card').filter({ hasText: 'Harbor Junction' })
    await expect(card.getByTestId('example-pack')).toContainText(`Pack: ${PACK_NAME} 1.0.0`)
    await card.getByRole('button', { name: /Open a copy of Harbor Junction/ }).click()
    const dialog = p.page.getByRole('dialog', { name: /Harbor Junction/ })
    await dialog.getByLabel('Copy into').fill(parent)
    await dialog.getByRole('button', { name: 'Copy and open' }).click()
    const banner = p.page.getByTestId('example-banner')
    await expect(banner).toContainText('Example: Harbor Junction Terminal Railroad', {
      timeout: 20_000,
    })
    await expect(banner.getByRole('img', { name: new RegExp(PACK_NAME) })).toBeVisible()
    const copies = readdirSync(parent)
    expect(copies).toHaveLength(1)
    expect(existsSync(join(parent, copies[0]!, 'project.json'))).toBe(true)
  } finally {
    await p.close()
  }
})

test('export as pack: the wizard builds a pack that installs back', async () => {
  const dir = fresh('export')
  const p = await launchPacks('export')
  try {
    // A global prompt override and a project with one document: the author's own content.
    const promptsDir = join(p.userData, 'prompts')
    mkdirSync(promptsDir, { recursive: true })
    writeFileSync(
      join(promptsDir, 'inject_text.md'),
      readFileSync(resolve('prompts/inject_text.md'), 'utf8') + '\nWrite for a ferry operator.\n',
    )
    const project = await newProject(p.invoke, 'Lakeshore Ferry Authority', 'transit')
    const doc = join(dir, 'ferry-operations-plan.md')
    writeFileSync(
      doc,
      '# Lakeshore Ferry Authority operations plan\n\nVessel dispatch, terminal security and the passenger notification desk.\n',
    )
    const { jobId } = await p.invoke<{ jobId: string }>('documents:import', {
      projectPath: project.path,
      filePaths: [doc],
    })
    await waitForJob(p.invoke, jobId)

    await openPacks(p.page)
    await p.page.getByRole('button', { name: 'Export as pack…' }).click()
    await expect(p.page.getByRole('heading', { level: 1, name: 'Export as pack' })).toBeVisible()
    const step = (label: string) => p.page.getByRole('region', { name: label })
    const next = p.page.getByRole('button', { name: 'Next' })

    // 1. Items
    const items = step('Items').or(p.page.locator('.pe-body'))
    await items.getByRole('checkbox', { name: /inject_text/ }).check()
    await items.getByLabel('Project').selectOption(project.path)
    await items.getByRole('checkbox', { name: /operations plan/ }).check()
    await next.click()

    // 2. Metadata
    await p.page.getByLabel('Name', { exact: true }).fill('Lakeshore Ferry Starter')
    await p.page.getByLabel('Pack id').fill('org.example.lakeshore-ferry')
    await p.page.getByLabel('Version').fill('1.0.0')
    await p.page.getByLabel('Summary').fill('A ferry prompt and an operations plan.')
    await p.page.getByLabel('Author', { exact: true }).fill('Lakeshore Exercise Team')
    await next.click()

    // 3. Licenses
    await p.page.getByRole('radio', { name: /CC-BY-4\.0/ }).check()
    // A license field with a datalist of common licenses (a combobox).
    await p.page.getByRole('combobox', { name: /operations plan/ }).fill('CC-BY-4.0')
    await p.page.getByRole('checkbox', { name: /I made this content/ }).check()
    await shot(p.page, 'pack-export-licenses')
    await next.click()

    // 4. Review: main builds the pack and runs the reader on it.
    await expect(p.page.getByText('org.example.lakeshore-ferry-1.0.0.aspack')).toBeVisible({
      timeout: 30_000,
    })
    await expect(next).toBeEnabled()
    await next.click()

    // 5. Save, 6. Share
    const saved = join(exportDir(), 'org.example.lakeshore-ferry-1.0.0.aspack')
    await stubSaveDialog(p.app, saved)
    await p.page.getByRole('button', { name: 'Save pack…' }).click()
    await expect(p.page.getByText(`Saved ${saved}.`)).toBeVisible({ timeout: 30_000 })
    await expect(p.page.getByRole('button', { name: 'Open the contribution page' })).toBeVisible()
    await shot(p.page, 'pack-export-share')
    expect(existsSync(saved)).toBe(true)

    // Round trip: the saved file goes through the same review and installs.
    await p.page.getByRole('button', { name: 'Done' }).click()
    await openPacks(p.page)
    await stubOpenDialog(p.app, [saved])
    await p.page.getByRole('button', { name: 'Install from file…' }).first().click()
    const review = p.page.getByRole('region', { name: /Lakeshore Ferry Starter/ })
    await expect(review.getByText('Review before installing')).toBeVisible()
    await review.getByRole('button', { name: 'Install', exact: true }).click()
    await expect(p.page.getByRole('listitem', { name: /Lakeshore Ferry Starter/ })).toContainText(
      'Enabled',
    )
    const list = await installedPacks<{
      id: string
      license?: string
      items: { kind: string; id: string }[]
    }>(p.invoke)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'org.example.lakeshore-ferry', license: 'CC-BY-4.0' })
    expect(list[0]!.items.map((i) => i.kind).sort()).toEqual(['documents', 'prompts'])
  } finally {
    await p.close()
  }
})
