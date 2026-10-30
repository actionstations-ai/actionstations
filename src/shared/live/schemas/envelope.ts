import { z } from 'zod'
import { MESSAGE_TYPES, PROTOCOL_VERSION } from '../protocol'

/** 128 random bits, base64url, no padding. Session ids come from the server, client ids from the device. */
export const Base64Url22 = z.string().regex(/^[A-Za-z0-9_-]{22}$/)
export const SessionId = Base64Url22
export const ClientId = z.union([Base64Url22, z.literal('server')])
export type ClientId = z.infer<typeof ClientId>

/** base64url, no padding, of exactly `bytes` bytes. */
export function Base64UrlBytes(bytes: number) {
  const chars = Math.ceil((bytes * 4) / 3)
  return z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${chars}}$`))
}
export const Base64Url = z.string().regex(/^[A-Za-z0-9_-]*$/)

export const Destination = z
  .string()
  .regex(
    /^(all|controller|role:[A-Za-z0-9][A-Za-z0-9_-]{0,127}|team:[A-Za-z0-9][A-Za-z0-9_-]{0,127}|client:[A-Za-z0-9_-]{22})$/,
  )
export type Destination = z.infer<typeof Destination>

/**
 * Reserved role ids (#412): every evaluator seat filters on `role:evaluators`, every observer on
 * `role:observers`; `simcell` is the SimCell helper's seat (#518), reached by `client:<id>` only.
 */
export const RESERVED_ROLE_IDS = ['evaluators', 'observers', 'simcell'] as const

export const MessageTypeSchema = z.enum(MESSAGE_TYPES)

/** Key name inside a ciphertext: `s<epoch>` the players key, `t<epoch>` the staff key. */
export const KeyName = z.string().regex(/^[st][1-9]\d{0,3}$/)
export type KeyName = z.infer<typeof KeyName>
/** `c`: sealed to the controller with a per-message ECDH key (`e` is the sender's ephemeral public key). */
export const CONTROLLER_KEY_NAME = 'c'
export const Nonce = Base64UrlBytes(12)

/** AES-256-GCM output: ciphertext || 128-bit tag. */
export const Ciphertext = z
  .strictObject({
    k: z.union([KeyName, z.literal(CONTROLLER_KEY_NAME)]),
    n: Nonce,
    c: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(350_000),
    e: Base64UrlBytes(65).optional(),
  })
  .refine((c) => (c.k === CONTROLLER_KEY_NAME) === (c.e !== undefined), {
    message: 'e (ephemeral public key) goes with k "c" and nothing else',
    path: ['e'],
  })
export type Ciphertext = z.infer<typeof Ciphertext>

export const Signature = Base64UrlBytes(64)

export const Envelope = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  session: SessionId,
  seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  from: ClientId,
  to: Destination,
  type: MessageTypeSchema,
  ts: z.number().int().positive(), // sender's wall clock, epoch ms; informational
  payload: z.union([Ciphertext, z.record(z.string(), z.unknown())]), // plaintext only for PLAINTEXT_TYPES
  sig: Signature.optional(), // ECDSA P-256 raw r||s
})
export type Envelope = z.infer<typeof Envelope>

/** The authenticated header: everything but `payload` and `sig`. */
export type EnvelopeHeader = Omit<Envelope, 'payload' | 'sig'>

export function isCiphertext(payload: Envelope['payload']): payload is Ciphertext {
  return Ciphertext.safeParse(payload).success
}
