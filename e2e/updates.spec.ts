// Opt-in update check (#442) in the built app. No test reaches GitHub: TTX_UPDATE_URL points the
// check at a server on 127.0.0.1 that answers like the releases API, and every launch records
// its network traffic (e2e/net-log.ts) and fails if anything left this computer.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './helpers'
import { expectLoopbackOnly, netLog } from './net-log'
import { startServer, type TestServer } from '../src/main/packs/test-server'
import { githubRelease } from '../src/main/updates/test-release'

test.setTimeout(120_000)

const API_PATH = '/repos/actionstations-ai/actionstations/releases/latest'
let server: TestServer
const agents: string[] = []

test.beforeAll(async () => {
  server = await startServer()
  server.route(API_PATH, (req, res) => {
    agents.push(String(req.headers['user-agent']))
    const text = JSON.stringify(githubRelease())
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(text)
  })
})
test.afterAll(() => server.close())

/** A userData folder with these settings (onboarding done). */
function userDataWith(settings: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-updates-'))
  writeFileSync(
    join(dir, 'settings.json'),
    JSON.stringify({ onboardingComplete: true, ui: { tips: { enabled: false } }, ...settings }),
  )
  return dir
}

const ENV = (extra: Record<string, string> = {}) => ({
  TTX_UPDATE_URL: server.url(API_PATH),
  TTX_APP_VERSION: '0.5.0',
  TTX_UPDATE_DELAY_MS: '0',
  ...extra,
})

const banner = (page: Page) => page.getByTestId('update-banner')

test('a default install asks first and sends nothing', async () => {
  const net = netLog('updates-default')
  const before = server.hits.length
  const userData = userDataWith({})
  const { app, page } = await launch(ENV(net.env), { userData, args: net.args })
  try {
    const question = page.getByRole('region', { name: 'Check for new versions?' })
    await expect(question).toBeVisible({ timeout: 20_000 })
    await expect(question).toContainText('api.github.com')
    await page.waitForTimeout(1500)
    await expect(banner(page)).toHaveCount(0)
    await question.getByRole('button', { name: 'No thanks' }).click()
    await expect(question).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
  expect(server.hits.length, 'requests to the stand-in API').toBe(before)
  expectLoopbackOnly(net.read())
})

test('with the check on, startup finds the newer release and shows the banner', async () => {
  const userData = userDataWith({ updates: { check: 'on', askedCount: 0 } })
  const { app, page } = await launch(ENV(), { userData })
  try {
    await expect(banner(page)).toBeVisible({ timeout: 20_000 })
    await expect(banner(page)).toContainText('Action Stations 0.6.0 is available (you have 0.5.0)')
    expect(agents.at(-1)).toBe('ActionStations/0.5.0')
    await banner(page).getByRole('button', { name: 'Not now' }).click()
    await expect(banner(page)).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

test('Check now works with the check off, and the notes name this platform’s installer', async () => {
  const userData = userDataWith({ updates: { check: 'off', askedCount: 0 } })
  const net = netLog('updates-manual')
  const { app, page } = await launch(ENV(net.env), { userData, args: net.args })
  try {
    await page.getByRole('link', { name: 'Settings' }).first().click()
    const section = page.getByRole('region', { name: 'Updates' })
    await expect(section.getByRole('checkbox')).not.toBeChecked()
    await section.getByRole('button', { name: 'Check now' }).click()
    await expect(page.getByTestId('update-result')).toContainText('0.6.0 is available')
    await expect(section.getByRole('button', { name: 'Check now' })).toBeDisabled()
    await section.getByRole('button', { name: 'Release notes' }).click()
    const dialog = page.getByRole('dialog', { name: 'Action Stations 0.6.0' })
    const suffix = {
      darwin: 'mac-arm64.dmg',
      win32: 'win-x64-setup.exe',
      linux: 'linux-x86_64.AppImage',
    }[process.platform as 'darwin' | 'win32' | 'linux']
    await expect(dialog).toContainText(`actionstations-0.6.0-${suffix}`)
    await expect(dialog.getByRole('region', { name: 'Release notes' })).toContainText(
      'Tip of the day',
    )
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      const result = await new AxeBuilder({ page })
        .setLegacyMode(true)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze()
      expect(result.violations.map((v) => `[${theme}] ${v.id}: ${v.help}`)).toEqual([])
    }
    await dialog.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('link', { name: 'Projects' }).first().click()
    await expect(banner(page)).toBeVisible()
    // The uninstall note is for Windows users of 0.5.0 only.
    if (process.platform === 'win32')
      await expect(banner(page)).toContainText('Before you install:')
    else await expect(banner(page)).not.toContainText('Before you install:')
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
  expectLoopbackOnly(net.read())
})
