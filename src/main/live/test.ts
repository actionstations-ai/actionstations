/**
 * The connection test (spec 0410 FR-4): a checklist for the chosen connection, run only when the
 * facilitator presses Test or Start. LAN touches no network (it binds a port for an instant and
 * lists addresses); the relay and a self-hosted server get one `GET /v1/health`, and a server key
 * gets one dry-run check. Every line says what passed, what did not and what to do next.
 */
import { stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { PROTOCOL_VERSION } from '@shared/live/protocol'
import { RELAY_PLAYER_BUNDLE_SHA256 } from '@shared/live/servers'
import type { ConnectionCheck, ConnectionTestResult, LiveConnection } from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import { playerBundleDir } from '../lib/paths'
import { validateConnection } from './connection'
import { listLanAddresses } from './transport/lan/addresses'
import { DEFAULT_PORT } from './transport/lan/server'
import { createRelayClient } from './transport/relay-client'
import { CERT_CHANGED_MESSAGE, normalizeServerUrl } from './transport/remote'
import type { HealthBody, HealthResult, RemoteClient } from './transport/remote-client'
import { createSelfHostedClient, hasServerKey } from './transport/self-hosted-client'

type Server = NonNullable<ConnectionTestResult['server']>
type SelfHosted = Extract<LiveConnection, { kind: 'self-hosted' }>

const pass = (id: string, label: string, detail?: string): ConnectionCheck => ({
  id,
  label,
  status: 'pass',
  ...(detail ? { detail } : {}),
})
const warn = (id: string, label: string, detail: string, nextStep?: string): ConnectionCheck => ({
  id,
  label,
  status: 'warn',
  detail,
  ...(nextStep ? { nextStep } : {}),
})
const fail = (id: string, label: string, detail: string, nextStep?: string): ConnectionCheck => ({
  id,
  label,
  status: 'fail',
  detail,
  ...(nextStep ? { nextStep } : {}),
})

const result = (checks: ConnectionCheck[], server?: Server): ConnectionTestResult => ({
  ok: checks.every((c) => c.status !== 'fail'),
  checks,
  ...(server ? { server } : {}),
})

function tryListen(port: number, host: string): Promise<'ok' | 'in-use' | 'unavailable'> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', (e: NodeJS.ErrnoException) =>
      resolve(e.code === 'EADDRINUSE' ? 'in-use' : 'unavailable'),
    )
    srv.listen(port, host, () => srv.close(() => resolve('ok')))
  })
}

async function portCheck(host: string, port: number): Promise<ConnectionCheck> {
  const bound = await tryListen(port, host)
  if (bound === 'ok') return pass('port', `Port ${port} is free on ${host}`)
  if (bound === 'in-use') {
    return warn('port', `Port ${port} is in use`, 'The session will use the next free port.')
  }
  return fail(
    'port',
    `This computer cannot listen on ${host}`,
    'The address is not available.',
    'Pick another address from the list.',
  )
}

async function lanTest(c: Extract<LiveConnection, { kind: 'lan' }>): Promise<ConnectionTestResult> {
  const addresses = listLanAddresses()
  const checks: ConnectionCheck[] =
    addresses.length === 0
      ? [
          fail(
            'network',
            'This computer is on a network',
            'No network address was found.',
            'Join a Wi-Fi network or plug in Ethernet, then test again.',
          ),
        ]
      : [
          pass(
            'network',
            'This computer is on a network',
            addresses.map((a) => a.address).join(', '),
          ),
        ]
  const host = c.address ?? addresses.find((a) => a.recommended)?.address ?? addresses[0]?.address
  if (host) checks.push(await portCheck(host, c.port ?? DEFAULT_PORT))
  const bundle = await stat(playerBundleDir()).then(
    (s) => s.isDirectory(),
    () => false,
  )
  checks.push(
    bundle
      ? pass('bundle', 'The player page is installed with this app')
      : fail(
          'bundle',
          'The player page is missing',
          'This build has no player page.',
          'Reinstall Action Stations.',
        ),
  )
  return result(checks, { kind: 'lan' })
}

function protocolCheck(health: HealthBody): ConnectionCheck {
  if (health.protocol.includes(PROTOCOL_VERSION)) {
    return pass('protocol', 'The server speaks the same protocol', `Protocol ${PROTOCOL_VERSION}`)
  }
  const newer = Math.max(...health.protocol) > PROTOCOL_VERSION
  return fail(
    'protocol',
    'The server speaks a different protocol',
    `The server speaks protocol ${health.protocol.join(', ')}; this app speaks ${PROTOCOL_VERSION}.`,
    newer
      ? 'Update Action Stations, or ask your administrator to update the server.'
      : 'Ask your administrator to update the server.',
  )
}

function capsCheck(health: HealthBody): ConnectionCheck {
  const c = health.caps
  const mib = Math.round(c.blobBytes / (1024 * 1024))
  return pass('caps', 'Limits', `${c.clients} devices, ${mib} MiB per media file`)
}

function bundleCheck(health: HealthBody, kind: Server['kind']): ConnectionCheck | undefined {
  const theirs = health.playerBundleSha256
  if (!theirs) return undefined
  if (kind !== 'relay' || !RELAY_PLAYER_BUNDLE_SHA256 || theirs === RELAY_PLAYER_BUNDLE_SHA256) {
    return pass('bundle', 'The server serves a player page')
  }
  return warn(
    'bundle',
    'The relay runs a different player page than this app shipped with',
    'It may be newer or older. Session content stays encrypted either way.',
  )
}

function healthChecks(res: HealthResult, kind: 'relay' | 'self-hosted'): ConnectionCheck[] {
  const { health } = res
  const checks = [
    pass('reachable', 'The server answered', `Version ${health.version}`),
    protocolCheck(health),
    capsCheck(health),
  ]
  const bundle = bundleCheck(health, kind)
  if (bundle) checks.push(bundle)
  return checks
}

function serverOf(res: HealthResult, kind: 'relay' | 'self-hosted', host: string): Server {
  const bundle = res.health.playerBundleSha256
  return {
    kind,
    host,
    version: res.health.version,
    protocol: res.health.protocol,
    ...(bundle && kind === 'relay' && RELAY_PLAYER_BUNDLE_SHA256
      ? { playerBundleMatches: bundle === RELAY_PLAYER_BUNDLE_SHA256 }
      : {}),
  }
}

/** A refused or failed request as a failing line, with the next step for the common causes. */
function failedLine(id: string, label: string, err: unknown): ConnectionCheck {
  const e = err instanceof AppError ? err : new AppError('INTERNAL', String(err))
  const code = (e.details as { code?: string } | undefined)?.code
  const next =
    code === 'DAILY_LIMIT'
      ? 'The relay is free and has a daily limit. Try again tomorrow, or use This computer or Your server.'
      : e.message === CERT_CHANGED_MESSAGE
        ? 'Do not continue until your IT team confirms the new fingerprint.'
        : undefined
  return fail(id, label, e.message, next)
}

async function relayTest(): Promise<ConnectionTestResult> {
  const label = 'The relay answered'
  try {
    const client = createRelayClient()
    const res = await client.health()
    return result(
      healthChecks(res, 'relay'),
      serverOf(res, 'relay', new URL(client.target.base).host),
    )
  } catch (err) {
    return result([failedLine('reachable', label, err)], { kind: 'relay' })
  }
}

async function keyCheck(client: RemoteClient, hasKey: boolean): Promise<ConnectionCheck> {
  if (!hasKey) {
    return warn(
      'key',
      'No server key yet',
      'Creating a session needs the key your administrator gave you.',
      'Enter the server key and test again.',
    )
  }
  try {
    const answer = await client.probeKey()
    if (answer === 'accepted') return pass('key', 'The server accepted the key')
    if (answer === 'unsupported') {
      return warn(
        'key',
        'The key is checked when the session starts',
        'This server has no dry-run check.',
      )
    }
    return fail(
      'key',
      'The server refused the key',
      'The key does not match this server.',
      'Check the key with your administrator; it changes when they rotate it.',
    )
  } catch (err) {
    return failedLine('key', 'The server accepted the key', err)
  }
}

function certificateCheck(
  c: SelfHosted,
  res: HealthResult,
): { check?: ConnectionCheck; fingerprint?: string; untrusted?: boolean } {
  const cert = res.certificate
  if (!cert) return {}
  const fingerprint = cert.fingerprint256.toUpperCase()
  if (c.fingerprintSha256) {
    return {
      check: pass('certificate', 'The certificate matches the pinned fingerprint'),
      fingerprint,
    }
  }
  if (cert.authorized) {
    return {
      check: pass('certificate', 'The certificate is trusted by this computer'),
      fingerprint,
    }
  }
  return {
    check: warn(
      'certificate',
      'The certificate is not trusted yet',
      'It is not signed by an authority this computer knows, which is normal for a self-signed server.',
      'Compare the fingerprint with the one your IT team gave you, then confirm it.',
    ),
    fingerprint,
    untrusted: true,
  }
}

async function selfHostedTest(c: SelfHosted, serverKey?: string): Promise<ConnectionTestResult> {
  try {
    const url = normalizeServerUrl(c.url, c.insecureHttp)
    const client = await createSelfHostedClient({
      url,
      ...(c.fingerprintSha256 ? { fingerprintSha256: c.fingerprintSha256 } : {}),
      insecureHttp: c.insecureHttp,
      ...(serverKey ? { serverKey } : {}),
    })
    const res = await client.health({ inspect: !c.fingerprintSha256 })
    const cert = certificateCheck(c, res)
    const checks = healthChecks(res, 'self-hosted')
    if (cert.check) checks.splice(1, 0, cert.check)
    // Nothing is sent that carries the key to a server whose certificate is not yet confirmed.
    if (!cert.untrusted) {
      checks.push(await keyCheck(client, Boolean(serverKey) || (await hasServerKey(url))))
    }
    return result(checks, {
      ...serverOf(res, 'self-hosted', new URL(url).host),
      ...(cert.fingerprint ? { fingerprintSha256: cert.fingerprint } : {}),
      ...(cert.untrusted ? { untrusted: true } : {}),
    })
  } catch (err) {
    return result([failedLine('reachable', 'The server answered', err)], { kind: 'self-hosted' })
  }
}

export async function connectionTest(
  connection: LiveConnection,
  opts: { serverKey?: string } = {},
): Promise<ConnectionTestResult> {
  let c: LiveConnection
  try {
    c = validateConnection(connection)
  } catch (err) {
    return result([failedLine('address', 'The address is usable', err)], { kind: connection.kind })
  }
  if (c.kind === 'lan') return lanTest(c)
  if (c.kind === 'relay') return relayTest()
  return selfHostedTest(c, opts.serverKey)
}
