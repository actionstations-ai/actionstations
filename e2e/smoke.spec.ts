import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('app launches to an empty Projects screen', async () => {
  const { app, page } = await launch()
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
  await expect(page.getByText('No projects yet')).toBeVisible()
  // The buttons are only enabled once the IPC round-trip succeeded (sender check passed).
  await expect(page.getByRole('button', { name: 'New project' })).toBeEnabled()
  const info = await page.evaluate(() =>
    (
      globalThis as unknown as { ttx: { invoke: (c: string, p: unknown) => Promise<unknown> } }
    ).ttx.invoke('app:info', undefined),
  )
  expect(info).toMatchObject({ ok: true, data: { electron: '45.0.0' } })
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  // Renderer is isolated: no Node globals.
  expect(await page.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe(
    'undefined',
  )
  await page.screenshot({ path: 'test-results/smoke-projects.png' })
  await app.close()
})
