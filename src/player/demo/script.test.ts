import { describe, expect, it } from 'vitest'
import { createWebCryptoProvider } from '../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../shared/live/transport'
import { settle } from '../../shared/live/transport-memory'
import { FakeTimers } from '../app/fake-timers'
import { PlayerSession } from '../app/session'
import { HarnessController } from '../harness/controller'
import { memoryTransport } from './memory-transport'
import { DEMO_SEATS, DEMO_STEPS, DEMO_TITLE, runDemo } from './script'

const crypto = createWebCryptoProvider()
const flush = async (rounds = 3) => {
  for (let i = 0; i < rounds; i++) await settle()
}

async function practice() {
  const controller = await HarnessController.create({
    crypto,
    scenarioTitle: DEMO_TITLE,
    seats: DEMO_SEATS,
  })
  controller.base = 'https://practice.invalid'
  const timers = new FakeTimers()
  const session = new PlayerSession({
    url: controller.invite('players'),
    crypto,
    storage: new MemoryKeyValue(),
    connect: (kind, params) =>
      memoryTransport(
        kind,
        controller.server.connect({
          clientId: params.clientId,
          joinToken: params.joinToken,
          resumeToken: params.resumeToken,
        }),
      ),
    announcer: { announce: () => {} },
    prefs: () => ({ theme: 'system', sound: false, vibration: false, textSize: 'normal' }),
    bundleVersion: 'test',
    timers,
    now: () => timers.now,
    online: () => true,
    cue: () => {},
  })
  return { controller, session }
}

describe('practice session (spec 0446, Try a demo)', () => {
  it('waits for a seat, then delivers every scripted inject and ends the session', async () => {
    const { controller, session } = await practice()
    const queued: Array<() => void> = []
    const timers = {
      setTimeout: ((fn: () => void) => (queued.push(fn), queued.length)) as typeof setTimeout,
      clearTimeout: (() => {}) as typeof clearTimeout,
    }
    runDemo(controller, timers)
    await session.start()
    await flush()
    expect(session.store.get().phase).toBe('lobby')
    expect(session.store.get().info?.scenarioTitle).toBe(DEMO_TITLE)

    // Before a seat is taken only the seat poll is scheduled.
    queued.shift()!()
    expect(queued).toHaveLength(1)
    await session.chooseSeat('comms-lead', '')
    await flush()
    queued.shift()!()
    expect(queued).toHaveLength(DEMO_STEPS.length)
    // Run the steps themselves (awaited, so a failing step fails the test), all but the end.
    for (const step of DEMO_STEPS.slice(0, -1)) {
      await step.run(controller)
      await flush(6)
    }
    const titles = session.store.get().items.map((i) => i.title)
    for (const t of [
      'Help desk tickets spike',
      'Vendor reports suspicious sign-ins',
      'A reporter calls',
    ])
      expect(titles).toContain(t)
    await DEMO_STEPS.at(-1)!.run(controller)
    await flush(6)
    expect(session.store.get().phase).toBe('ended')
  })
})
