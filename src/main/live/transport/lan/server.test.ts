// The LAN server's HTTP surface (spec 0407 FR-6, Security): the fixed route table, headers,
// traversal attempts, health without session data, the blob route's token check, the fallback
// endpoints' refusals, and a stop that releases the port.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { toBase64Url } from '@shared/live/bytes'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { SessionHub } from '@shared/live/hub'
import { LIMITS } from '@shared/live/protocol'
import { LanLog } from './log'
import { routeOf, startLanServer, type LanServer } from './server'
import { httpGet } from './test-clients'

const crypto = createWebCryptoProvider()
const SESSION = toBase64Url(new Uint8Array(16).fill(5))
const JOIN = new Uint8Array(16).fill(7)

async function start(tls: 'self-signed' | 'none' = 'none', withBundle = false) {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-lan-srv-'))
  const bundleDir = join(dir, 'player')
  if (withBundle) {
    mkdirSync(join(bundleDir, 'assets'), { recursive: true })
    writeFileSync(join(bundleDir, 'index.html'), '<!doctype html><title>Player</title>')
    writeFileSync(join(bundleDir, 'assets', 'app-1234.js'), 'console.log("player")')
  }
  const hash = [...(await crypto.sha256(JOIN))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const hub = new SessionHub({ sessionId: SESSION, kind: 'lan', joinTokenHash: hash, crypto })
  const lan = await startLanServer({
    address: '127.0.0.1',
    port: 0,
    tls,
    hub,
    bundleDir,
    log: new LanLog(join(dir, 'lan.log')),
    version: '0.6.0-test',
  })
  const origin = lan.status.url.slice(0, lan.status.url.indexOf('/s/'))
  return { lan, hub, origin, dir }
}

describe('routeOf', () => {
  it('admits exactly the served paths', () => {
    expect(routeOf('/')).toEqual({ kind: 'static', path: '/' })
    expect(routeOf('/v1/health')).toEqual({ kind: 'static', path: '/v1/health' })
    expect(routeOf(`/s/${SESSION}`)).toEqual({ kind: 'static', path: `/s/${SESSION}` })
    expect(routeOf('/assets/app.js')).toEqual({ kind: 'static', path: '/assets/app.js' })
    expect(routeOf(`/v1/sessions/${SESSION}/ws`)).toEqual({
      kind: 'v1',
      route: 'ws',
      sessionId: SESSION,
    })
    expect(routeOf(`/v1/sessions/${SESSION}/blobs/${SESSION}`)?.kind).toBe('v1')
    for (const bad of [
      '/s/short',
      '/assets/../x',
      '/assets//x',
      '/index.html',
      '/v1/sessions',
      `/v1/sessions/${SESSION}/other`,
      '/..',
    ]) {
      expect(routeOf(bad), bad).toBeUndefined()
    }
  })
})

describe('LAN server HTTP surface', () => {
  let running: LanServer | undefined
  afterEach(async () => {
    await running?.stop()
    running = undefined
  })

  it('serves the root page with the CSP and hardening headers and no session id', async () => {
    const { lan, origin } = await start('self-signed')
    running = lan
    const res = await httpGet(`${origin}/`)
    expect(res.status).toBe(200)
    expect(res.headers['content-security-policy']).toContain("default-src 'none'")
    expect(res.headers['content-security-policy']).toContain(
      `connect-src 'self' wss://127.0.0.1:${lan.status.port}`,
    )
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
    expect(res.body.toString()).not.toContain(SESSION)
    expect(lan.status.fingerprintSha256).toMatch(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/)
  })

  it('serves the player page for a session path, the placeholder without a bundle', async () => {
    const { lan, origin } = await start()
    running = lan
    const res = await httpGet(`${origin}/s/${SESSION}`)
    expect(res.status).toBe(200)
    expect(res.body.toString()).toContain('not part of this build yet')
    expect(res.body.toString()).not.toContain(SESSION)
  })

  it('serves bundle assets as immutable and refuses traversal, unknown paths and wrong methods', async () => {
    const { lan, origin } = await start('none', true)
    running = lan
    const page = await httpGet(`${origin}/s/${SESSION}`)
    expect(page.body.toString()).toContain('<title>Player</title>')
    const asset = await httpGet(`${origin}/assets/app-1234.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(asset.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(asset.body.toString()).toBe('console.log("player")')
    for (const path of [
      '/assets/../index.html',
      '/assets/%2e%2e/%2e%2e/etc/passwd',
      '/assets/..%2f..%2fetc/passwd',
      '/index.html',
      '/assets/',
      '/assets/missing.js',
      '/etc/passwd',
    ]) {
      const r = await httpGet(`${origin}${path}`)
      expect(r.status, path).toBe(404)
      expect(JSON.parse(r.body.toString())).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found' },
      })
    }
    expect((await httpGet(`${origin}/assets/app-1234.js`, { method: 'POST' })).status).toBe(405)
  })

  it('answers /v1/health with kind, version, protocol and caps and nothing about the session', async () => {
    const { lan, origin } = await start()
    running = lan
    const res = await httpGet(`${origin}/v1/health`)
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body.toString())).toEqual({
      kind: 'lan',
      version: '0.6.0-test',
      protocol: [1],
      caps: LIMITS.lan,
    })
    expect(res.body.toString()).not.toContain(SESSION)
  })

  it('needs a valid join token on the blob route and knows only its own session', async () => {
    const { lan, origin } = await start()
    running = lan
    const blob = toBase64Url(new Uint8Array(16).fill(9))
    const other = toBase64Url(new Uint8Array(16).fill(1))
    expect((await httpGet(`${origin}/v1/sessions/${SESSION}/blobs/${blob}`)).status).toBe(401)
    const wrong = toBase64Url(new Uint8Array(16).fill(8))
    expect(
      (await httpGet(`${origin}/v1/sessions/${SESSION}/blobs/${blob}?j=${wrong}`)).status,
    ).toBe(401)
    expect(
      (await httpGet(`${origin}/v1/sessions/${SESSION}/blobs/${blob}?j=${toBase64Url(JOIN)}`))
        .status,
    ).toBe(404)
    expect(
      (await httpGet(`${origin}/v1/sessions/${other}/blobs/${blob}?j=${toBase64Url(JOIN)}`)).status,
    ).toBe(404)
    expect((await httpGet(`${origin}/v1/sessions/${other}/events`)).status).toBe(404)
  })

  it('refuses the fallback endpoints without parameters and a send without a stream', async () => {
    const { lan, origin } = await start()
    running = lan
    expect((await httpGet(`${origin}/v1/sessions/${SESSION}/events`)).status).toBe(401)
    const q = `j=${toBase64Url(JOIN)}&c=${toBase64Url(new Uint8Array(16).fill(3))}&r=${toBase64Url(new Uint8Array(16).fill(4))}`
    const send = await httpGet(`${origin}/v1/sessions/${SESSION}/send?${q}`, {
      method: 'POST',
      body: '{}',
    })
    expect(send.status).toBe(409)
    expect((await httpGet(`${origin}/v1/sessions/${SESSION}/send?${q}`)).status).toBe(405)
    expect((await httpGet(`${origin}/v1/sessions/${SESSION}/ws?${q}`)).status).toBe(400)
  })

  it('rejects a WebSocket upgrade without join parameters before the handshake', async () => {
    const { lan, origin } = await start()
    running = lan
    const ws = new WebSocket(`${origin.replace('http', 'ws')}/v1/sessions/${SESSION}/ws`)
    const outcome = await new Promise<string>((resolve) => {
      ws.on('unexpected-response', (_req, res) => resolve(`http ${res.statusCode}`))
      ws.on('open', () => resolve('open'))
      ws.on('error', (e) => resolve(`error ${e.message}`))
    })
    expect(outcome).toMatch(/^(http 400|error .*400)/)
    expect(lan.connected).toBe(0)
  })

  it('releases the port at stop and refuses later requests', async () => {
    const { lan, origin } = await start()
    expect(lan.status.port).toBeGreaterThan(0)
    await lan.stop()
    await expect(httpGet(`${origin}/v1/health`)).rejects.toThrow(/ECONNREFUSED/)
    await lan.stop() // idempotent
  })
})
