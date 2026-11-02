// Checks behind the desktop-app ratings in docs/accessibility/ACR-508.md (#568) for WCAG 2.2
// criteria that axe cannot test: 1.4.12 Text Spacing, 1.4.13 Content on Hover or Focus,
// 2.4.11 Focus Not Obscured, 2.5.2 Pointer Cancellation, 2.5.7 Dragging Movements, 2.5.8 Target
// Size (Minimum) and 3.2.6 Consistent Help. One app and one seeded project serve every check;
// the conventions (launch, seed, screens, goTo) follow a11y.spec.ts. ACR_REPORT=1 records the
// findings in .tmp/acr/ without failing, for audits.
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

test.setTimeout(300_000)
test.describe.configure({ mode: 'serial' })

// The probes run in the renderer (page.evaluate); e2e compiles without the DOM lib, so the
// browser globals are declared loosely and the probes use `any` for DOM nodes.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any
declare const getComputedStyle: (el: any) => any
declare const location: any
declare const window: any

const OUT = resolve('.tmp/acr')
const REPORT_ONLY = process.env.ACR_REPORT === '1'
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

interface Seeded {
  key: string
  scenarioId: string
  injectId: string
}
interface Screen {
  name: string
  hash: (s: Seeded) => string
  prepare?: (page: Page) => Promise<void>
}

const tab = (name: RegExp) => async (page: Page) => {
  await page.getByRole('tab', { name }).click()
  await page.waitForTimeout(400)
}
const SCREENS: Screen[] = [
  { name: 'projects', hash: () => '#/projects' },
  { name: 'project-overview', hash: (s) => `#/p/${s.key}` },
  { name: 'documents', hash: (s) => `#/p/${s.key}/documents` },
  { name: 'generate', hash: (s) => `#/p/${s.key}/generate` },
  { name: 'scenarios', hash: (s) => `#/p/${s.key}/scenarios` },
  { name: 'scenario-overview', hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}` },
  {
    name: 'scenario-msel',
    hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}`,
    prepare: tab(/^MSEL/),
  },
  {
    name: 'scenario-injects',
    hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}`,
    prepare: tab(/^Injects/),
  },
  {
    name: 'inject-editor',
    hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}/injects/${s.injectId}`,
  },
  { name: 'export', hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}/export` },
  { name: 'facilitate', hash: (s) => `#/p/${s.key}/scenarios/${s.scenarioId}/facilitate` },
  { name: 'prompts', hash: () => '#/prompts' },
  { name: 'providers', hash: () => '#/providers' },
  { name: 'templates', hash: () => '#/templates' },
  { name: 'settings', hash: () => '#/settings' },
  { name: 'packs', hash: () => '#/packs' },
]
const screenNamed = (name: string) => SCREENS.find((s) => s.name === name)!

let app: ElectronApplication
let page: Page
let seeded: Seeded

async function goTo(hash: string) {
  await page.evaluate((h: string) => {
    location.hash = h
  }, hash)
  await page.waitForTimeout(600)
}

async function openScreen(screen: Screen) {
  await goTo('#/projects')
  await goTo(screen.hash(seeded))
  await screen.prepare?.(page)
}

async function controlName(el: Locator): Promise<string> {
  const label = await el.getAttribute('aria-label', { timeout: 2000 }).catch(() => null)
  const text = label ?? (await el.innerText({ timeout: 2000 }).catch(() => ''))
  return text.trim().slice(0, 30)
}

function report(name: string, findings: string[]) {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(findings, null, 2))
  if (!REPORT_ONLY) expect(findings).toEqual([])
}

test.beforeAll(async () => {
  const launched = await launch({ TTX_MOCK_PROVIDERS: '1' })
  app = launched.app
  page = launched.page
  await page.setViewportSize({ width: 1280, height: 860 })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  const invoke = invoker(page)
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-acr-'))
  const { path: projectPath } = await invoke<{ path: string }>('project:create', {
    parentDir,
    name: 'North Coast International Airport',
    orgType: 'airport',
  })
  const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
    projectPath,
    title: 'Flight to Nowhere',
  })
  await invoke('scenarios:save', {
    projectPath,
    scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId },
  })
  const created = await invoke<{ id: string }>('injects:create', {
    projectPath,
    scenarioId: empty.id,
    mselRowId: 'I-06',
    type: 'fids_board',
  })
  seeded = { key: encodeURIComponent(projectPath), scenarioId: empty.id, injectId: created.id }
})

test.afterAll(async () => {
  await app?.close()
})

// ---- 1.4.12 Text Spacing ----------------------------------------------------------------------

/** The WCAG text-spacing bookmarklet: the four minimum overrides, applied to every element. */
const TEXT_SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }`

/** Clipped text-bearing elements and overlapping pairs of them, named by their text. */
function measureText() {
  const label = (e: any) =>
    `${e.tagName.toLowerCase()} "${(e.textContent || '').trim().slice(0, 36)}"`
  // Scrolled-away parts of a scroll area or a collapsed region are not on screen: skip them.
  const onScreen = (e: any, r: any) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
      const q = p.getBoundingClientRect()
      if (r.right <= q.left || r.left >= q.right || r.bottom <= q.top || r.top >= q.bottom)
        return false
    }
    return true
  }
  const leaves: any[] = [...document.querySelectorAll('body *')].filter((e: any) => {
    const r = e.getBoundingClientRect()
    if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') return false
    if (e.closest('svg, script, style') || !onScreen(e, r)) return false
    return [...e.childNodes].some((n: any) => n.nodeType === 3 && n.textContent.trim())
  })
  const clipped: string[] = []
  const clips = (v: string) => v === 'hidden' || v === 'clip'
  for (const e of leaves) {
    const s = getComputedStyle(e)
    if (s.textOverflow === 'ellipsis') continue
    if (clips(s.overflowX) && e.scrollWidth > e.clientWidth + 1) clipped.push(label(e))
    else if (clips(s.overflowY) && e.scrollHeight > e.clientHeight + 1) clipped.push(label(e))
  }
  // Line boxes of each element's own text (a Range), so wrapped inline text is not one big box.
  const lineRects = (e: any) => {
    const range = document.createRange()
    const out: any[] = []
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue
      range.selectNodeContents(n)
      out.push(...range.getClientRects())
    }
    // Keep the lines that show: on screen and not clipped away or covered by something else.
    // Cut each line at its own box (ellipsis, line clamp) and at every clipping ancestor.
    const cs = getComputedStyle(e)
    const cuts = cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp ?? 'none') !== 'none'
    const bounds: any[] = cuts ? [e.getBoundingClientRect()] : []
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p)
      if (o.overflowX !== 'visible' || o.overflowY !== 'visible')
        bounds.push(p.getBoundingClientRect())
    }
    return out
      .map((r: any) => {
        let { left, top, right, bottom } = r
        for (const c of bounds) {
          left = Math.max(left, c.left)
          top = Math.max(top, c.top)
          right = Math.min(right, c.right)
          bottom = Math.min(bottom, c.bottom)
        }
        return { left, top, right, bottom, width: right - left, height: bottom - top }
      })
      .filter((r: any) => {
        if (r.width <= 0 || r.height <= 0) return false
        const x = r.left + r.width / 2
        const y = r.top + r.height / 2
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false
        const top = document.elementFromPoint(x, y)
        return !!top && (top === e || e.contains(top) || top.contains(e))
      })
  }
  const overlaps: string[] = []
  const boxes: [any, any[]][] = leaves.map((e: any) => [e, lineRects(e)])
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, ras] = boxes[i]!
      const [b, rbs] = boxes[j]!
      const hit = ras.some((ra: any) =>
        rbs.some(
          (rb: any) =>
            Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 2 &&
            Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 2,
        ),
      )
      if (hit) overlaps.push(`${label(a)} / ${label(b)}`)
    }
  const doc = document.documentElement
  return { clipped, overlaps, pageScroll: doc.scrollWidth > doc.clientWidth + 1 }
}

test('1.4.12 text spacing: no clipped, overlapping or lost text on the main screens', async () => {
  const findings: string[] = []
  // Progress words ("Rendering…") come and go on their own, so they are not counted.
  const textLength = () =>
    page.evaluate(() => document.body.innerText.replace(/(Rendering|Loading)…/g, '').length)
  const fresh = (a: string[], b: string[]) => a.filter((x) => !b.includes(x))
  for (const screen of SCREENS) {
    await openScreen(screen)
    await page.waitForTimeout(600)
    const before = await page.evaluate(measureText)
    const beforeText = await textLength()
    const style = await page.addStyleTag({ content: TEXT_SPACING_CSS })
    await page.waitForTimeout(250)
    const after = await page.evaluate(measureText)
    const afterText = await textLength()
    mkdirSync(OUT, { recursive: true })
    await page.screenshot({ path: join(OUT, `spacing-${screen.name}.png`) })
    await style.evaluate((el: any) => el.remove())
    for (const c of fresh(after.clipped, before.clipped))
      findings.push(`${screen.name}: text clipped — ${c}`)
    for (const o of fresh(after.overlaps, before.overlaps))
      findings.push(`${screen.name}: text overlaps — ${o}`)
    if (after.pageScroll && !before.pageScroll)
      findings.push(`${screen.name}: window scrolls horizontally`)
    // A 1 % margin absorbs template previews that finish rendering between the two readings.
    if (afterText < beforeText * 0.99)
      findings.push(`${screen.name}: text lost (${beforeText} → ${afterText})`)
  }
  report('text-spacing', findings)
})

// ---- 1.4.13 Content on Hover or Focus ----------------------------------------------------------

const POPUP =
  '[role="tooltip"], [data-radix-popper-content-wrapper], [data-radix-hover-card-content]'

test('1.4.13 hover or focus content: nothing appears on hover or focus alone', async () => {
  const findings: string[] = []
  for (const screen of SCREENS) {
    await openScreen(screen)
    const controls = page.locator('main button:visible, main a[href]:visible, nav a[href]:visible')
    const count = Math.min(await controls.count(), 12)
    if (!count) findings.push(`${screen.name}: no controls to hover`)
    for (let i = 0; i < count; i++) {
      const el = controls.nth(i)
      const name = await controlName(el)
      await el.hover({ timeout: 2000 }).catch(() => undefined)
      await page.waitForTimeout(60)
      if (await page.locator(POPUP).count())
        findings.push(`${screen.name}: hover on "${name}" shows popup content`)
      await el.focus({ timeout: 2000 }).catch(() => undefined)
      if (await page.locator(POPUP).count())
        findings.push(`${screen.name}: focus on "${name}" shows popup content`)
      await page.mouse.move(0, 0)
    }
  }
  report('hover-focus-trigger', findings)
})

test('1.4.13 popovers: dismissible with Esc, hoverable and persistent', async () => {
  const findings: string[] = []
  await openScreen(screenNamed('project-overview'))
  await page.getByRole('button', { name: 'Glossary' }).click()
  const popup = page.getByRole('dialog', { name: 'Glossary' })
  await popup.waitFor({ timeout: 5000 })
  const box = (await popup.boundingBox())!
  // Hoverable: the pointer can move onto the content without closing it.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(300)
  if (!(await popup.isVisible())) findings.push('glossary closes when the pointer moves onto it')
  // Persistent: it stays after the pointer leaves, until dismissed.
  await page.mouse.move(2, 2)
  await page.waitForTimeout(1500)
  if (!(await popup.isVisible())) findings.push('glossary closes when the pointer leaves it')
  // Dismissible: Esc closes it and focus returns to the trigger.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  if (await popup.isVisible()) findings.push('glossary stays open after Esc')
  const back = await page.evaluate(() => document.activeElement?.textContent?.trim())
  if (back !== 'Glossary') findings.push(`focus is on "${back}" after Esc, not the trigger`)
  report('hover-focus-popovers', findings)
})

// ---- 2.4.11 Focus Not Obscured (Minimum) --------------------------------------------------------

/** Whether any part of the focused element shows: sample its centre and corners. */
function focusVisibility() {
  const el = document.activeElement
  if (!el || el === document.body) return null
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return null
  const inset = (size: number) => Math.min(size / 2, 2)
  const pts: [number, number][] = [
    [r.left + r.width / 2, r.top + r.height / 2],
    [r.left + inset(r.width), r.top + inset(r.height)],
    [r.right - inset(r.width), r.top + inset(r.height)],
    [r.left + inset(r.width), r.bottom - inset(r.height)],
    [r.right - inset(r.width), r.bottom - inset(r.height)],
  ]
  const onScreen = pts.filter(
    ([x, y]) => x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight,
  )
  const shown = onScreen.some(([x, y]) => {
    const top = document.elementFromPoint(x, y)
    return top && (top === el || el.contains(top) || top.contains(el))
  })
  const text = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 36)
  return { shown: onScreen.length > 0 && shown, label: `${el.tagName.toLowerCase()} "${text}"` }
}

async function tabThrough(name: string, findings: string[], max = 70) {
  await page.evaluate(() => document.activeElement?.blur())
  const seen = new Set<string>()
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(20)
    const v = await page.evaluate(focusVisibility)
    if (!v) continue
    if (seen.has(v.label)) break
    seen.add(v.label)
    if (!v.shown) findings.push(`${name}: focused ${v.label} is hidden behind other content`)
  }
}

test('2.4.11 focus not obscured: tabbing never lands behind a header, dialog or toast', async () => {
  const findings: string[] = []
  for (const screen of SCREENS) {
    await openScreen(screen)
    await tabThrough(screen.name, findings)
  }
  // With a notification on screen: the toast stack sits over the lower left of the window.
  await openScreen(screenNamed('scenario-msel'))
  await page.getByRole('button', { name: 'Actions for I-01', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Duplicate row' }).click()
  await page.waitForTimeout(300)
  await tabThrough('scenario-msel after a row action', findings, 120)
  report('focus-not-obscured', findings)
})

// ---- 2.5.2 Pointer Cancellation --------------------------------------------------------------------

test('2.5.2 pointer cancellation: pressing a control does nothing until release', async () => {
  const findings: string[] = []
  const names = ['project-overview', 'documents', 'scenario-msel', 'export', 'settings', 'packs']
  const dialogs = () => page.locator('[role="dialog"]:visible').count()
  for (const screen of names.map(screenNamed)) {
    await openScreen(screen)
    await page.evaluate(() => {
      window.__clicks = []
      document.addEventListener('click', (e: any) => window.__clicks.push(e.target), true)
    })
    // Menu triggers and tabs only reveal or switch a view (undone by choosing again): left out.
    const targets = page.locator(
      'main button:visible:not([disabled]):not([aria-haspopup]):not([role="tab"]), main a[href]:visible',
    )
    const count = Math.min(await targets.count(), 12)
    if (!count) findings.push(`${screen.name}: no controls to press`)
    for (let i = 0; i < count; i++) {
      const el = targets.nth(i)
      const box = await el.boundingBox()
      if (!box) continue
      const name = await controlName(el)
      const hashBefore = await page.evaluate(() => location.hash)
      const dialogsBefore = await dialogs()
      await page.evaluate(() => (window.__clicks.length = 0))
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(80)
      const down = await page.evaluate(() => ({
        hash: location.hash,
        clicks: window.__clicks.length,
      }))
      const dialogsDown = await dialogs()
      // Slide off the control and release elsewhere: the press is cancelled.
      await page.mouse.move(2, 2)
      await page.mouse.up()
      await page.waitForTimeout(120)
      const up = await page.evaluate(() => ({
        hash: location.hash,
        onControl: window.__clicks.some((c: any) => c.closest?.('button, a[href]')),
      }))
      if (down.hash !== hashBefore || down.clicks || dialogsDown !== dialogsBefore)
        findings.push(`${screen.name}: "${name}" acts on the down-event`)
      else if (up.hash !== hashBefore || up.onControl || (await dialogs()) !== dialogsBefore)
        findings.push(`${screen.name}: "${name}" acts although the press was moved off it`)
      if ((await dialogs()) !== dialogsBefore) await page.keyboard.press('Escape')
    }
  }
  report('pointer-cancellation', findings)
})

// ---- 2.5.7 Dragging Movements -----------------------------------------------------------------------

test('2.5.7 dragging: reordering an MSEL row has a single-pointer alternative', async () => {
  const findings: string[] = []
  await openScreen(screenNamed('scenario-msel'))
  const ids = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.msel-editor__id')].map((e: any) => e.textContent?.trim()),
    )
  const before = await ids()
  const moved = before[1]!
  await page.getByRole('button', { name: `Actions for ${moved}`, exact: true }).click()
  await page.getByRole('menuitem', { name: 'Move up' }).click()
  await page.waitForTimeout(400)
  const after = await ids()
  if (after.indexOf(moved) >= before.indexOf(moved))
    findings.push(`Move up did not move ${moved} (${before.slice(0, 4)} → ${after.slice(0, 4)})`)
  await page.getByRole('button', { name: `Actions for ${moved}`, exact: true }).click()
  await page.getByRole('menuitem', { name: 'Move down' }).click()
  await page.waitForTimeout(400)
  const again = await ids()
  if (again.indexOf(moved) <= after.indexOf(moved)) findings.push(`Move down did not move ${moved}`)
  report('dragging-msel', findings)
})

test('2.5.7 dragging: file drop areas have a button that opens the file picker', async () => {
  const findings: string[] = []
  await openScreen(screenNamed('documents'))
  if (!(await page.getByRole('button', { name: /Import documents/ }).count()))
    findings.push('documents: no Import documents button beside drag-and-drop')
  await openScreen(screenNamed('packs'))
  if (!(await page.getByRole('button', { name: /Install from file/ }).count()))
    findings.push('packs: no Install from file button beside drag-and-drop')
  report('dragging-file-drop', findings)
})

// ---- 2.5.8 Target Size (Minimum) ------------------------------------------------------------------------

/** Targets under 24x24 CSS px that also fail the spacing exception (a 24 px circle centred on
 * the target must not reach another target), excluding inline text links. */
function smallTargets(): string[] {
  const sel =
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [tabindex="0"]'
  const els: any[] = [...document.querySelectorAll(sel)].filter((e: any) => {
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && !e.closest('[aria-hidden="true"], [inert]')
  })
  const label = (e: any) => {
    const r = e.getBoundingClientRect()
    const text = (e.getAttribute('aria-label') || e.textContent || e.name || '').trim()
    return `${e.tagName.toLowerCase()} "${text.slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`
  }
  const inline = (e: any) =>
    e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.closest('p, li, dd, span')
  const out: string[] = []
  for (const e of els) {
    const r = e.getBoundingClientRect()
    if ((r.width >= 24 && r.height >= 24) || inline(e)) continue
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const crowded = els.some((o: any) => {
      if (o === e || o.contains(e) || e.contains(o)) return false
      const q = o.getBoundingClientRect()
      const dx = Math.max(q.left - cx, 0, cx - q.right)
      const dy = Math.max(q.top - cy, 0, cy - q.bottom)
      return Math.hypot(dx, dy) < 12
    })
    if (crowded) out.push(label(e))
  }
  return out
}

test('2.5.8 target size: every target is 24 px or has the spacing exception', async () => {
  const findings: string[] = []
  for (const screen of SCREENS) {
    await openScreen(screen)
    for (const t of await page.evaluate(smallTargets)) findings.push(`${screen.name}: ${t}`)
  }
  report('target-size', findings)
})

// ---- 3.2.6 Consistent Help --------------------------------------------------------------------------------

test('3.2.6 consistent help: the Glossary leads the page actions wherever it appears', async () => {
  const findings: string[] = []
  const withHelp: string[] = []
  for (const screen of SCREENS) {
    await openScreen(screen)
    const info = await page.evaluate(() => {
      const help = [...document.querySelectorAll('main button, main a')].find(
        (e: any) => e.textContent?.trim() === 'Glossary',
      ) as any
      if (!help) return null
      const bar = help.parentElement
      const kids = [...bar.querySelectorAll(':scope > button, :scope > a, :scope > span > button')]
      return {
        inHeader: !!help.closest('header, .page-header'),
        before: kids.slice(0, kids.indexOf(help)).map((e: any) => e.textContent?.trim()),
      }
    })
    if (!info) continue
    withHelp.push(screen.name)
    if (!info.inHeader) findings.push(`${screen.name}: Glossary is not in the page header`)
    if (info.before.some((t: string) => /\w/.test(t)))
      findings.push(`${screen.name}: Glossary follows ${info.before.join(', ')}`)
  }
  if (withHelp.length < 2) findings.push(`only ${withHelp.length} screen(s) offer the Glossary`)
  report('consistent-help', findings)
})
