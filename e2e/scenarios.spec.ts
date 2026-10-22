import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

const HANDBOOK = [
  '# Controller / Evaluator (C/E) Handbook',
  '',
  '## Scenario 3: "Flight to Nowhere"',
  '',
  '<img src="x" onerror="window.__xss = 1">',
  '',
  '| Metric | Points |',
  '|---|---|',
  '| Operational Coordination | 30 |',
].join('\n')

async function goTo(page: Page, hash: string) {
  await page.evaluate((h) => {
    ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
  }, hash)
}

test('scenario store + screens: Scenario 3 MSEL renders like the reference', async () => {
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-scen-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA Scenarios E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId },
      note: 'Scenario 3 fixture',
    })
    await invoke('scenarios:doc-save', {
      projectPath,
      scenarioId: empty.id,
      kind: 'handbook',
      markdown: HANDBOOK,
    })
    const key = encodeURIComponent(projectPath)

    await goTo(page, `#/p/${key}/scenarios`)
    const card = page.getByRole('list', { name: 'Scenarios' }).getByRole('listitem')
    await expect(card).toHaveCount(1)
    await expect(card.getByText('4 phases · 22 injects')).toBeVisible()
    await page.screenshot({ path: 'test-results/scenarios-list.png', fullPage: true })

    await card.getByRole('link', { name: 'Flight to Nowhere' }).click()
    await expect(page.getByRole('heading', { name: 'Flight to Nowhere', level: 1 })).toBeVisible()
    await page.getByRole('tab', { name: 'MSEL (24)' }).click()
    const msel = page.getByRole('grid', { name: 'Master Scenario Events List' })
    await expect(msel.getByRole('row')).toHaveCount(1 + 4 + 24)
    await expect(msel.getByText('Phase 3: Manual Mode')).toBeVisible()
    const herring = msel.getByRole('row').filter({ hasText: 'I-05b' })
    await expect(herring.getByText('Red herring', { exact: true })).toBeVisible()
    await page.screenshot({ path: 'test-results/scenario-msel.png', fullPage: true })

    await page.getByRole('tab', { name: 'Documents' }).click()
    const doc = page.getByRole('article', { name: 'Controller handbook' })
    await expect(doc.getByRole('heading', { name: /Controller \/ Evaluator/ })).toBeVisible()
    await expect(doc.getByRole('table')).toBeVisible()
    expect(await doc.locator('img').count()).toBe(0)
    expect(await page.evaluate(() => (globalThis as { __xss?: number }).__xss)).toBeUndefined()
    await page.screenshot({ path: 'test-results/scenario-documents.png', fullPage: true })

    await goTo(page, `#/p/${key}/generate`)
    await expect(page.getByRole('heading', { name: 'Generate a scenario' })).toBeVisible()
    await page.screenshot({ path: 'test-results/generate-brief.png', fullPage: true })
  } finally {
    await app.close()
  }
})

test('generate:scenario with the mock provider opens a scenario folder', async () => {
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-gen-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA Generate E2E',
    })
    const started = await page.evaluate(
      ([p]) =>
        (
          globalThis as unknown as {
            ttx: {
              invoke: (
                c: string,
                r: unknown,
              ) => Promise<{ ok: boolean; error?: { code: string }; data?: unknown }>
            }
          }
        ).ttx.invoke('generate:scenario', {
          projectPath: p,
          brief: { userPrompt: 'AODB tampering misleads FIDS, BHS and PA' },
        }),
      [projectPath] as const,
    )
    test.skip(
      !started.ok && started.error?.code === 'NOT_IMPLEMENTED',
      'generate:scenario is not implemented yet',
    )
    expect(started.ok).toBe(true)
    const { scenarioId } = (started as unknown as { data: { scenarioId: string } }).data
    const key = encodeURIComponent(projectPath)
    await goTo(page, `#/p/${key}/scenarios/${scenarioId}`)
    await expect(page.getByRole('region', { name: 'Generation log' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Generation stages' })).toBeVisible({
      timeout: 60_000,
    })
    await page.screenshot({ path: 'test-results/scenario-generated.png', fullPage: true })
  } finally {
    await app.close()
  }
})
