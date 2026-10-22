import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
}

export interface LaunchOptions {
  /** Reuse an existing userData dir (relaunch) instead of a fresh one. */
  userData?: string
  /** Fresh installs open the setup wizard; specs skip it unless they test it. */
  onboarding?: boolean
}

/** Launch the built app (out/) with an isolated userData dir. */
export async function launch(
  env: Record<string, string> = {},
  opts: LaunchOptions = {},
): Promise<Launched> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'ttx-e2e-'))
  if (!opts.userData && !opts.onboarding)
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingComplete: true }))
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

export type IpcResult =
  { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }

/** Call a main-process channel through the renderer's window.ttx bridge. */
export function invoker(page: Page) {
  return async <T = unknown>(channel: string, payload?: unknown): Promise<T> => {
    const r = await page.evaluate(
      ([c, p]) =>
        (
          globalThis as unknown as {
            ttx: { invoke: (c: string, p: unknown) => Promise<IpcResult> }
          }
        ).ttx.invoke(c as string, p),
      [channel, payload] as const,
    )
    if (!r.ok) throw new Error(`${channel} failed: ${r.error.code} ${r.error.message}`)
    return r.data as T
  }
}
