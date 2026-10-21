import { expect, test } from '@playwright/test'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launch } from './helpers'

type IpcResult =
  { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }

const NCIA_DIR = resolve('reference/ncia')
const NCIA_FILES = readdirSync(NCIA_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => join(NCIA_DIR, f))

test('imports the NCIA reference plans and shows them on the Documents screen', async () => {
  const { app, page } = await launch()
  const invoke = (channel: string, payload: unknown) =>
    page.evaluate(
      ([c, p]) =>
        (
          globalThis as unknown as {
            ttx: { invoke: (c: string, p: unknown) => Promise<IpcResult> }
          }
        ).ttx.invoke(c as string, p),
      [channel, payload] as const,
    )
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-proj-'))
    const created = await invoke('project:create', { parentDir, name: 'NCIA Documents E2E' })
    test.skip(
      !created.ok && created.error.code === 'NOT_IMPLEMENTED',
      'project:create is not implemented yet',
    )
    expect(created.ok).toBe(true)
    const projectPath = (created as { data: { path: string } }).data.path

    const imported = await invoke('documents:import', { projectPath, filePaths: NCIA_FILES })
    test.skip(
      !imported.ok && imported.error.code === 'NOT_IMPLEMENTED',
      'documents:import is not implemented yet',
    )
    expect(imported.ok).toBe(true)

    await page.evaluate((key) => {
      ;(globalThis as unknown as { location: { hash: string } }).location.hash =
        `#/p/${key}/documents`
    }, encodeURIComponent(projectPath))
    await expect(page.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible()
    const table = page.getByRole('table', { name: 'Project documents' })
    await expect(table.getByRole('row')).toHaveCount(NCIA_FILES.length + 1)
    await expect(table.getByText('Indexed')).toHaveCount(NCIA_FILES.length, { timeout: 45_000 })
    await page.screenshot({ path: 'test-results/documents-list.png', fullPage: true })

    await table
      .getByRole('button', { name: /^Show details for/ })
      .first()
      .click()
    await expect(page.getByRole('complementary', { name: /^Details for/ })).toBeVisible()
    await page.screenshot({ path: 'test-results/documents-detail.png', fullPage: true })
  } finally {
    await app.close()
  }
})
