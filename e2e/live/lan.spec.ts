// Live play on this computer (#407): from the Facilitate page's Live tab, start a session bound
// to 127.0.0.1 (TTX_LIVE_BIND, the override every live e2e uses), read the players link, check
// the server answers /v1/health over HTTPS with its self-signed certificate and serves the join
// page to a second browser context, then stop and check nothing listens any more.
import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from '../helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

function health(origin: string): Promise<{ status: number; body: string } | { error: string }> {
  return new Promise((resolve) => {
    const req = request(`${origin}/v1/health`, { rejectUnauthorized: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c: string) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', (e: NodeJS.ErrnoException) => resolve({ error: e.code ?? e.message }))
    req.end()
  })
}

test('live: start a LAN session from Facilitate, serve the join page, stop', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1', TTX_LIVE_BIND: '127.0.0.1' })
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-live-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Live LAN E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId },
    })
    const key = encodeURIComponent(projectPath)
    await page.evaluate((h) => {
      ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
    }, `#/p/${key}/scenarios/${empty.id}/facilitate`)
    await page.getByRole('tab', { name: 'Live' }).click()
    await expect(page.getByRole('heading', { name: 'Live play on this computer' })).toBeVisible()
    await expect(page.getByLabel('Network address')).toHaveValue(/\d+\.\d+\.\d+\.\d+/)
    await page.getByRole('button', { name: 'Start session' }).click()

    const status = page.getByRole('status').filter({ hasText: 'Session running' })
    await expect(status).toContainText('Listening on 127.0.0.1:')
    await expect(status).toContainText('0 devices connected')
    const inviteUrl = (await page.locator('.live-invite__url').first().textContent()) ?? ''
    expect(inviteUrl).toMatch(/^https:\/\/127\.0\.0\.1:\d+\/s\/[A-Za-z0-9_-]{22}#[A-Za-z0-9_-]+$/)
    const origin = new URL(inviteUrl).origin
    await expect(page.getByText('Certificate fingerprint (SHA-256)')).toBeVisible()
    await expect(page.getByRole('img', { name: `Join link: ${inviteUrl}` })).toBeVisible()

    const h = await health(origin)
    expect(h).toMatchObject({ status: 200 })
    expect(JSON.parse((h as { body: string }).body)).toMatchObject({ kind: 'lan', protocol: [1] })
    expect((h as { body: string }).body).not.toContain(inviteUrl.split('/s/')[1]!.split('#')[0])

    // A phone: a second browser context that accepts the session's self-signed certificate.
    const phone = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 844 },
    })
    const joinPage = await phone.newPage()
    const response = await joinPage.goto(inviteUrl)
    expect(response?.status()).toBe(200)
    expect(response?.headers()['content-security-policy']).toContain("default-src 'none'")
    await expect(joinPage.getByRole('heading', { level: 1 })).toContainText('Action Stations')
    await phone.close()

    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Stop session' }).click()
    await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible()
    await expect
      .poll(() => health(origin).then((r) => ('error' in r ? r.error : r.status)))
      .toBe('ECONNREFUSED')
  } finally {
    await app.close()
  }
})
