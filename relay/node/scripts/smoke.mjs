#!/usr/bin/env node
// Smoke check for a running self-hosted server, from another machine:
//   AS_RELAY_KEY=<server key> node scripts/smoke.mjs https://host:8485
// It checks the health route, the player page, session creation, and a WebSocket join that
// receives relay.hello. A self-signed certificate is accepted (this is a check, not a client).
import { createHash, randomBytes } from 'node:crypto'
import { WebSocket } from 'ws'

const origin = process.argv[2]
const key = process.env.AS_RELAY_KEY
if (!origin || !key) {
  console.error('Usage: AS_RELAY_KEY=<server key> node scripts/smoke.mjs https://host:8485')
  process.exit(2)
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const b64url = (buf) => Buffer.from(buf).toString('base64url')

async function step(name, fn) {
  try {
    const detail = await fn()
    console.log(`ok   ${name}${detail ? `: ${detail}` : ''}`)
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`)
    process.exit(1)
  }
}

let created
const joinToken = randomBytes(16)
await step('health', async () => {
  const res = await fetch(`${origin}/v1/health`)
  if (!res.ok) throw new Error(`status ${res.status}`)
  const body = await res.json()
  return JSON.stringify(body)
})
await step('player page', async () => {
  const res = await fetch(`${origin}/`)
  if (!res.ok) throw new Error(`status ${res.status}`)
  return `${(await res.text()).length} bytes`
})
await step('create session', async () => {
  const joinTokenHash = createHash('sha256').update(joinToken).digest('hex')
  const res = await fetch(`${origin}/v1/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ v: 1, joinTokenHash }),
  })
  if (res.status !== 201) throw new Error(`status ${res.status} ${await res.text()}`)
  created = await res.json()
  return created.sessionId
})
await step(
  'websocket hello',
  () =>
    new Promise((resolve, reject) => {
      const protocols = ['as-live.v1', `j.${b64url(joinToken)}`, `r.${b64url(randomBytes(16))}`]
      const url = `${origin.replace(/^http/, 'ws')}/v1/sessions/${created.sessionId}/ws?client=${b64url(randomBytes(16))}`
      const ws = new WebSocket(url, protocols, { rejectUnauthorized: false })
      const timer = setTimeout(() => reject(new Error('no relay.hello within 10 s')), 10_000)
      ws.on('message', (data) => {
        if (!data.toString().includes('relay.hello')) return
        clearTimeout(timer)
        ws.close()
        resolve('relay.hello received')
      })
      ws.on('error', (e) => reject(e))
      ws.on('unexpected-response', (_req, res) => reject(new Error(`http ${res.statusCode}`)))
    }),
)
console.log('smoke check passed')
