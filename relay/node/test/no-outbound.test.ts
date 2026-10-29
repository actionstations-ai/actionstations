/**
 * Spec 0409 FR-7: the server process makes no outbound connection. The bundled server runs as a
 * child with every way out replaced by a recorder (`no-outbound-preload.cjs`); this test drives
 * a full session against it from here (creation, a controller and a player, frames, a blob,
 * end, a signal to stop) and asserts the recorder saw nothing.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { PROTOCOL_VERSION } from '@shared/live/protocol'
import { wsTransport } from '@main/live/transport/lan/test-clients'
import { bundle } from '../scripts/build.mjs'
import { http } from './helpers'

const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'relay-outbound-'))
const outboundLog = join(dir, 'outbound.log')
let child: ChildProcess | undefined
let url = ''
let serverKey = ''
let stdout = ''

async function waitFor(cond: () => boolean, what: string, ms = 20_000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`timed out: ${what}`)
    await new Promise((r) => setTimeout(r, 25))
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

function envelope(
  session: string,
  from: string,
  seq: number,
  to: string,
  type: string,
  payload: object = {},
): string {
  return JSON.stringify({
    v: PROTOCOL_VERSION,
    session,
    seq,
    from,
    to,
    type,
    ts: Date.now(),
    payload,
  })
}

beforeAll(async () => {
  const outfile = await bundle({ outfile: join(dir, 'server.cjs') })
  child = spawn(
    process.execPath,
    [
      '--require',
      join(here, 'no-outbound-preload.cjs'),
      outfile,
      'serve',
      '--data-dir',
      join(dir, 'data'),
      '--port',
      '0',
      '--bind',
      '127.0.0.1',
      '--host',
      '127.0.0.1',
      '--insecure-http',
      '--log-level',
      'warn',
    ],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', OUTBOUND_LOG: outboundLog },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  child.stdout!.on('data', (c: Buffer) => (stdout += c.toString()))
  child.stderr!.on('data', (c: Buffer) => (stdout += c.toString()))
  await waitFor(
    () =>
      /Listening on http:\/\/127\.0\.0\.1:\d+/.test(stdout) &&
      /Server key[^:]*: [A-Za-z0-9_-]{43}/.test(stdout),
    `server start\n${stdout}`,
  )
  url = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(stdout)![1]!
  serverKey = /Server key[^:]*: ([A-Za-z0-9_-]{43})/.exec(stdout)![1]!
}, 60_000)

afterAll(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await new Promise<void>((r) => child!.once('exit', () => r()))
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('no outbound connections', () => {
  it('runs a whole session without the process opening a single connection out', async () => {
    const created = await http(`${url}/v1/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serverKey}` },
      body: '{"v":1}',
    })
    expect(created.status).toBe(201)
    const { sessionId, controllerToken } = created.json<{
      sessionId: string
      controllerToken: string
    }>()
    const joinToken = new Uint8Array(16).fill(5)
    await http(`${url}/v1/sessions/${sessionId}/join-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${controllerToken}` },
      body: JSON.stringify({ joinTokenHash: await sha256Hex(joinToken) }),
    })
    const controllerId = toBase64Url(new Uint8Array(16).fill(1))
    const playerId = toBase64Url(new Uint8Array(16).fill(2))
    const frames: string[] = []
    const closes: number[] = []
    const ctl = await wsTransport(
      url,
      sessionId,
      { clientId: controllerId },
      { protocols: ['as-live.v1'], headers: { Authorization: `Bearer ${controllerToken}` } },
    )
    const player = await wsTransport(url, sessionId, {
      clientId: playerId,
      joinToken,
      resumeToken: new Uint8Array(16).fill(6),
    })
    player.onFrame((f) => frames.push(f))
    player.onClose((c) => closes.push(c))
    await waitFor(() => frames.some((f) => f.includes('relay.hello')), 'player hello')
    ctl.send(
      envelope(sessionId, controllerId, 1, 'all', 'message.send', {
        k: 's1',
        n: 'AAAAAAAAAAAAAAAA',
        c: 'AAAAAAAAAA',
      }),
    )
    ctl.send(
      envelope(sessionId, controllerId, 2, 'controller', 'relay.blob.put', {
        blobId: toBase64Url(new Uint8Array(16).fill(9)),
        index: 0,
        count: 1,
        bytes: toBase64Url(new Uint8Array(500).fill(1)),
      }),
    )
    await waitFor(() => frames.some((f) => f.includes('message.send')), 'fan-out')
    const ended = await http(`${url}/v1/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${controllerToken}` },
      body: '',
    })
    expect(ended.status).toBe(204)
    await waitFor(() => closes.length > 0, 'close on end')
    expect(closes[0]).toBe(4002)

    child!.kill('SIGTERM')
    const code = await new Promise<number | null>((r) => child!.once('exit', (c) => r(c)))
    expect(code).toBe(0)
    const attempts = existsSync(outboundLog) ? readFileSync(outboundLog, 'utf8') : ''
    expect(attempts, 'outbound attempts recorded by the preload').toBe('')
  }, 30_000)
})
