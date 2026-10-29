/**
 * Plaintext frames: the server reads or writes these, and none carries exercise content.
 */
import { z } from 'zod'
import { Base64Url, Base64Url22, ClientId, Envelope } from './envelope'

const Text = (max: number) => z.string().max(max)
const EpochMs = z.number().int().positive()
const Index = z.number().int().min(0)

export const LimitsSchema = z.strictObject({
  envelopeBytes: z.number().int().positive(),
  chunkBytes: z.number().int().positive(),
  blobBytes: z.number().int().positive(),
  playerBlobBytes: z.number().int().positive(),
  blobsTotalBytes: z.number().int().positive(),
  clients: z.number().int().positive(),
})

export const PresencePayload = z.strictObject({
  client: ClientId,
  state: z.enum(['online', 'offline']),
  at: EpochMs,
})

export const CatchupRequestPayload = z.strictObject({
  after: Index,
  limit: z.number().int().min(1).max(200).optional(),
})

/**
 * Stored envelopes addressed to this client (by `to`), each still sealed, with its arrival
 * index `i`. `from`..`to` is the index range the batch covered; entries may be sparse.
 */
export const CatchupBatchPayload = z.strictObject({
  from: Index,
  to: Index,
  entries: z.array(z.strictObject({ i: Index, e: Envelope })).max(200),
  done: z.boolean(),
})

export const RelayHello = z.strictObject({
  index: Index, // last stored index
  yourLastSeq: Index,
  /** Connected clients: sent to controller connections only. */
  clients: z
    .array(z.strictObject({ client: ClientId, since: EpochMs }))
    .max(200)
    .optional(),
  server: z.strictObject({
    kind: z.enum(['lan', 'relay', 'self-hosted']),
    version: Text(40),
    protocol: z.array(z.number().int().positive()).max(8),
  }),
  caps: LimitsSchema,
})

export const RelayErrorCode = z.enum([
  'VERSION',
  'BAD_JOIN_TOKEN',
  'BAD_RESUME_TOKEN',
  'SESSION_ENDED',
  'SESSION_FULL',
  'RATE_LIMITED',
  'TOO_LARGE',
  'STORE_FULL',
  'BLOB_TOO_LARGE',
  'BLOB_QUOTA',
  'BLOB_UNKNOWN',
  'NOT_CONTROLLER',
  'DAILY_LIMIT',
  'INVALID',
])

export const RelayError = z.strictObject({
  code: RelayErrorCode,
  message: Text(300),
  retryAfterMs: z.number().int().min(0).optional(),
  /** The blob a `BLOB_*` error is about. */
  blobId: Base64Url22.optional(),
})

/** One chunk of a sealed blob. `bytes` is base64url of at most `chunkBytes` sealed bytes. */
export const RelayBlobPut = z.strictObject({
  blobId: Base64Url22,
  index: Index,
  count: z.number().int().min(1),
  bytes: Base64Url.max(350_000),
})

export const RelayBlobGet = z.strictObject({ blobId: Base64Url22 })

export const RelayBlobChunk = RelayBlobPut

export const RelayBlobDone = z.strictObject({
  blobId: Base64Url22,
  stored: z.boolean(),
  totalBytes: z.number().int().min(0),
})

export const PLAINTEXT_PAYLOADS = {
  presence: PresencePayload,
  'catchup.request': CatchupRequestPayload,
  'catchup.batch': CatchupBatchPayload,
  'relay.hello': RelayHello,
  'relay.error': RelayError,
  'relay.blob.put': RelayBlobPut,
  'relay.blob.get': RelayBlobGet,
  'relay.blob.chunk': RelayBlobChunk,
  'relay.blob.done': RelayBlobDone,
} as const

export type PresencePayload = z.infer<typeof PresencePayload>
export type CatchupRequestPayload = z.infer<typeof CatchupRequestPayload>
export type CatchupBatchPayload = z.infer<typeof CatchupBatchPayload>
export type RelayHello = z.infer<typeof RelayHello>
export type RelayErrorCode = z.infer<typeof RelayErrorCode>
export type RelayError = z.infer<typeof RelayError>
export type RelayBlobPut = z.infer<typeof RelayBlobPut>
export type RelayBlobGet = z.infer<typeof RelayBlobGet>
export type RelayBlobChunk = z.infer<typeof RelayBlobChunk>
export type RelayBlobDone = z.infer<typeof RelayBlobDone>
