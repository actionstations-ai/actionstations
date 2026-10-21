import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
}

/** Launch the built app (out/) with an isolated userData dir. */
export async function launch(env: Record<string, string> = {}): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'ttx-e2e-'))
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: {
      ...process.env,
      TTX_USER_DATA: userData,
      TTX_HEADLESS: '1',
      NODE_ENV: 'test',
      ...env,
    } as Record<string, string>,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, userData }
}
