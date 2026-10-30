/**
 * The partner invite a host hands to a co-controller (spec 0440 FR-19, spec 0406 "Co-controllers").
 * It carries everything the partner's app needs to join the host's session as a controller: the
 * staff invite link (the staff key and the host's public keys), the server it lives on, and a
 * controller token minted for that partner. It is a secret: whoever holds it holds the partner's
 * seat, so the host shows it once and never writes it to disk or to the session log.
 *
 *   asp1.<base64url(JSON)>
 */
import { z } from 'zod'
import { SafeId } from '../schemas/common'
import { fromBase64Url, toBase64Url } from './bytes'
import { parseInvite } from './invite'

export const PARTNER_INVITE_PREFIX = 'asp1.'
const MAX_INVITE_CHARS = 8192

const Fingerprint = z.string().regex(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/)

const Connection = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('relay') }),
  z.strictObject({
    kind: z.literal('self-hosted'),
    url: z.url({ protocol: /^https?$/ }).max(2048),
    fingerprintSha256: Fingerprint.optional(),
    insecureHttp: z.boolean(),
  }),
])

export const PartnerInvite = z.strictObject({
  v: z.literal(1),
  /** The roster id of the organization this invite is for. */
  org: SafeId,
  name: z.string().min(1).max(120),
  connection: Connection,
  /** The staff invite link of the session. */
  link: z.url({ protocol: /^https?$/ }).max(2048),
  controllerToken: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
})
export type PartnerInvite = z.infer<typeof PartnerInvite>

export class PartnerInviteError extends Error {}

export function encodePartnerInvite(invite: PartnerInvite): string {
  const parsed = PartnerInvite.parse(invite)
  checkConsistency(parsed)
  return PARTNER_INVITE_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(parsed)))
}

/** Throws `PartnerInviteError` with a plain message for anything that is not a usable invite. */
export function decodePartnerInvite(text: string): PartnerInvite {
  const trimmed = text.trim()
  if (!trimmed.startsWith(PARTNER_INVITE_PREFIX) || trimmed.length > MAX_INVITE_CHARS) {
    throw new PartnerInviteError('This is not a partner invite. Ask the host for a new one.')
  }
  let json: unknown
  try {
    json = JSON.parse(
      new TextDecoder().decode(fromBase64Url(trimmed.slice(PARTNER_INVITE_PREFIX.length))),
    )
  } catch {
    throw new PartnerInviteError('This invite is damaged. Ask the host for a new one.')
  }
  const parsed = PartnerInvite.safeParse(json)
  if (!parsed.success) {
    throw new PartnerInviteError('This invite is incomplete. Ask the host for a new one.')
  }
  checkConsistency(parsed.data)
  return parsed.data
}

/**
 * The link must be a staff link, and a self-hosted invite must point at the server it names, so
 * the controller token is only ever presented to the server the host chose.
 */
function checkConsistency(invite: PartnerInvite): void {
  let link: ReturnType<typeof parseInvite>
  try {
    link = parseInvite(invite.link)
  } catch {
    throw new PartnerInviteError('This invite is incomplete. Ask the host for a new one.')
  }
  if (link.key.kind !== 'staff') {
    throw new PartnerInviteError('This invite does not carry the staff key. Ask for a new one.')
  }
  if (
    invite.connection.kind === 'self-hosted' &&
    new URL(invite.connection.url).origin !== new URL(invite.link).origin
  ) {
    throw new PartnerInviteError('This invite names two different servers. Ask for a new one.')
  }
}
