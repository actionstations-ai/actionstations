/**
 * This computer as a co-controller in another organization's live session (spec 0440 FR-19,
 * FR-20; spec 0406 "Co-controllers"). The host gave us a partner invite: the staff key, the
 * server, and a controller token minted for us. We connect as a controller, sign what we send
 * with our organization's live key, and release only our own rows to our own roles.
 *
 * What this module will not do, whatever the page asks:
 *   - send anything the host's roster does not allow our key (rows outside our prefix, targets
 *     outside our roles, a family of frames our `permissions` leave out): checked here before a
 *     byte leaves, and again by every player's page and the host on arrival;
 *   - read anything sealed to the host: receipts reach us only as `partner.receipt`, which the
 *     host signs and addresses to this connection, and which names a role, never a device;
 *   - keep the invite, the staff key or the controller token on disk.
 */
import { join } from 'node:path'
import { createPrivateKey } from 'node:crypto'
import { toBase64Url } from '@shared/live/bytes'
import { LiveClient } from '@shared/live/client'
import { inScope, rowMatchesPrefix } from '@shared/live/codec'
import { SessionKeys } from '@shared/live/crypto/keys'
import type { CryptoProvider, EcPrivateJwk } from '@shared/live/crypto/provider'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { parseInvite } from '@shared/live/invite'
import {
  decodePartnerInvite,
  PartnerInviteError,
  type PartnerInvite,
} from '@shared/live/partner-invite'
import {
  DEFAULT_CO_PERMISSIONS,
  type BlobRef,
  type ClockState,
  type Destination,
} from '@shared/live/schemas'
import type { PartnerStatus, SessionLogInput } from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import { scenarioLayout } from '../scenario/layout'
import { getScenario } from '../scenario/store'
import { requireIdentity } from '../regional/identity'
import { getSecret } from '../secrets'
import { LogWriter } from './log'
import { Delivery, type DeliverySeat } from './releases'
import {
  emptyStage,
  formatClock,
  releaseRow,
  type DeliveryHost,
  type StageState,
} from './delivery-service'
import { createRelayClient, relayBase } from './transport/relay-client'
import type { RemoteClient } from './transport/remote-client'
import { createSelfHostedClient } from './transport/self-hosted-client'
import { safeJoin } from '../lib/fs'

export interface PartnerKeys {
  signer: Awaited<ReturnType<CryptoProvider['ecdsaImport']>>
  /** The organization's name, for the page. */
  name: string
}

export interface PartnerDeps {
  crypto: CryptoProvider
  remoteFor: (invite: PartnerInvite) => Promise<RemoteClient>
  keysFor: (orgId: string) => Promise<PartnerKeys>
  now: () => number
}

type Joined = {
  invite: PartnerInvite
  client: LiveClient
  delivery: Delivery
  log: LogWriter
  root: string
  scenarioId: string
  roleNames: Map<string, string>
  stage: StageState
  mediaCache: Map<string, BlobRef>
  clock: ClockState | undefined
  state: PartnerStatus['state']
  message?: string
  unsubscribe: (() => void)[]
}

let current: Joined | undefined

async function liveSigner(orgId: string, crypto: CryptoProvider): Promise<PartnerKeys> {
  const identity = await requireIdentity(orgId)
  const raw = await getSecret(`org-key-${orgId}`)
  if (!raw) throw new AppError('NOT_FOUND', 'The live key for this organization is missing.')
  const live = (JSON.parse(raw) as { live?: string }).live
  if (!live) throw new AppError('NOT_FOUND', 'The live key for this organization is missing.')
  const jwk = createPrivateKey({
    key: Buffer.from(live, 'base64'),
    format: 'der',
    type: 'pkcs8',
  }).export({ format: 'jwk' }) as EcPrivateJwk
  const pair = await crypto.ecdsaImport(jwk)
  if (toBase64Url(pair.publicKey) !== identity.liveKey) {
    throw new AppError('CONFLICT', 'The live key on this computer does not match the pinned one.')
  }
  return { signer: pair, name: identity.name }
}

async function remoteForInvite(invite: PartnerInvite): Promise<RemoteClient> {
  if (invite.connection.kind === 'relay') {
    if (new URL(invite.link).origin !== new URL(relayBase()).origin) {
      throw new AppError('VALIDATION', 'This invite names a relay this app does not use.')
    }
    return createRelayClient()
  }
  return createSelfHostedClient({
    url: invite.connection.url,
    ...(invite.connection.fingerprintSha256
      ? { fingerprintSha256: invite.connection.fingerprintSha256 }
      : {}),
    insecureHttp: invite.connection.insecureHttp,
  })
}

const defaultDeps = (): PartnerDeps => {
  const crypto = createWebCryptoProvider()
  return {
    crypto,
    remoteFor: remoteForInvite,
    keysFor: (orgId) => liveSigner(orgId, crypto),
    now: () => Date.now(),
  }
}

const clientRef = (crypto: CryptoProvider, id: string) =>
  crypto.sha256(new TextEncoder().encode(id)).then((h) =>
    [...h]
      .slice(0, 4)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  )

/** Join the host's session with a partner invite. One partner session at a time. */
export async function joinPartner(
  root: string,
  scenarioId: string,
  inviteText: string,
  deps: PartnerDeps = defaultDeps(),
): Promise<PartnerStatus> {
  if (current && current.state !== 'ended' && current.state !== 'error') {
    throw new AppError('CONFLICT', 'This computer is already in a partner session. Leave it first.')
  }
  let invite: PartnerInvite
  try {
    invite = decodePartnerInvite(inviteText)
  } catch (e) {
    if (e instanceof PartnerInviteError) throw new AppError('VALIDATION', e.message)
    throw e
  }
  const keys = await deps.keysFor(invite.org)
  const scenario = await getScenario(root, scenarioId)
  const joined = await connect(root, scenarioId, invite, keys, scenario.roles, deps)
  current = joined
  return statusOf(joined)
}

async function connect(
  root: string,
  scenarioId: string,
  invite: PartnerInvite,
  keys: PartnerKeys,
  roles: readonly { id: string; name: string }[],
  deps: PartnerDeps,
): Promise<Joined> {
  const link = parseInvite(invite.link)
  const sessionKeys = new SessionKeys(link.sessionId, deps.crypto, {
    controllerEcdhPub: link.controllerEcdhPub,
  })
  await sessionKeys.addEpoch(link.epoch, link.key.kind, link.key.root)
  const dir = safeJoin(scenarioLayout(root, scenarioId).dir, 'live', `partner-${link.sessionId}`)
  const log = await LogWriter.open(join(dir, 'log.jsonl'), 'role')
  const remote = await deps.remoteFor(invite)
  const clientId = toBase64Url(deps.crypto.random(16))
  const transport = await remote.connect(
    { sessionId: link.sessionId, controllerToken: invite.controllerToken },
    clientId,
  )
  const client = new LiveClient({
    transport,
    keys: sessionKeys,
    clientId,
    role: 'controller',
    crypto: deps.crypto,
    controllerPub: link.controllerPub,
    signer: keys.signer.privateKey,
    kind: invite.connection.kind,
  })
  const joined: Joined = {
    invite,
    client,
    log,
    root,
    scenarioId,
    roleNames: new Map(roles.map((r) => [r.id, r.name])),
    stage: emptyStage(),
    mediaCache: new Map(),
    clock: undefined,
    state: 'connecting',
    unsubscribe: [],
    delivery: undefined as unknown as Delivery,
  }
  joined.delivery = makeDelivery(joined, deps)
  wire(joined)
  return joined
}

/** The part of the host's roster that is ours, or undefined until it arrives. */
function ourEntry(j: Joined) {
  return j.client.roster?.controllers.find((c) => c.id === j.invite.org)
}

/** Refuse a send our roster entry does not allow. The same rule every other device applies. */
export function assertAllowed(
  roster: Joined['client']['roster'],
  org: string,
  type: 'inject.release' | 'inject.recall',
  payload: Record<string, unknown>,
): void {
  const entry = roster?.controllers.find((c) => c.id === org)
  if (!entry) {
    throw new AppError('CONFLICT', 'The host has not listed your organization yet. Try again soon.')
  }
  if (!inScope(type, payload, entry.scope)) {
    throw new AppError(
      'FORBIDDEN',
      'The host did not give your organization this row or one of its recipients.',
    )
  }
}

function makeDelivery(j: Joined, deps: PartnerDeps): Delivery {
  return new Delivery({
    send: async (type, to, payload, key) => {
      assertAllowed(j.client.roster, j.invite.org, type, payload)
      return j.client.send(type, to as Destination, payload as never, { key })
    },
    log: { append: (input: SessionLogInput) => j.log.append(input) },
    clientRef: (id) => clientRef(deps.crypto, id),
    now: deps.now,
    changed: () => undefined,
    seats: () => pseudoSeats(j),
  })
}

/** One seat per role we may reach: receipts come back by role, never by device. */
function pseudoSeats(j: Joined): DeliverySeat[] {
  return (ourEntry(j)?.scope.roleIds ?? []).map((id) => ({
    clientId: `role-${id}`,
    kind: 'player',
    roleId: id,
    label: j.roleNames.get(id) ?? id,
  }))
}

function wire(j: Joined): void {
  const { client } = j
  j.unsubscribe.push(
    client.onState((s) => {
      if (s === 'closed' && j.state === 'joined') {
        j.state = 'error'
        j.message = 'The connection to the host was lost.'
      }
    }),
    client.on('relay.hello', () => {
      j.state = 'joined'
      delete j.message
      // The host's roster and clock were sent before this connection existed.
      client.requestCatchup(0)
    }),
    client.on('clock.state', (m) => {
      if (m.signedBy === 'host') j.clock = m.payload
    }),
    client.on('partner.receipt', (m) => {
      // Only the host's word, addressed to this connection, counts.
      if (m.signedBy !== 'host' || m.to !== `client:${client.clientId}`) return
      if (!m.payload.roleId) return
      void j.delivery.onReceipt(`role-${m.payload.roleId}`, m.seq, m.payload).catch(() => undefined)
    }),
    client.on('session.end', (m) => {
      if (m.signedBy !== 'host') return
      j.state = 'ended'
      client.close()
    }),
  )
}

function hostFor(j: Joined): DeliveryHost {
  return {
    root: j.root,
    scenarioId: j.scenarioId,
    client: j.client,
    delivery: j.delivery,
    stage: j.stage,
    mediaCache: j.mediaCache,
    clock: async () => j.clock ?? { elapsedMin: 0, rate: 1 },
    alive: () => current === j && j.state === 'joined',
    staging: () => undefined,
  }
}

const need = (root: string, scenarioId: string): Joined => {
  if (!current || current.root !== root || current.scenarioId !== scenarioId) {
    throw new AppError('NOT_FOUND', 'This computer is not in a partner session for this exercise.')
  }
  return current
}

/** Release one of our rows to our own roles. */
export async function releasePartnerRow(root: string, scenarioId: string, rowId: string) {
  const j = need(root, scenarioId)
  if (j.state !== 'joined') throw new AppError('CONFLICT', 'You are not connected to the host.')
  const entry = ourEntry(j)
  if (!entry) throw new AppError('CONFLICT', 'The host has not listed your organization yet.')
  const permissions = entry.scope.permissions ?? DEFAULT_CO_PERMISSIONS
  const mayRow =
    permissions.includes('inject') &&
    (entry.scope.all || entry.scope.rowPrefixes.some((p) => rowMatchesPrefix(rowId, p)))
  if (!mayRow) throw new AppError('FORBIDDEN', `${rowId} is not one of your organization's rows.`)
  return releaseRow(hostFor(j), { rowId })
}

function statusOf(j: Joined): PartnerStatus {
  const entry = ourEntry(j)
  return {
    state: j.state,
    orgId: j.invite.org,
    orgName: j.invite.name,
    ...(j.message ? { message: j.message } : {}),
    ...(entry
      ? {
          scope: {
            rowPrefixes: entry.scope.rowPrefixes,
            roleIds: entry.scope.roleIds,
            permissions: [...(entry.scope.permissions ?? DEFAULT_CO_PERMISSIONS)],
          },
        }
      : {}),
    ...(j.clock ? { clock: formatClock(j.clock, Date.now()) } : {}),
    releases: [],
  }
}

export async function partnerStatus(root: string, scenarioId: string): Promise<PartnerStatus> {
  if (!current || current.root !== root || current.scenarioId !== scenarioId) {
    return { state: 'off', releases: [] }
  }
  return { ...statusOf(current), releases: await current.delivery.summaries() }
}

/** Leave: close the connection and forget the invite. Our own log stays in the exercise folder. */
export async function leavePartner(): Promise<void> {
  const j = current
  current = undefined
  if (!j) return
  for (const off of j.unsubscribe) off()
  j.client.close()
  await j.log.flush().catch(() => undefined)
}
