import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

interface Row {
  id: string
  phaseId: string
  time: string
  wallClock?: string
  event: string
  purposeTag: string
}

const rowById = (grid: Locator, id: string) =>
  grid
    .locator('tr')
    .filter({ has: grid.page().locator('.msel-editor__id', { hasText: new RegExp(`^${id}$`) }) })

async function editCell(page: Page, grid: Locator, id: string, col: string, text: string) {
  await rowById(grid, id).locator(`[data-col="${col}"]`).click()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

async function shoot(page: Page, name: string) {
  mkdirSync('.tmp', { recursive: true })
  await page.screenshot({ path: `.tmp/${name}.png` })
  await page.screenshot({ path: `test-results/${name}.png` })
}

test('MSEL editor: keyboard edits, time jump and bulk shift persist to scenario.json', async () => {
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 900),
    )
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-msel-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA MSEL Editor',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId },
    })
    await page.evaluate(
      (h) => {
        ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
      },
      `#/p/${encodeURIComponent(projectPath)}/scenarios/${empty.id}`,
    )
    await page.getByRole('tab', { name: 'MSEL (24)' }).click()
    const grid = page.getByRole('grid', { name: 'Master Scenario Events List' })
    await expect(grid.getByRole('row')).toHaveCount(1 + 4 + 24)

    // #82: nothing clipped at 1280 px — the grid fits its container without horizontal scroll.
    const overflow = await grid.evaluate(
      (t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    // Three times and two events, keyboard only after focusing the cell.
    await editCell(page, grid, 'I-01', 'time', '0:10')
    await editCell(page, grid, 'I-03', 'time', '0:40')
    await editCell(page, grid, 'I-13b', 'time', '3:05')
    await rowById(grid, 'I-02a').locator('[data-col="time"]').click()
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('F2')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('Ticket #4492: vending machines in Concourse B dispense at random.')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('Ticket update: the AODB feed itself says Miami.')
    await page.keyboard.press('Enter')

    // TIME_JUMP card into phase 3.
    await page.getByRole('button', { name: 'Insert control card' }).click()
    await page.getByRole('menuitem', { name: 'Time jump…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Insert time jump' })
    await dialog.getByLabel('Phase').selectOption('p3')
    await dialog.getByLabel('New wall-clock time').fill('11:00')
    await dialog
      .getByLabel('Narration')
      .fill('Paper boarding passes are now the only source of truth.')
    await dialog.getByRole('button', { name: 'Insert time jump' }).click()
    await expect(rowById(grid, 'TJ-1')).toBeVisible()

    // Shift phase 3 (including the new card) by +10 minutes.
    await page.getByRole('checkbox', { name: 'Select all rows in Phase 3: Manual Mode' }).check()
    const bulk = page.getByRole('region', { name: 'Selected rows' })
    await bulk.getByLabel('Shift times by').fill('10')
    await bulk.getByRole('button', { name: 'Shift' }).click()
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/^Lint:/)).toBeVisible()

    const onDisk = JSON.parse(
      readFileSync(join(projectPath, 'scenarios', empty.id, 'scenario.json'), 'utf8'),
    ) as { msel: Row[] }
    const byId = (id: string) => onDisk.msel.find((r) => r.id === id)!
    expect(byId('I-01')).toMatchObject({ time: '0:10', wallClock: '09:10' })
    expect(byId('I-03')).toMatchObject({ time: '0:40', wallClock: '09:40' })
    expect(byId('I-13b')).toMatchObject({ time: '3:05', wallClock: '12:05' })
    expect(byId('I-02a').event).toBe(
      'Ticket #4492: vending machines in Concourse B dispense at random.',
    )
    expect(byId('I-02').event).toBe('Ticket update: the AODB feed itself says Miami.')
    expect(byId('TJ-1')).toMatchObject({
      phaseId: 'p3',
      time: '2:10',
      wallClock: '11:10',
      purposeTag: 'TIME_JUMP',
      event:
        'SCENARIO JUMP: It is now 11:00 AM. Paper boarding passes are now the only source of truth.',
    })
    expect(onDisk.msel.filter((r) => r.phaseId === 'p3').map((r) => `${r.id}@${r.time}`)).toEqual([
      'TJ-1@2:10',
      'I-09@2:10',
      'I-10@2:25',
      'I-10b@2:30',
      'I-11@2:40',
      'I-12@2:55',
    ])
    // Saved MSEL stays globally time-ordered (lint TIME_ORDER).
    const minutes = onDisk.msel
      .map((r) => r.time.split(':').map(Number))
      .map(([h, m]) => h! * 60 + m!)
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes)

    await page.getByRole('button', { name: 'Clear selection' }).click()

    // Keyboard drag: pick up I-04 (0:55), move it up one slot (above I-03 0:40), drop.
    // It takes the midpoint of its new neighbours I-02 (0:30) and I-03 (0:40) → 0:35.
    await rowById(grid, 'I-04').getByRole('button', { name: 'Move I-04' }).focus()
    await page.keyboard.press('Space')
    await page.waitForTimeout(150)
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(150)
    await page.keyboard.press('Space')
    await expect(rowById(grid, 'I-04').locator('[data-col="time"]')).toContainText('0:35')
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 10_000 })
    const afterDrag = JSON.parse(
      readFileSync(join(projectPath, 'scenarios', empty.id, 'scenario.json'), 'utf8'),
    ) as { msel: Row[] }
    expect(afterDrag.msel.slice(0, 6).map((r) => `${r.id}@${r.time}`)).toEqual([
      'START@0:00',
      'I-01@0:10',
      'I-02a@0:20',
      'I-02@0:30',
      'I-04@0:35',
      'I-03@0:40',
    ])
    await page.getByRole('tab', { name: /^MSEL/ }).scrollIntoViewIfNeeded()
    await shoot(page, 'msel-editor-light')
    await rowById(grid, 'I-08').locator('[data-col="tag"]').click()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listbox', { name: 'Tag for I-08' })).toBeVisible()
    await shoot(page, 'msel-editor-tag-editor')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox', { name: 'Tag for I-08' })).toBeHidden()
    await page.evaluate(() => {
      const doc = (
        globalThis as unknown as {
          document: { documentElement: { dataset: Record<string, string> } }
        }
      ).document
      doc.documentElement.dataset.theme = 'dark'
    })
    await page.waitForTimeout(300) // let the 80 ms button colour transition finish
    await shoot(page, 'msel-editor-dark')
  } finally {
    await app.close()
  }
})
