import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
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
  /** Electron / Node switches placed before the app path (e.g. `-r <file>`, `--log-net-log=`). */
  args?: string[]
  /** Show the tip of the day (#443). Off by default so screens and screenshots stay stable. */
  tips?: boolean
}

/** Launch the built app (out/) with an isolated userData dir. */
export async function launch(
  env: Record<string, string> = {},
  opts: LaunchOptions = {},
): Promise<Launched> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'ttx-e2e-'))
  if (!opts.userData && !opts.onboarding)
    // Tips (#443) and the update question (#442) stay off screen unless a spec asks for them.
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({
        onboardingComplete: true,
        ui: { tips: { enabled: !!opts.tips } },
        updates: { check: 'off' },
      }),
    )
  const app = await electron.launch({
    args: [...(opts.args ?? []), resolve('out/main/index.js')],
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

/** Navigate the renderer's hash router (e.g. `#/p/<key>/documents`). */
export async function goTo(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
  }, hash)
}

/** Expand "Project settings" on the project Overview (collapsed by default since #226). */
export async function openProjectSettings(page: Page): Promise<void> {
  const details = page.locator('details.project-settings-details')
  await details.waitFor()
  if (!(await details.evaluate((d) => (d as unknown as { open: boolean }).open)))
    await details.locator('summary').click()
  await expect(page.getByRole('heading', { name: 'Project settings', level: 2 })).toBeVisible()
}

/** Absolute paths of the Markdown files in a repo folder (e.g. `reference/ncia`). */
export function mdFiles(dir: string): string[] {
  return readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => join(resolve(dir), f))
}

export interface JobState {
  status: string
  message: string
  error?: string
  result?: unknown
}

/** Poll jobs:get until the job finishes; fails unless it ends `done`. */
export async function waitForJob(
  invoke: ReturnType<typeof invoker>,
  jobId: string,
  timeout = 60_000,
  intervals = [500, 1000],
): Promise<JobState & { secs: number }> {
  const started = Date.now()
  await expect
    .poll(async () => (await invoke<JobState>('jobs:get', { jobId })).status, {
      timeout,
      intervals,
    })
    .toMatch(/done|error|cancelled/)
  const job = await invoke<JobState>('jobs:get', { jobId })
  expect(job.status, job.error).toBe('done')
  return { ...job, secs: Math.round((Date.now() - started) / 1000) }
}
