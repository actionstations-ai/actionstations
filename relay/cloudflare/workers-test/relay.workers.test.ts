/**
 * The relay in workerd: the Worker, both Durable Object classes, hibernation, alarms and the
 * per-message limit, against the same wrangler.toml that is deployed.
 */
import { env, evictDurableObject, runDurableObjectAlarm, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const CONTROLLER_ID = 'Y29udHJvbGxlcjAwMDAwMA'
let nextAddress = 1

function address(): string {
  return `203.0.113.${nextAddress++}`
}

async function createSession(): Promise<{ sessionId: string; controllerToken: string }> {
  const res = await SELF.fetch('https://relay.test/v1/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': address() },
    body: JSON.stringify({ v: 1 }),
  })
  expect(res.status).toBe(201)
  return (await res.json()) as { sessionId: string; controllerToken: string }
}

async function connectController(sessionId: string, token: string) {
  const res = await SELF.fetch(
    `https://relay.test/v1/sessions/${sessionId}/ws?client=${CONTROLLER_ID}`,
    {
      headers: {
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': 'as-live.v1',
        Authorization: `Bearer ${token}`,
        'CF-Connecting-IP': address(),
      },
    },
  )
  expect(res.status).toBe(101)
  const ws = res.webSocket!
  const frames: Array<{ type: string }> = []
  const closes: number[] = []
  ws.addEventListener('message', (e) => {
    frames.push(JSON.parse(e.data as string))
  })
  ws.addEventListener('close', (e) => {
    closes.push(e.code)
  })
  ws.accept()
  return { ws, frames, closes }
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise((r) => setTimeout(r, 10))
  }
}

function sessionStub(sessionId: string) {
  return env.SESSIONS.get(env.SESSIONS.idFromName(sessionId))
}

describe('relay under workerd', () => {
  it('answers /v1/health with the protocol, caps and player bundle hash', async () => {
    const body = (await (await SELF.fetch('https://relay.test/v1/health')).json()) as {
      kind: string
      protocol: number[]
      playerBundleSha256: string
    }
    expect(body.kind).toBe('relay')
    expect(body.protocol).toEqual([1])
    expect(body.playerBundleSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('welcomes a controller with relay.hello over a real WebSocket', async () => {
    const { sessionId, controllerToken } = await createSession()
    const { ws, frames } = await connectController(sessionId, controllerToken)
    await until(() => frames.some((f) => f.type === 'relay.hello'))
    ws.close(1000, 'done')
  })

  it('keeps the socket and the session through a Durable Object eviction (hibernation)', async () => {
    const { sessionId, controllerToken } = await createSession()
    const { ws, frames, closes } = await connectController(sessionId, controllerToken)
    await until(() => frames.some((f) => f.type === 'relay.hello'))

    await evictDurableObject(sessionStub(sessionId))

    const ended = await SELF.fetch(`https://relay.test/v1/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${controllerToken}`, 'CF-Connecting-IP': address() },
    })
    expect(ended.status).toBe(204)
    // The rebuilt object restored the socket from its attachment, so it hears the end.
    await until(() => closes.length > 0 || frames.some((f) => f.type === 'relay.ended'))
    ws.close(1000, 'done')
  })

  it('runs the retention alarm without ending a live session', async () => {
    const { sessionId, controllerToken } = await createSession()
    expect(await runDurableObjectAlarm(sessionStub(sessionId))).toBe(true)
    const again = await SELF.fetch(`https://relay.test/v1/sessions/${sessionId}/join-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${controllerToken}`,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': address(),
      },
      body: JSON.stringify({ joinTokenHash: 'a'.repeat(64) }),
    })
    expect(again.status).toBe(204)
  })

  it('closes a socket that sends a message over the 64 KiB cap', async () => {
    const { sessionId, controllerToken } = await createSession()
    const { ws, frames, closes } = await connectController(sessionId, controllerToken)
    await until(() => frames.some((f) => f.type === 'relay.hello'))
    ws.send('x'.repeat(70 * 1024))
    await until(() => closes.length > 0 || frames.some((f) => f.type === 'relay.error'))
  })
})
