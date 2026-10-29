// Choosing the connection (#410), through the real app: This computer, the Action Stations relay
// and Your server, the last two against local stand-ins for the servers (no deployed relay).
// Checks that nothing reaches a server before Test or Start and before the facilitator confirmed
// what is sent, that a self-signed server's fingerprint is shown and pinned, and that a session
// started on each remote kind ends its server session on Stop.
import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startTestServer } from '../../src/main/live/transport/test-remote-server'
import { invoker, launch } from '../helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

test('live: choose each connection, test it, start and stop', async () => {
  test.setTimeout(180_000)
  const relay = await startTestServer({ kind: 'relay' })
  const own = await startTestServer({
    kind: 'self-hosted',
    tls: true,
    serverKey: 'sk-e2e-key',
    probe: true,
  })
  const { app, page } = await launch({
    TTX_MOCK_PROVIDERS: '1',
    TTX_LIVE_BIND: '127.0.0.1',
    TTX_LIVE_RELAY_URL: relay.base,
  })
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-conn-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Connection E2E',
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
    await expect(page.getByRole('radiogroup', { name: 'How will devices connect?' })).toBeVisible()

    // This computer: the test passes without any network traffic to a server.
    await page.getByRole('button', { name: 'Test connection' }).click()
    await expect(page.getByRole('region', { name: 'Test results' })).toContainText(
      'This computer is on a network',
    )

    // Action Stations relay: nothing is sent until the exercise is confirmed and Test is pressed.
    await page.getByLabel(/Action Stations relay/).check()
    await expect(page.getByRole('button', { name: 'Test connection' })).toBeDisabled()
    await page.getByRole('button', { name: 'I understand, continue' }).click()
    await expect(page.getByRole('button', { name: 'Test connection' })).toBeEnabled()
    expect(relay.requests).toEqual([])
    await page.getByRole('button', { name: 'Test connection' }).click()
    await expect(page.getByRole('region', { name: 'Test results' })).toContainText(
      'Passed: The server answered',
    )
    expect(relay.requests).toEqual(['GET /v1/health'])
    await page.getByRole('button', { name: 'Start session' }).click()
    const relayStatus = page.getByRole('status').filter({ hasText: 'Session running' })
    await expect(relayStatus).toContainText('Action Stations relay at 127.0.0.1')
    await expect(page.locator('.live-invite__url').first()).toContainText(relay.base)
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Stop session' }).click()
    await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible()
    expect(relay.requests.filter((r) => r.endsWith('/end'))).toHaveLength(1)

    // Your server: a self-signed certificate is shown, confirmed and pinned; the key is stored.
    await page.getByLabel(/Your server/).check()
    await page.getByRole('button', { name: 'I understand, continue' }).click()
    await page.getByRole('textbox', { name: 'Server address' }).fill(own.base)
    await page.getByRole('textbox', { name: 'Server key' }).fill('sk-e2e-key')
    await page.getByRole('button', { name: 'Test connection' }).click()
    await expect(page.getByText(own.fingerprintSha256!.split(':')[0]!).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start session' })).toBeDisabled()
    await page.getByRole('button', { name: 'Confirm this fingerprint' }).click()
    await expect(page.getByText('Pinned: the app accepts only this certificate.')).toBeVisible()
    await page.getByRole('button', { name: 'Test connection' }).click()
    const results = page.getByRole('region', { name: 'Test results' })
    await expect(results).toContainText('Passed: The certificate matches the pinned fingerprint')
    await expect(results).toContainText('Passed: The server accepted the key')
    await page.getByRole('button', { name: 'Start session' }).click()
    const ownStatus = page.getByRole('status').filter({ hasText: 'Session running' })
    await expect(ownStatus).toContainText('Your server at 127.0.0.1')
    await expect(ownStatus).toContainText('pinned certificate')
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Stop session' }).click()
    await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible()
    expect(own.requests.filter((r) => r.endsWith('/end'))).toHaveLength(1)

    // The server is remembered, with its key reported only as stored.
    const servers = await invoke<Array<{ url: string; hasKey: boolean }>>('live:servers-list')
    expect(servers).toEqual([expect.objectContaining({ url: own.base, hasKey: true })])
    expect(JSON.stringify(servers)).not.toContain('sk-e2e-key')
  } finally {
    await app.close()
    await relay.close()
    await own.close()
  }
})
