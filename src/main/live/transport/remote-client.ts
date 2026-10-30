/**
 * The controller's side of a remote session server (specs 0406, 0408, 0409): the same HTTP
 * routes and WebSocket for the Cloudflare relay and the self-hosted server. `relay-client.ts` and
 * `self-hosted-client.ts` fix the trust rules for each; this file is the verbs.
 *
 * - `GET  /v1/health`                          what the server is, its limits, its protocol
 * - `POST /v1/sessions`                        create (self-hosted: `Bearer <serverKey>`)
 * - `POST /v1/sessions/:id/join-token|kick|end|controllers` `Bearer <controllerToken>` (the host's;
 *   `controllers` mints a co-controller's token, which cannot call these itself)
 * - `GET  /v1/sessions/:id/ws`                 the controller's WebSocket
 */
import { z } from 'zod'
import { PROTOCOL_VERSION } from '@shared/live/protocol'
import { LimitsSchema } from '@shared/live/schemas/relay'
import type { Transport } from '@shared/live/transport'
import { AppError } from '../../lib/errors'
import {
  connectController,
  describeRefusal,
  requestJson,
  type JsonResponse,
  type RemoteTarget,
} from './remote'

const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/)
const Fingerprint = z.string().regex(/^([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/)

export const HealthBody = z.object({
  kind: z.enum(['lan', 'relay', 'self-hosted']),
  version: z.string().max(40),
  protocol: z.array(z.number().int()).max(10),
  caps: LimitsSchema,
  playerBundleSha256: Sha256Hex.optional(),
  fingerprintSha256: Fingerprint.optional(),
})
export type HealthBody = z.infer<typeof HealthBody>

const ControllerBody = z.object({ controllerToken: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) })

const CreatedBody = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  controllerToken: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  caps: LimitsSchema,
  expiresAt: z.number(),
})
export type CreatedSession = z.infer<typeof CreatedBody>

export interface HealthResult {
  health: HealthBody
  /** The certificate the server presented, when it spoke https. */
  certificate?: { fingerprint256: string; authorized: boolean }
}

export interface SessionAuth {
  sessionId: string
  controllerToken: string
}

export interface RemoteClientOptions {
  target: RemoteTarget
  /** Self-hosted only: sent as the bearer of `POST /v1/sessions`. */
  serverKey?: string
}

export interface RemoteClient {
  readonly target: RemoteTarget
  /** `inspect` lets an unknown self-signed certificate through so it can be shown, never trusted. */
  health(opts?: { inspect?: boolean }): Promise<HealthResult>
  create(): Promise<CreatedSession>
  setJoinToken(auth: SessionAuth, joinTokenHash: string): Promise<void>
  kick(auth: SessionAuth, client: string): Promise<void>
  end(auth: SessionAuth): Promise<void>
  /** Mint a token for a co-controller (#517). Host token only. */
  addController(auth: SessionAuth): Promise<string>
  connect(auth: SessionAuth, clientId: string): Promise<Transport>
  /** Does the server accept this key? `unsupported` when it has no dry-run route. */
  probeKey(): Promise<'accepted' | 'refused' | 'unsupported'>
}

function parseOrThrow<T>(schema: z.ZodType<T>, res: JsonResponse, what: string): T {
  const parsed = schema.safeParse(res.body)
  if (!parsed.success) {
    throw new AppError('PROVIDER', `The server's ${what} was not in the expected form.`)
  }
  return parsed.data
}

function ensureOk(res: JsonResponse): void {
  if (res.status < 200 || res.status >= 300) throw describeRefusal(res)
}

export function createRemoteClient(opts: RemoteClientOptions): RemoteClient {
  const { target } = opts
  const post = async (path: string, bearer: string | undefined, body?: unknown) => {
    const res = await requestJson(target, {
      method: 'POST',
      path,
      ...(bearer ? { bearer } : {}),
      ...(body !== undefined ? { body } : {}),
    })
    ensureOk(res)
    return res
  }
  const action = (auth: SessionAuth, name: 'join-token' | 'kick' | 'end', body?: unknown) =>
    post(`/v1/sessions/${auth.sessionId}/${name}`, auth.controllerToken, body ?? {}).then(
      () => undefined,
    )
  return {
    target,
    async health(h) {
      const res = await requestJson(target, {
        method: 'GET',
        path: '/v1/health',
        ...(h?.inspect ? { inspect: true } : {}),
      })
      ensureOk(res)
      return {
        health: parseOrThrow(HealthBody, res, 'health answer'),
        ...(res.certificate ? { certificate: res.certificate } : {}),
      }
    },
    async create() {
      const res = await post('/v1/sessions', opts.serverKey, { v: PROTOCOL_VERSION })
      return parseOrThrow(CreatedBody, res, 'session answer')
    },
    setJoinToken: (auth, joinTokenHash) => action(auth, 'join-token', { joinTokenHash }),
    kick: (auth, client) => action(auth, 'kick', { client }),
    end: (auth) => action(auth, 'end'),
    async addController(auth) {
      const res = await post(`/v1/sessions/${auth.sessionId}/controllers`, auth.controllerToken, {})
      return parseOrThrow(ControllerBody, res, 'controller token answer').controllerToken
    },
    connect: (auth, clientId) => connectController(target, { ...auth, clientId }),
    async probeKey() {
      const res = await requestJson(target, {
        method: 'POST',
        path: '/v1/sessions/probe',
        ...(opts.serverKey ? { bearer: opts.serverKey } : {}),
        body: {},
      })
      if (res.status === 401) return 'refused'
      if (res.status >= 200 && res.status < 300) return 'accepted'
      return 'unsupported'
    },
  }
}
