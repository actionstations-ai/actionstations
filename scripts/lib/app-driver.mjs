// Drive the built app headless through Playwright's Electron driver (shared by
// scripts/make-example.mjs and scripts/bench/run.mjs): a throwaway user-data directory, the
// typed IPC bridge as `invoke`, and polling a job until it ends. Needs `pnpm build:app` first.
import { _electron as electron } from '@playwright/test'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A fresh user-data directory with onboarding done, so no first-run screen opens. */
export function freshUserData(prefix = 'ttx-app-') {
  const userData = mkdtempSync(join(tmpdir(), prefix))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingComplete: true }))
  return userData
}

/**
 * Launch out/main/index.js headless with `userData` (default: a fresh one). `env` adds test
 * switches (TTX_MOCK_PROVIDERS=1 …). Returns the app, its user-data directory and `invoke`,
 * which throws on an error result. Callers must `app.close()` in a finally block.
 */
export async function launchApp({ userData = freshUserData(), env = {} } = {}) {
  if (!existsSync(MAIN_ENTRY)) throw new Error('out/main/index.js is missing: run pnpm build:app')
  const app = await electron.launch({
    timeout: 180_000,
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      ...env,
      TTX_USER_DATA: userData,
      TTX_HEADLESS: '1',
      NODE_ENV: 'test',
    },
  })
  const page = await app.firstWindow({ timeout: 180_000 })
  await page.waitForLoadState('domcontentloaded')
  const invoke = async (channel, payload) => {
    const r = await page.evaluate(([c, p]) => globalThis.ttx.invoke(c, p), [channel, payload])
    if (!r.ok) throw new Error(`${channel} failed: ${r.error.code} ${r.error.message}`)
    return r.data
  }
  return { app, userData, invoke }
}

/**
 * Poll jobs:get until the job ends. Resolves with the finished job; throws when it ends in
 * error or cancelled (unless `allowError`, which resolves with the failed job) or times out.
 */
export async function waitForJob(invoke, jobId, label, timeoutMs, opts = {}) {
  const { log = () => {}, pollMs = 5000, allowError = false } = opts
  const started = Date.now()
  let last = ''
  for (;;) {
    const job = await invoke('jobs:get', { jobId })
    if (job.message && job.message !== last) {
      last = job.message
      log(`  ${label}: ${job.message}`)
    }
    if (/done|error|cancelled/.test(job.status)) {
      if (job.status !== 'done' && !allowError)
        throw new Error(`${label} ${job.status}: ${job.error ?? ''}`)
      return job
    }
    if (Date.now() - started > timeoutMs) throw new Error(`${label} timed out`)
    await sleep(pollMs)
  }
}
