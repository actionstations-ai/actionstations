// Accessibility pass (#49): axe-core (WCAG 2.0/2.1/2.2 A + AA, plus best practices) on every
// screen in light and dark; targeted keyboard checks (visible focus on every tab stop, no
// traps, dialogs return focus); a 200 % zoom check for clipped controls; a keyboard-only
// walkthrough (create → import → generate → edit → export); and empty / error states. A
// populated project (documents, a scenario with rendered injects) is seeded through IPC with
// the mock provider. Screenshots and JSON reports go to .tmp/a11y/ (test-results/ is wiped by
// Playwright). A11Y_REPORT=1 records violations without failing, for audits.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'
import { buildPack } from '../tests/fixtures/packs/build'

test.setTimeout(600_000)

// The probes below run in the renderer (page.evaluate); e2e compiles without the DOM lib, so
// declare the few browser globals they use, loosely typed, for this file only.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any
declare const getComputedStyle: (el: any) => any
type HTMLElement = any
type Element = any
/* eslint-enable @typescript-eslint/no-explicit-any */

const OUT = resolve('.tmp/a11y')
const REPORT_ONLY = process.env.A11Y_REPORT === '1'
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
const NCIA = [
  'reference/ncia/terminal-incident-response-plan-TIRP.md',
  'reference/ncia/airport-emergency-plan-AEP.md',
].map((f) => resolve(f))

type Invoke = ReturnType<typeof invoker>
interface Seeded {
  projectPath: string
  key: string
  scenarioId: string
  injectId: string
  /** An .aspack on disk (a newer version of the installed rail pack) for the review screen. */
  packPath: string
}

// Fixture packs need app 0.3.0 (unpackaged runs only); the Packs screens (#268) are audited
// with one pack installed, one installed disabled by a conflict, and a review open.
const A11Y_ENV = { TTX_MOCK_PROVIDERS: '1', TTX_APP_VERSION: '0.3.0' }
/** The app the current test launched (the pack review is opened from main). */
let activeApp: ElectronApplication | undefined

async function launchA11y() {
  const launched = await launch(A11Y_ENV)
  activeApp = launched.app
  return launched
}

/** Close a pack review left open by an earlier screen. */
async function packsHome(page: Page) {
  if (await page.getByText('Review before installing').isVisible())
    await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('tablist', { name: 'Packs' }).waitFor()
}

interface Screen {
  name: string
  hash: (s: Seeded) => string
  /** Wait for / open the state to audit after navigation. */
  prepare?: (page: Page, s: Seeded) => Promise<void>
}

const tab = (name: RegExp) => async (page: Page) => {
  await page.getByRole('tab', { name }).click()
  await page.waitForTimeout(400)
}

const SCREENS: Screen[] = [
  { name: 'projects', hash: () => '#/projects' },
  { name: 'project-overview', hash: (s) => `#/p/${s.key}` },
  { name: 'documents', hash: (s) => `#/p/${s.key}/documents` },
  {
    name: 'facility-facts',
    hash: (s) => `#/p/${s.key}/facts`,
    prepare: async (page) => {
      await page.getByRole('region', { name: 'Runways' }).waitFor()
      await page.getByText(/unknown-identifier warning|No scenarios to check/).waitFor()
    },
  },
  {
    name: 'document-detail',
    hash: (s) => `#/p/${s.key}/documents`,
    prepare: async (page) => {
      await page.getByRole('button', { name: /Show details for .*TIRP/ }).click()
      await page.waitForTimeout(500)
    },
  },
  {
    name: 'search',
    hash: (s) => `#/p/${s.key}/search`,
    prepare: async (page) => {
      await page.getByRole('searchbox').first().fill('FIDS failure')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(800)
    },
  },
  { name: 'generate-prompt', hash: (s) => `#/p/${s.key}/generate` },
  { name: 'generate-ideas', hash: (s) => `#/p/${s.key}/generate`, prepare: tab(/Give me ideas/) },
  { name: 'scenarios', hash: (s) => `#/p/${s.key}/scenarios` },
  { name: 'scenario-overview', hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}` },
  ...(
    [
      ['objectives', /^Objectives/],
      ['msel', /^MSEL/],
      ['injects', /^Injects/],
      ['documents', /^Documents/],
      ['rubric', /^Rubric/],
      ['warnings', /^Warnings/],
    ] as const
  ).map(([name, re]) => ({
    name: `scenario-${name}`,
    hash: (s: Seeded) => `#/p/${s.key}/scenarios/${s.scenarioId}`,
    prepare: tab(re),
  })),
  {
    name: 'inject-editor',
    hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}/injects/${s.injectId}`,
  },
  { name: 'export', hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}/export` },
  { name: 'facilitate', hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}/facilitate` },
  { name: 'present', hash: (s) => `#/present/${s.key}/${s.scenarioId}/${s.injectId}` },
  { name: 'prompts', hash: () => '#/prompts' },
  { name: 'providers', hash: () => '#/providers' },
  { name: 'project-providers', hash: (s) => `#/p/${s.key}/providers` },
  { name: 'workflows', hash: () => '#/workflows' },
  { name: 'templates', hash: () => '#/templates' },
  { name: 'settings', hash: () => '#/settings' },
  {
    // Local tools rows (#334): states, sizes, licenses and recommended models.
    name: 'settings-local-tools',
    hash: () => '#/settings',
    prepare: async (page) => {
      await page.getByRole('radio', { name: /A mix/ }).check()
      await page.getByRole('list', { name: 'Local tools' }).getByRole('listitem').first().waitFor()
      await page.getByRole('heading', { name: 'Recommended models' }).waitFor()
    },
  },
  {
    name: 'packs-installed',
    hash: () => '#/packs',
    prepare: async (page) => {
      await packsHome(page)
      await page.getByRole('listitem', { name: /Rail Twin/ }).waitFor()
    },
  },
  {
    name: 'packs-browse',
    hash: () => '#/packs?tab=browse',
    prepare: async (page) => {
      await packsHome(page)
      await page.getByRole('region', { name: 'Add a catalog to browse packs' }).waitFor()
    },
  },
  {
    name: 'packs-review',
    hash: () => '#/packs',
    prepare: async (page, s) => {
      // As if the .aspack were double-clicked in Finder: main forwards it as app:open-pack.
      await activeApp!.evaluate(({ BrowserWindow }, p) => {
        for (const w of BrowserWindow.getAllWindows())
          w.webContents.send('event:app:open-pack', { path: p })
      }, s.packPath)
      await page.getByRole('button', { name: /^Update to / }).waitFor()
    },
  },
  { name: 'welcome', hash: () => '#/welcome' },
]

async function goTo(page: Page, hash: string) {
  await page.evaluate((h) => {
    ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
  }, hash)
  await page.waitForTimeout(700)
}

/** Install the rail pack and a conflicting twin; write rail 1.1.0 for the review screen. */
async function seedPacks(invoke: Invoke, dir: string): Promise<string> {
  const write = async (name: string, buf: Promise<Buffer>) => {
    const path = join(dir, name)
    writeFileSync(path, await buf)
    return path
  }
  const rail = await write('rail-1.0.0.aspack', buildPack())
  const twin = await write(
    'rail-twin.aspack',
    buildPack(undefined, {
      manifest: (m) => {
        m.id = 'org.example.rail-twin'
        m.name = 'Rail Twin'
      },
    }),
  )
  for (const path of [rail, twin])
    await invoke('packs:install', { path, source: { kind: 'file', name: path.split('/').pop() } })
  return write(
    'rail-1.1.0.aspack',
    buildPack(undefined, {
      manifest: (m) => {
        m.version = '1.1.0'
      },
    }),
  )
}

async function seed(invoke: Invoke): Promise<Seeded> {
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-a11y-'))
  const { path: projectPath } = await invoke<{ path: string }>('project:create', {
    parentDir,
    name: 'North Coast International Airport',
    // The airport profile extracts runways (generic, the default since #156, does not).
    orgType: 'airport',
  })
  const { jobId } = await invoke<{ jobId: string }>('documents:import', {
    projectPath,
    filePaths: NCIA,
  })
  await expect
    .poll(async () => (await invoke<{ status: string }>('jobs:get', { jobId })).status, {
      timeout: 60_000,
    })
    .toBe('done')
  const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
    projectPath,
    title: 'Flight to Nowhere',
  })
  await invoke('scenarios:save', {
    projectPath,
    scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId },
  })
  const fields = (
    JSON.parse(readFileSync(resolve('templates/injects/fids_board/preview.json'), 'utf8')) as {
      fields: Record<string, unknown>
    }
  ).fields
  const created = await invoke<{ id: string }>('injects:create', {
    projectPath,
    scenarioId: empty.id,
    mselRowId: 'I-06',
    type: 'fids_board',
  })
  await invoke('injects:save', {
    projectPath,
    scenarioId: empty.id,
    inject: { ...created, fields },
  })
  await invoke('render:inject', { projectPath, scenarioId: empty.id, injectId: created.id })
  const packPath = await seedPacks(invoke, parentDir)
  return {
    packPath,
    projectPath,
    key: encodeURIComponent(projectPath),
    scenarioId: empty.id,
    injectId: created.id,
  }
}

interface Finding {
  screen: string
  theme: string
  id: string
  impact: string | null | undefined
  help: string
  nodes: { target: string; summary: string }[]
}

async function audit(page: Page, screen: string, theme: string): Promise<Finding[]> {
  const result = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  return result.violations.map((v) => ({
    screen,
    theme,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 8).map((n) => ({
      target: n.target.join(' '),
      summary: (n.failureSummary ?? '').split('\n').slice(0, 3).join(' | '),
    })),
  }))
}

function formatFindings(findings: Finding[]): string {
  return findings
    .map(
      (f) =>
        `[${f.theme}] ${f.screen}: ${f.id} (${f.impact}) ${f.help}\n` +
        f.nodes.map((n) => `    ${n.target} — ${n.summary}`).join('\n'),
    )
    .join('\n')
}

test('a11y: axe on every screen in light and dark', async () => {
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launchA11y()
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1280, height: 860 })
  const findings: Finding[] = []
  try {
    const seeded = await seed(invoke)
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      for (const screen of SCREENS) {
        await goTo(page, '#/projects')
        await goTo(page, screen.hash(seeded))
        await screen.prepare?.(page, seeded)
        await page.screenshot({ path: join(OUT, `${theme}-${screen.name}.png`) })
        findings.push(...(await audit(page, screen.name, theme)))
      }
    }
  } finally {
    writeFileSync(join(OUT, 'axe-report.json'), JSON.stringify(findings, null, 2))
    await app.close()
  }
  if (!REPORT_ONLY) expect(findings, formatFindings(findings)).toEqual([])
})

// ---- keyboard: visible focus on every tab stop, no traps -----------------------------------

interface FocusStop {
  key: string
  label: string
  indicator: boolean
  inViewport: boolean
}

/**
 * Describe the focused element and whether focus is visibly indicated: an outline, or a
 * box-shadow in the focus color on the element or an ancestor (focus-within rings).
 */
async function focusStop(page: Page): Promise<FocusStop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return null
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-focus)'
    document.body.appendChild(probe)
    const focusColor = getComputedStyle(probe).color
    probe.remove()
    const ringed = (e: Element) => {
      const s = getComputedStyle(e)
      const outline =
        s.outlineStyle !== 'none' &&
        parseFloat(s.outlineWidth) >= 1 &&
        !s.outlineColor.endsWith(', 0)')
      return outline || s.boxShadow.includes(focusColor)
    }
    let indicator = false
    for (let e: Element | null = el, depth = 0; e && depth < 4; e = e.parentElement, depth++) {
      if (ringed(e)) indicator = true
    }
    const r = el.getBoundingClientRect()
    const label = (
      el.getAttribute('aria-label') ||
      el.textContent ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      ''
    )
      .trim()
      .slice(0, 50)
    const path: string[] = []
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
      const idx = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0
      path.unshift(`${e.tagName}${idx}`)
    }
    return {
      key: path.join('>'),
      label: `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} "${label}"`,
      indicator,
      inViewport: r.width > 0 && r.height > 0,
    }
  })
}

interface KeyboardFinding {
  screen: string
  problem: string
  element: string
}

async function walkTabStops(page: Page, screen: string, max = 80): Promise<KeyboardFinding[]> {
  const out: KeyboardFinding[] = []
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const seen = new Map<string, number>()
  let repeats = 0
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const stop = await focusStop(page)
    if (!stop) {
      if (i > 0) break
      continue
    }
    if (seen.has(stop.key)) {
      repeats++
      if (repeats > 2) break
      continue
    }
    seen.set(stop.key, i)
    if (!stop.indicator) out.push({ screen, problem: 'no visible focus', element: stop.label })
    if (!stop.inViewport)
      out.push({ screen, problem: 'focus on invisible element', element: stop.label })
  }
  return out
}

test('a11y: keyboard focus is visible on every tab stop', async () => {
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launchA11y()
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1280, height: 860 })
  const findings: KeyboardFinding[] = []
  try {
    const seeded = await seed(invoke)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    for (const screen of SCREENS) {
      await goTo(page, '#/projects')
      await goTo(page, screen.hash(seeded))
      await screen.prepare?.(page, seeded)
      findings.push(...(await walkTabStops(page, screen.name)))
    }
  } finally {
    writeFileSync(join(OUT, 'keyboard-report.json'), JSON.stringify(findings, null, 2))
    await app.close()
  }
  if (!REPORT_ONLY)
    expect(findings.map((f) => `${f.screen}: ${f.problem} — ${f.element}`)).toEqual([])
})

// ---- 200 % zoom at 1280 px: no clipped controls, no page-level horizontal scroll ------------

interface ZoomFinding {
  screen: string
  problem: string
  element: string
}

async function clippedControls(page: Page, screen: string): Promise<ZoomFinding[]> {
  const found = await page.evaluate(() => {
    const out: { problem: string; element: string }[] = []
    const main = document.querySelector('main')
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth + 1) {
      const wide = [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1)
        .map((e) => `${e.tagName.toLowerCase()}.${e.className}`)
        .slice(-3)
      out.push({
        problem: 'window scrolls horizontally',
        element: `${doc.scrollWidth}px ${wide.join(', ')}`,
      })
    }
    if (main && main.scrollWidth > main.clientWidth + 1)
      out.push({
        problem: 'main pane scrolls horizontally',
        element: `${main.scrollWidth}px > ${main.clientWidth}px`,
      })
    const controls = document.querySelectorAll(
      'button, a[href], input, select, textarea, [role="tab"], [tabindex="0"]',
    )
    for (const el of controls) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (s.overflowX !== 'hidden' && s.overflowX !== 'clip') continue
        const pr = p.getBoundingClientRect()
        if (r.right > pr.right + 2 || r.left < pr.left - 2) {
          out.push({
            problem: 'control clipped by overflow',
            element: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}" in .${p.className}`,
          })
        }
        break
      }
    }
    return out
  })
  return found.map((f) => ({ screen, ...f }))
}

async function setZoom(app: ElectronApplication, factor: number) {
  await app.evaluate(({ BrowserWindow }, f) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.setZoomFactor(f)
  }, factor)
}

test('a11y: 200 % zoom keeps every control reachable', async () => {
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launchA11y()
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1280, height: 860 })
  const findings: ZoomFinding[] = []
  try {
    const seeded = await seed(invoke)
    await setZoom(app, 2)
    for (const screen of SCREENS) {
      await goTo(page, '#/projects')
      await goTo(page, screen.hash(seeded))
      await screen.prepare?.(page, seeded)
      await page.screenshot({ path: join(OUT, `zoom200-${screen.name}.png`) })
      findings.push(...(await clippedControls(page, screen.name)))
    }
  } finally {
    writeFileSync(join(OUT, 'zoom-report.json'), JSON.stringify(findings, null, 2))
    await app.close()
  }
  if (!REPORT_ONLY)
    expect(findings.map((f) => `${f.screen}: ${f.problem} — ${f.element}`)).toEqual([])
})

// ---- keyboard-only walkthrough: create → import → generate (mock) → edit → export ----------

/** Press Tab (or Shift+Tab) until `target` has focus; fails if it is not reachable. */
async function tabTo(page: Page, target: Locator, max = 160, back = false) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
  }
  throw new Error(`Not reachable with the keyboard: ${target.toString()}`)
}

/** Native file/folder pickers answer with these paths (keyboard users would pick them there). */
async function stubPicker(app: ElectronApplication, filePaths: string[]) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as never
  }, filePaths)
}

const focusedCol = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest('[data-col]')?.getAttribute('data-col'))

test('a11y: keyboard-only walkthrough from a new project to an export', async () => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1280, height: 860 })
  try {
    const parent = mkdtempSync(join(tmpdir(), 'ttx-a11y-kb-'))
    await invoke('settings:update', { defaultProjectsDir: parent })
    await goTo(page, '#/projects')
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Create the project.
    await tabTo(page, page.getByRole('button', { name: 'New project' }).first())
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'New project' })
    await expect(dialog.getByLabel('Project name')).toBeFocused()
    await page.keyboard.type('Keyboard Airport')
    await tabTo(page, dialog.getByRole('button', { name: 'Create project' }))
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: /Keyboard Airport/ })).toBeVisible()
    await expect(page).toHaveTitle(/Keyboard Airport · Action Stations/)

    // Import a plan (the native picker is stubbed to answer with it).
    await stubPicker(app, [NCIA[0]!])
    await tabTo(page, page.getByRole('link', { name: 'Documents', exact: true }), 200, true)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeFocused()
    await tabTo(page, page.getByRole('button', { name: /Import documents/ }).first())
    await page.keyboard.press('Enter')
    await expect(page.getByText('Indexed').first()).toBeVisible({ timeout: 60_000 })

    // Generate with the mock provider.
    await tabTo(page, page.getByRole('link', { name: 'Generate', exact: true }), 200, true)
    await page.keyboard.press('Enter')
    await tabTo(page, page.getByLabel('Threat or theme'))
    await page.keyboard.type('Ransomware on the FIDS during the morning bank')
    await tabTo(page, page.getByRole('button', { name: /Generate scenario/ }))
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 2, name: 'Generation log' })).toBeVisible()
    await expect(page.locator('.live-log .badge').first()).toHaveText('done', {
      timeout: 120_000,
    })
    await page.screenshot({ path: join(OUT, 'walkthrough-generated.png') })

    // Edit an MSEL event in the grid.
    const msel = page.getByRole('tab', { name: /^MSEL/ })
    await tabTo(page, page.getByRole('tab', { selected: true }))
    for (let i = 0; i < 6 && !(await msel.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    const grid = page.getByRole('grid', { name: 'Master Scenario Events List' })
    await tabTo(page, grid.locator('[tabindex="0"]').first())
    await page.keyboard.press('ControlOrMeta+Home')
    await page.keyboard.press('ArrowDown')
    for (let i = 0; i < 12 && (await focusedCol(page)) !== 'event'; i++)
      await page.keyboard.press('ArrowRight')
    expect(await focusedCol(page)).toBe('event')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('Edited with the keyboard only.')
    await page.keyboard.press('Enter')
    await expect(grid.getByText('Edited with the keyboard only.')).toBeVisible()
    await page.screenshot({ path: join(OUT, 'walkthrough-edited.png') })

    // Export.
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-a11y-out-'))
    await stubPicker(app, [outDir])
    await tabTo(page, page.getByRole('link', { name: /Export/ }), 300, true)
    await page.keyboard.press('Enter')
    await tabTo(page, page.getByRole('button', { name: 'Choose…' }))
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Output folder')).toHaveValue(outDir)
    await tabTo(page, page.getByRole('button', { name: 'Export', exact: true }))
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Wrote \d+ files to/)).toBeVisible({ timeout: 120_000 })
    await page.screenshot({ path: join(OUT, 'walkthrough-exported.png') })
  } finally {
    await app.close()
  }
})

// ---- dialogs: focus moves in, Escape closes, focus returns to the trigger ------------------

test('a11y: dialogs take focus, close on Escape and return focus', async () => {
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1280, height: 860 })
  try {
    const seeded = await seed(invoke)
    await goTo(page, '#/projects')
    const trigger = page.getByRole('button', { name: 'New project' }).first()
    await tabTo(page, trigger)
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'New project' })
    await expect(dialog).toBeVisible()
    // Tab stays inside the modal, and Escape leaves it.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    // A confirm dialog opened from a table row.
    await goTo(page, `#/p/${seeded.key}/documents`)
    const remove = page.getByRole('button', { name: /^Remove North Coast/ }).first()
    await tabTo(page, remove)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Remove document?' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(remove).toBeFocused()

    // The narrow-window menu: Escape closes it and returns focus to the Menu button.
    await setZoom(app, 2)
    await goTo(page, '#/settings')
    const menu = page.getByRole('button', { name: 'Menu' })
    await tabTo(page, menu, 40, true)
    await page.keyboard.press('Enter')
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(menu).toBeFocused()
  } finally {
    await app.close()
  }
})

// ---- empty and error states: a next step, readable messages, axe-clean, both themes --------

/** A provider nobody listens on (port 9, discard): every call fails as "unreachable". */
const DEAD_PROVIDER = {
  kind: 'openai-compatible',
  label: 'Offline server',
  baseUrl: 'http://127.0.0.1:9/v1',
  defaultModel: 'some-model',
  options: { timeoutMs: 2000 },
  enabled: true,
}

async function shootBothThemes(page: Page, name: string, findings: Finding[]) {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.screenshot({ path: join(OUT, `state-${theme}-${name}.png`) })
    findings.push(...(await audit(page, name, theme)))
  }
}

test('a11y: empty and error states tell the user what to do next', async () => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch()
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1280, height: 860 })
  const findings: Finding[] = []
  try {
    // Empty states.
    await goTo(page, '#/projects')
    await expect(page.getByText('No projects yet')).toBeVisible()
    await shootBothThemes(page, 'projects-empty', findings)
    await goTo(page, '#/providers')
    await expect(page.getByText('No providers yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add provider' }).last()).toBeVisible()
    await shootBothThemes(page, 'providers-empty', findings)
    await goTo(page, '#/workflows')
    await expect(page.getByRole('link', { name: 'Open Providers' })).toBeVisible()
    await shootBothThemes(page, 'workflows-empty', findings)

    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-a11y-states-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Empty Field Airport',
    })
    const key = encodeURIComponent(projectPath)
    await goTo(page, `#/p/${key}/documents`)
    await expect(page.getByText('No documents yet')).toBeVisible()
    await shootBothThemes(page, 'documents-empty', findings)
    await goTo(page, `#/p/${key}/scenarios`)
    await expect(page.getByText('No scenarios yet')).toBeVisible()
    await shootBothThemes(page, 'scenarios-empty', findings)

    // Error: the text model does not answer.
    const dead = await invoke<{ id: string }>('providers:upsert', { config: DEAD_PROVIDER })
    await invoke('routing:set', {
      scope: 'global',
      routing: {
        ideate: { providerId: dead.id },
        draft: { providerId: dead.id },
        critique: { providerId: dead.id },
        embed: { providerId: dead.id, model: 'some-embedder' },
      },
    })
    await goTo(page, `#/p/${key}/generate`)
    await page.getByRole('tab', { name: 'Give me ideas' }).click()
    await page
      .getByRole('button', { name: /Give me ideas/ })
      .last()
      .click()
    const textAlert = page.locator('.generate-error')
    await expect(textAlert).toContainText('Ideation (text model) via "Offline server" failed.', {
      timeout: 60_000,
    })
    await expect(textAlert).toContainText(
      "OpenAI-compatible server isn't responding at http://127.0.0.1:9. Start its server",
    )
    await expect(textAlert).not.toContainText('ECONNREFUSED')
    await expect(textAlert.getByRole('button', { name: /Retry/ })).toBeVisible()
    await shootBothThemes(page, 'generate-text-model-down', findings)

    // Error: document search (Embeddings via the routed provider) fails before the text model.
    await invoke('settings:update', { embeddings: { mode: 'provider' } })
    await goTo(page, '#/projects')
    await goTo(page, `#/p/${key}/generate`)
    await page.getByRole('tab', { name: 'Give me ideas' }).click()
    await page
      .getByRole('button', { name: /Give me ideas/ })
      .last()
      .click()
    await expect(textAlert).toContainText('Document search failed', { timeout: 60_000 })
    await expect(textAlert).not.toContainText('No text model')
    await expect(textAlert.getByRole('link', { name: 'Embedding settings' })).toBeVisible()
    await shootBothThemes(page, 'generate-embeddings-down', findings)

    // Error toast: provider test from the Providers screen.
    await goTo(page, '#/providers')
    await page.getByRole('button', { name: /Test/ }).first().click()
    await page.waitForTimeout(4000)
    await shootBothThemes(page, 'providers-test-failed', findings)
  } finally {
    writeFileSync(join(OUT, 'states-axe-report.json'), JSON.stringify(findings, null, 2))
    await app.close()
  }
  if (!REPORT_ONLY) expect(findings, formatFindings(findings)).toEqual([])
})
