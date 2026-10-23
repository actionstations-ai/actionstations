// #201: a 300-row MSEL and its 300-card deck are windowed, and keyboard navigation, editing,
// "Go to row" style focus, keyboard drag and the deck's keyboard model still work.
import { expect, test, type Locator } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from './helpers'

interface Row {
  id: string
  phaseId: string
  time: string
  event: string
}

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as { phases: { id: string; index: number }[]; msel: (Row & Record<string, unknown>)[] }

const ROWS = 300

function largeMsel() {
  const phases = [...FIXTURE.phases].sort((a, b) => a.index - b.index)
  const per = Math.ceil(ROWS / phases.length)
  const { injectId: _i, wallClock: _w, ...template } = FIXTURE.msel[2]!
  return Array.from({ length: ROWS }, (_, i) => {
    const phase = phases[Math.floor(i / per)]!
    const minute = phase.index * 60 + Math.floor(((i % per) * 60) / per)
    return {
      ...template,
      id: `R-${String(i + 1).padStart(3, '0')}`,
      phaseId: phase.id,
      time: `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`,
      event: `Event ${i + 1}`,
      citations: [],
      locked: false,
    }
  })
}

const rowById = (grid: Locator, id: string) =>
  grid
    .locator('tr')
    .filter({ has: grid.page().locator('.msel-editor__id', { hasText: new RegExp(`^${id}$`) }) })

test('large MSEL and deck: windowed, keyboard and drag still work', async () => {
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 900),
    )
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-large-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Large Lists',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Long Day',
    })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId, msel: largeMsel() },
    })
    await goTo(page, `#/p/${encodeURIComponent(projectPath)}/scenarios/${empty.id}`)
    await page.getByRole('tab', { name: `MSEL (${ROWS})` }).click()
    const grid = page.getByRole('grid', { name: 'Master Scenario Events List' })
    await expect(rowById(grid, 'R-001')).toBeVisible()
    await expect(grid).toHaveAttribute('aria-rowcount', String(1 + 4 + ROWS))
    expect(await grid.getByRole('row').count()).toBeLessThan(100)
    await expect(grid.locator('[tabindex="0"]')).toHaveCount(1)

    // Ctrl+End reaches the last row; it is mounted, focused and editable.
    await rowById(grid, 'R-001').locator('[data-col="time"]').click()
    await page.keyboard.press('ControlOrMeta+End')
    const last = rowById(grid, 'R-300')
    await expect(last).toHaveAttribute('aria-rowindex', String(1 + 4 + ROWS))
    await expect(last.locator('[data-col="actions"] button')).toBeFocused()
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft')
    await expect(last.locator('[data-col="event"]')).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('The last event, edited.')
    await page.keyboard.press('Enter')
    await expect(last.locator('[data-col="event"]')).toContainText('The last event, edited.')

    // Back to the top with Ctrl+Home; PageDown walks through unmounted rows.
    await page.keyboard.press('ControlOrMeta+Home')
    for (let i = 0; i < 5; i++) await page.keyboard.press('PageDown')
    await expect(grid.locator(':focus')).toHaveCount(1)
    await page.keyboard.press('ControlOrMeta+Home')
    await expect(rowById(grid, 'R-010')).toBeVisible()

    // Keyboard drag near the top: R-010 (0:07) moves above R-009 (0:06) and takes a new time.
    await rowById(grid, 'R-010').getByRole('button', { name: 'Move R-010' }).focus()
    await page.keyboard.press('Space')
    await page.waitForTimeout(150)
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(150)
    await page.keyboard.press('Space')
    await expect(rowById(grid, 'R-010').locator('[data-col="time"]')).not.toContainText('0:07')
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 10_000 })
    const onDisk = JSON.parse(
      readFileSync(join(projectPath, 'scenarios', empty.id, 'scenario.json'), 'utf8'),
    ) as { msel: Row[] }
    expect(onDisk.msel).toHaveLength(ROWS)
    expect(onDisk.msel.find((r) => r.id === 'R-300')!.event).toBe('The last event, edited.')
    const ids = onDisk.msel.map((r) => r.id)
    expect(ids.indexOf('R-010')).toBeLessThan(ids.indexOf('R-009'))

    // Scrolling the grid mounts the rows under the viewport.
    await grid.locator('..').evaluate((el) => (el.scrollTop = el.scrollHeight / 2))
    const visibleIds = () =>
      grid.locator('..').evaluate((el) => {
        const view = el.getBoundingClientRect()
        return [...el.querySelectorAll('.msel-editor__id')]
          .filter((x) => {
            const b = x.getBoundingClientRect()
            return b.top >= view.top && b.bottom <= view.bottom
          })
          .map((x) => x.textContent ?? '')
      })
    await expect
      .poll(async () => (await visibleIds()).some((id) => /^R-1\d\d$/.test(id)))
      .toBe(true)

    // The deck: windowed cards, one tab stop, End reaches the last card.
    await page.getByRole('tab', { name: /^Injects/ }).click()
    const deck = page.getByRole('grid', { name: 'Inject deck' })
    await expect(deck).toHaveAttribute('aria-rowcount', String(ROWS))
    expect(await deck.getByRole('row').count()).toBeLessThan(100)
    await expect(deck.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1)
    await deck.locator('[role="gridcell"]').first().focus()
    await page.keyboard.press('End')
    const lastCard = deck.locator('[role="row"]').filter({ hasText: 'R-300' })
    await expect(lastCard).toHaveAttribute('aria-rowindex', String(ROWS))
    await expect(lastCard.getByRole('gridcell')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(deck.locator('[role="gridcell"][data-card="0"]')).toBeFocused()
  } finally {
    await app.close()
  }
})
