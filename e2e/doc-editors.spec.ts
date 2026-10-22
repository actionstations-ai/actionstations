// Document + structured editors (#40) in the built app: edit the handbook and a rubric
// cell, reload, check the files on disk, then screenshot light and dark.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
const HANDBOOK = readFileSync(resolve('tests/fixtures/generate/sample-run/handbook.md'), 'utf8')
const BRIEFING = readFileSync(resolve('reference/scenario-3/player-briefing.md'), 'utf8')
const SHOTS = resolve('.tmp/doc-editors')

async function goTo(page: Page, hash: string) {
  await page.evaluate((h) => {
    ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
  }, hash)
}

async function shoot(page: Page, name: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    // Let the buttons' background transition finish before capturing.
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(SHOTS, `${name}-${scheme}.png`), fullPage: true })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('edit the handbook and a rubric cell, reload, files on disk match', async () => {
  mkdirSync(SHOTS, { recursive: true })
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-docs-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA Doc Editors E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const id = empty.id
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id, projectId: empty.projectId },
      note: 'Scenario 3 fixture',
    })
    for (const [kind, markdown] of [
      ['handbook', HANDBOOK],
      ['briefing', BRIEFING],
    ] as const) {
      await invoke('scenarios:doc-save', { projectPath, scenarioId: id, kind, markdown })
    }
    const scenarioUrl = `#/p/${encodeURIComponent(projectPath)}/scenarios/${id}`
    const docFile = join(projectPath, 'scenarios', id, 'documents', 'handbook.md')
    await goTo(page, scenarioUrl)

    // Handbook: WYSIWYG edit of one heading.
    await page.getByRole('tab', { name: 'Documents' }).click()
    const surface = page.getByRole('textbox', { name: 'Controller handbook' })
    const heading = surface.getByRole('heading', { name: '2. Room Setup & Logistics' })
    await expect(heading).toBeVisible()
    await expect(
      page.getByRole('toolbar', { name: 'Controller handbook formatting' }),
    ).toBeVisible()
    await shoot(page, 'handbook')
    await heading.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' (revised)')
    await expect(page.getByText('Unsaved changes')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByText('All changes saved').first()).toBeVisible()
    await expect
      .poll(() => readFileSync(docFile, 'utf8'))
      .toBe(
        HANDBOOK.replace(
          '### 2. Room Setup & Logistics',
          '### 2. Room Setup & Logistics (revised)',
        ),
      )

    // History: diff of the original version against the edit.
    await page.getByRole('button', { name: 'History' }).click()
    const versions = page.getByRole('list', { name: 'Saved versions' }).getByRole('button')
    await expect(versions).toHaveCount(2)
    await versions.nth(1).click()
    const diff = page.getByRole('list', { name: /Changes from this version/ })
    await expect(diff.getByText('### 2. Room Setup & Logistics (revised)')).toBeVisible()
    await shoot(page, 'handbook-history')

    // Briefing: the reference document's tables render as tables.
    await page.getByRole('button', { name: 'Player briefing', exact: true }).click()
    await expect(
      page.getByRole('textbox', { name: 'Player briefing' }).getByRole('table').first(),
    ).toBeVisible()

    // Rubric: change a cell and the points.
    await page.getByRole('tab', { name: 'Rubric' }).click()
    const fail = page.getByRole('textbox', { name: 'Metric 1 fail' })
    await fail.fill('Ops kept bad data on the screens.')
    const points = page.getByRole('textbox', { name: 'Metric 1 points' })
    await points.fill('25')
    await expect(page.getByText('Points add up to 95, not 100 (5 short).')).toBeVisible()
    await shoot(page, 'rubric')
    await page
      .getByRole('region', { name: 'Evaluation rubric' })
      .getByRole('button', { name: 'Save' })
      .click()
    await expect(page.getByText('All changes saved').first()).toBeVisible()

    // Reload: edits come back from disk.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await goTo(page, scenarioUrl)
    await page.getByRole('tab', { name: 'Rubric' }).click()
    await expect(page.getByRole('textbox', { name: 'Metric 1 fail' })).toHaveValue(
      'Ops kept bad data on the screens.',
    )
    await expect(page.getByRole('textbox', { name: 'Metric 1 points' })).toHaveValue('25')
    await page.getByRole('tab', { name: 'Documents' }).click()
    await expect(
      page
        .getByRole('textbox', { name: 'Controller handbook' })
        .getByRole('heading', { name: '2. Room Setup & Logistics (revised)' }),
    ).toBeVisible()

    const onDisk = JSON.parse(
      readFileSync(join(projectPath, 'scenarios', id, 'scenario.json'), 'utf8'),
    ) as { rubric: { metrics: { fail: string; points: number }[] }; msel: unknown[] }
    expect(onDisk.rubric.metrics[0]).toMatchObject({
      fail: 'Ops kept bad data on the screens.',
      points: 25,
    })
    expect(onDisk.msel).toHaveLength(24)

    // Structured tabs render (screenshots for review).
    await page.getByRole('tab', { name: 'Overview' }).click()
    await expect(page.getByRole('textbox', { name: 'Theme' })).toBeVisible()
    await shoot(page, 'overview')
    await page.getByRole('tab', { name: /^Objectives/ }).click()
    await expect(page.getByRole('textbox', { name: 'Objective 1 name' })).toBeVisible()
    await shoot(page, 'objectives')
  } finally {
    await app.close()
  }
})
