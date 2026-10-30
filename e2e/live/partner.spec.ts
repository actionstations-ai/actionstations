// A partner organization as a co-controller (#517) end to end over the harness: the built player
// page on two phones, a scripted host, and a partner client that is a second controller connection
// signing with its own key. Checks that a phone shows the partner's release inside its roster
// scope, that it drops releases outside the scope (a row, a role, a family of frames the roster
// did not grant) without a trace in the inbox, that the server refuses the partner's host-only
// frames, that the partner never sees the receipts sealed to the host, and that the host's
// forwarded receipts reach the partner by role. No Electron.
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { toBase64Url } from '../../src/shared/live/bytes'
import { LiveClient } from '../../src/shared/live/client'
import { SessionKeys } from '../../src/shared/live/crypto/keys'
import { createWebCryptoProvider } from '../../src/shared/live/crypto/webcrypto'
import { parseInvite } from '../../src/shared/live/invite'
import type { Opened } from '../../src/shared/live/codec'
import { forwardReceipt } from '../../src/main/live/partner-host'
import { HarnessController } from '../../src/player/harness/controller'
import { startHarness, type Harness } from '../../src/player/harness/server'

const { defaultBrowserType: _a, ...PIXEL } = devices['Pixel 7']!
const PARTNER_ID = 'partner-controller0000'

interface Phone {
  context: BrowserContext
  page: Page
}

async function open(browser: Browser, url: string): Promise<Phone> {
  const context = await browser.newContext({ ...PIXEL, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(url)
  return { context, page }
}

async function join(p: Phone, seat: RegExp) {
  await p.page.getByRole('radio', { name: seat }).check()
  await p.page.getByRole('button', { name: 'Join exercise' }).click()
  await expect(p.page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
}

const release = (releaseId: string, mselRowId: string, title: string, targets: string[]) => ({
  releaseId,
  mselRowId,
  title,
  injectType: 'memo',
  deliveryMode: 'hand_to_role' as const,
  text: { body: `${title} body`, altText: `${title} body` },
  exerciseTime: '1:00',
  targets: targets as never,
  media: [],
})
const id22 = (n: number) => `release${String(n).padStart(15, '0')}`

test.describe('partner co-controller over the harness', () => {
  test.setTimeout(120_000)
  let harness: Harness
  let controller: HarnessController
  let partner: LiveClient
  const crypto = createWebCryptoProvider()
  const partnerEvents: Opened[] = []

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto,
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Partner rehearsal',
    })
    harness = await startHarness({ controller })

    // The host's roster: the airport may release AIR rows to Operations, and nothing else.
    const partnerKeys = await crypto.ecdsaGenerate()
    const roster = {
      revision: 1,
      controllers: [
        {
          id: 'air',
          name: 'Airport Authority',
          publicKey: toBase64Url(partnerKeys.publicKey),
          scope: {
            rowPrefixes: ['AIR'],
            roleIds: ['ops-director', 'pio'],
            permissions: ['inject' as const],
          },
        },
      ],
    }
    controller.client.roster = roster
    await controller.client.send('controller.roster', 'all', roster, { key: 'players' })

    // The partner's own connection, from the staff invite, as a co-controller (not the host).
    const invite = parseInvite(controller.invite('staff'))
    const keys = new SessionKeys(invite.sessionId, crypto, {
      controllerEcdhPub: invite.controllerEcdhPub,
    })
    await keys.addEpoch(invite.epoch, invite.key.kind, invite.key.root)
    partner = new LiveClient({
      transport: await controller.server.connect({
        clientId: PARTNER_ID,
        controller: true,
        host: false,
      }),
      keys,
      clientId: PARTNER_ID,
      role: 'controller',
      crypto,
      controllerPub: invite.controllerPub,
      signer: partnerKeys.privateKey,
    })
    partner.onAny((m) => partnerEvents.push(m))

    // The host forwards each receipt for a partner release to that partner, by role.
    controller.client.on('inject.receipt', (m) => {
      void forwardReceipt(
        {
          releases: controller.client.scope.releases,
          roleOf: (clientId) => controller.roster.get(clientId)?.roleId,
          send: (to, payload) =>
            controller.client.send('partner.receipt', to, payload as never, { key: 'staff' }),
          log: { append: async () => undefined },
        },
        m.from,
        m.payload,
      )
    })
  })

  test.afterAll(async () => {
    partner.close()
    await harness.close()
  })

  test('phones show the partner’s release inside its scope and drop the rest', async ({
    browser,
  }) => {
    const ops = await open(browser, harness.invite('players'))
    await join(ops, /Public Information Officer/)
    const it = await open(browser, harness.invite('players'))
    await join(it, /IT Director/)
    try {
      // Inside the scope: an AIR row to Operations.
      await partner.send(
        'inject.release',
        'role:pio',
        release(id22(1), 'AIR-1', 'Board dark', ['role:pio']),
        { key: 'players' },
      )
      await expect(ops.page.getByRole('button', { name: 'Open Board dark' })).toBeVisible()

      // Outside the scope: another organization's row, a role the roster did not give, and
      // everyone. None reaches an inbox.
      await partner.send(
        'inject.release',
        'role:pio',
        release(id22(2), 'CITY-1', 'Not the airport’s row', ['role:pio']),
        { key: 'players' },
      )
      await partner.send(
        'inject.release',
        'role:it-director',
        release(id22(3), 'AIR-2', 'Wrong role', ['role:it-director']),
        { key: 'players' },
      )
      await partner.send(
        'inject.release',
        'all',
        release(id22(4), 'AIR-3', 'To everyone', ['all']),
        { key: 'players' },
      )
      // A family of frames the roster did not grant: a notice.
      await partner.send(
        'controller.notice',
        'role:pio',
        {
          noticeId: 'notice0000000000000000'.slice(0, 22),
          kind: 'text',
          level: 'urgent',
          text: 'Evacuate now',
          targets: ['role:pio'],
          dismissible: true,
        },
        { key: 'players' },
      )
      // Settle: a later in-scope release arrives after the refused ones were processed.
      await partner.send(
        'inject.release',
        'role:pio',
        release(id22(5), 'AIR-4', 'Second board', ['role:pio']),
        { key: 'players' },
      )
      await expect(ops.page.getByRole('button', { name: 'Open Second board' })).toBeVisible()
      for (const name of ['Not the airport’s row', 'Wrong role', 'To everyone']) {
        await expect(ops.page.getByRole('button', { name: `Open ${name}` })).toHaveCount(0)
        await expect(it.page.getByRole('button', { name: `Open ${name}` })).toHaveCount(0)
      }
      await expect(it.page.getByRole('button', { name: 'Open Board dark' })).toHaveCount(0)
      await expect(ops.page.getByText('Evacuate now')).toHaveCount(0)
    } finally {
      await ops.context.close()
      await it.context.close()
    }
  })

  test('the server refuses the partner’s host-only frames and the partner never sees host-sealed receipts', async ({
    browser,
  }) => {
    const ops = await open(browser, harness.invite('players'))
    await join(ops, /Public Information Officer/)
    try {
      await partner.send(
        'clock.state',
        'all',
        { elapsedMin: 600, rate: 60, reason: 'jump' },
        { key: 'players' },
      )
      await expect
        .poll(
          () =>
            partnerEvents.filter(
              (m) =>
                m.type === 'relay.error' &&
                (m.payload as { code: string }).code === 'NOT_CONTROLLER',
            ).length,
        )
        .toBeGreaterThan(0)
      expect(controller.clock.elapsedMin).toBe(0)

      await partner.send(
        'inject.release',
        'role:pio',
        release(id22(6), 'AIR-5', 'Read me', ['role:pio']),
        { key: 'players' },
      )
      await ops.page.getByRole('button', { name: 'Open Read me' }).click()

      // The phone's receipts go to the host, who forwards them to the partner by role.
      await expect
        .poll(
          () =>
            partnerEvents.filter(
              (m) =>
                m.type === 'partner.receipt' &&
                (m.payload as { releaseId: string }).releaseId === id22(6),
            ).length,
        )
        .toBeGreaterThan(0)
      const forwarded = partnerEvents.find(
        (m) =>
          m.type === 'partner.receipt' &&
          (m.payload as { releaseId: string }).releaseId === id22(6),
      ) as Opened<'partner.receipt'>
      expect(forwarded.signedBy).toBe('host')
      expect(forwarded.payload).toMatchObject({ mselRowId: 'AIR-5', roleId: 'pio' })
      expect(JSON.stringify(forwarded.payload)).not.toMatch(/client|device/i)
      // The partner's connection never carried a receipt sealed to the host.
      expect(partnerEvents.filter((m) => m.type === 'inject.receipt')).toEqual([])
      expect(partner.drops.WRONG_KEY).toBe(0)
    } finally {
      await ops.context.close()
    }
  })
})
