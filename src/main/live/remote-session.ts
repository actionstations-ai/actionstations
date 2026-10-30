/**
 * Starting a session on the relay or a self-hosted server (spec 0410 FR-5): check the connection
 * again, create the session on the server, and give the controller its WebSocket. The session
 * host (`session.ts`) treats the result like the in-process hub of a LAN session; any failure
 * after the server session exists ends it, so nothing is left running or created.
 */
import type { Limits } from '@shared/live/protocol'
import type { Transport } from '@shared/live/transport'
import type { LiveConnection } from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import { connectionTest } from './test'
import { remoteStatusOf } from './connection'
import { createRelayClient } from './transport/relay-client'
import type { RemoteClient, SessionAuth } from './transport/remote-client'
import { createSelfHostedClient } from './transport/self-hosted-client'

export type RemoteConnection = Exclude<LiveConnection, { kind: 'lan' }>

export interface RemoteHandle {
  client: RemoteClient
  auth: SessionAuth
  connection: RemoteConnection
  limits: Limits
  /** Where devices open the invite link. */
  origin: string
  status: ReturnType<typeof remoteStatusOf>
}

/** The first failing line of a test as one error that carries the whole checklist. */
function startRefusal(test: Awaited<ReturnType<typeof connectionTest>>): AppError | undefined {
  if (test.server?.untrusted) {
    return new AppError(
      'FORBIDDEN',
      "The server's certificate is not confirmed yet. Test the connection and confirm its fingerprint first.",
      test,
    )
  }
  const bad = test.checks.find((c) => c.status === 'fail')
  if (!bad) return undefined
  return new AppError(
    'PROVIDER',
    [bad.detail ?? bad.label, bad.nextStep].filter(Boolean).join(' '),
    test,
  )
}

async function clientFor(c: RemoteConnection): Promise<RemoteClient> {
  if (c.kind === 'relay') return createRelayClient()
  return createSelfHostedClient({
    url: c.url,
    ...(c.fingerprintSha256 ? { fingerprintSha256: c.fingerprintSha256 } : {}),
    insecureHttp: c.insecureHttp,
  })
}

/** Test the connection once more, then create the session on the server. */
export async function createRemoteSession(c: RemoteConnection): Promise<RemoteHandle> {
  const refusal = startRefusal(await connectionTest(c))
  if (refusal) throw refusal
  const client = await clientFor(c)
  const created = await client.create()
  const auth = { sessionId: created.sessionId, controllerToken: created.controllerToken }
  return {
    client,
    auth,
    connection: c,
    limits: created.caps,
    origin: client.target.base,
    status: remoteStatusOf(c, client.target.base, client.target.fingerprintSha256 !== undefined),
  }
}

/**
 * Reattach to a session the server still holds (resume after a restart). The server proves it
 * still has the session when the join token is registered again; nothing is created.
 */
export async function reopenRemoteSession(
  c: RemoteConnection,
  auth: SessionAuth,
): Promise<RemoteHandle> {
  const refusal = startRefusal(await connectionTest(c))
  if (refusal) throw refusal
  const client = await clientFor(c)
  const { health } = await client.health()
  return {
    client,
    auth,
    connection: c,
    limits: health.caps,
    origin: client.target.base,
    status: remoteStatusOf(c, client.target.base, client.target.fingerprintSha256 !== undefined),
  }
}

/** Register the join token hash, then open the controller's socket. */
export async function attachController(
  handle: RemoteHandle,
  joinTokenHash: string,
  controllerId: string,
): Promise<Transport> {
  await handle.client.setJoinToken(handle.auth, joinTokenHash)
  return handle.client.connect(handle.auth, controllerId)
}

/** Best effort: the server expires the session on its own if this fails. */
export async function endRemoteSession(handle: RemoteHandle): Promise<void> {
  await handle.client.end(handle.auth).catch((e: unknown) => {
    console.error('[live] remote session not ended:', (e as Error).message)
  })
}
