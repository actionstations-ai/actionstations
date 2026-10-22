// First-run setup wizard (#48) in the built app. A fresh userData lands on /welcome; the run
// completes with the seeded mock provider (TTX_MOCK_PROVIDERS=1) and checks that a relaunch
// opens Projects. Real LM Studio / ComfyUI / voice server parts are asserted only when those
// services answer on localhost. Screenshots of every step, light and dark, go to
// .tmp/onboarding/ (kept across runs; test-results/ is wiped).
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launch } from './helpers'

const OUT = resolve('.tmp/onboarding')

async function reachable(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(800) })).ok
  } catch {
    return false
  }
}

let shot = 0
async function snap(page: Page, name: string) {
  shot += 1
  const n = String(shot).padStart(2, '0')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(OUT, `${n}-${name}-${scheme}.png`), fullPage: true })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

const stepHeading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 2, name, exact: true })

async function textStep(page: Page, lmStudio: boolean) {
  await expect(stepHeading(page, 'Choose a text model')).toBeVisible()
  const local = page.getByRole('list', { name: 'Local text services' })
  await expect(local.getByText('LM Studio', { exact: true })).toBeVisible()
  if (lmStudio) {
    await expect(local.getByRole('button', { name: 'Add LM Studio' })).toBeVisible()
    await expect(local.getByLabel('LM Studio model')).not.toHaveValue(/embed/)
  }
  await page.getByRole('radio', { name: /Mock \(offline\)/ }).check()
  await page.getByRole('button', { name: 'Test', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Replied/ })).toHaveText(
    /Replied “Mock response\.” in \d+ ms/,
  )
  await snap(page, 'text-model')
  await page.getByRole('button', { name: 'Use this model' }).click()
}

async function mediaStep(page: Page, comfy: boolean, voice: boolean) {
  await expect(stepHeading(page, 'Media (optional)')).toBeVisible()
  if (comfy) {
    await page.getByRole('button', { name: 'Add ComfyUI' }).click()
    await expect(page.getByText(/default workflows have the nodes|Missing nodes/)).toBeVisible({
      timeout: 15_000,
    })
  }
  if (voice) {
    await page.getByRole('button', { name: 'Connect voice server' }).click()
    await expect(page.getByLabel('Voice model')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Check voice server' }).click()
    await expect(page.getByRole('status').filter({ hasText: /Reachable in \d+ ms/ })).toBeVisible()
  }
  await snap(page, 'media')
  await page.getByRole('button', { name: /Save and continue|Skip media/ }).click()
}

async function projectStep(page: Page, parentDir: string) {
  await expect(stepHeading(page, 'Create your first project')).toBeVisible()
  await page.getByLabel('Project name').fill('Rivergate Airport')
  await page.getByLabel('Organization', { exact: true }).fill('Rivergate Airport Authority')
  await page.getByLabel('Location').fill(parentDir)
  await snap(page, 'project')
  await page.getByRole('button', { name: 'Create project' }).click()
}

test('fresh install runs the setup wizard, persists completion and relaunches to Projects', async () => {
  test.setTimeout(120_000)
  mkdirSync(OUT, { recursive: true })
  const [lmStudio, comfy, voice] = await Promise.all([
    reachable('http://127.0.0.1:1234/v1/models'),
    reachable('http://127.0.0.1:8188/system_stats'),
    reachable('http://127.0.0.1:8765/v1/models'),
  ])
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-onboarding-'))
  const first = await launch({ TTX_MOCK_PROVIDERS: '1' }, { onboarding: true })
  const { page, userData } = first
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(stepHeading(page, 'Welcome to Action Stations')).toBeVisible()
    expect(page.url()).toContain('#/welcome')
    await expect(page.getByRole('button', { name: 'Skip setup' })).toBeVisible()
    await snap(page, 'welcome')
    await page.getByRole('button', { name: 'Get started' }).click()

    await textStep(page, lmStudio)
    await mediaStep(page, comfy, voice)

    await expect(stepHeading(page, 'Search quality')).toBeVisible()
    await expect(page.getByRole('radio', { name: /Fast and offline/ })).toBeChecked()
    await snap(page, 'search')
    await page.getByRole('button', { name: 'Continue' }).click()

    await projectStep(page, parentDir)
    await expect(stepHeading(page, 'You’re set up')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import documents…' })).toBeVisible()
    await snap(page, 'done')
    await expect
      .poll(
        () => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).onboardingComplete,
      )
      .toBe(true)
  } finally {
    await first.app.close()
  }

  const second = await launch({ TTX_MOCK_PROVIDERS: '1' }, { userData })
  try {
    await expect(second.page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()
    await expect(second.page.getByText('Rivergate Airport').first()).toBeVisible()
  } finally {
    await second.app.close()
  }
})

test('Skip setup is always available and lands on Projects', async () => {
  const { app, page, userData } = await launch({}, { onboarding: true })
  try {
    await expect(stepHeading(page, 'Welcome to Action Stations')).toBeVisible()
    await page.getByRole('button', { name: /Search quality/ }).click()
    await expect(stepHeading(page, 'Search quality')).toBeVisible()
    await page.getByRole('button', { name: 'Skip setup' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()
    const settings = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
    expect(settings.onboardingComplete).toBe(true)
  } finally {
    await app.close()
  }
})
