import { z } from 'zod'
import { Base64Url22, KeyName, Nonce } from './envelope'

const Text = (max: number) => z.string().max(max)

/**
 * A sealed blob (inject media, attachment, call audio). One AES-GCM message under the key
 * named by `k`, chunked only for transport; `sha256` is of the plaintext.
 */
export const BlobRef = z.strictObject({
  blobId: Base64Url22,
  kind: z.enum(['image', 'video', 'audio', 'pdf', 'file']),
  mime: z
    .string()
    .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/)
    .max(100),
  bytes: z.number().int().positive(), // plaintext size
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  k: KeyName, // key the blob is sealed under
  n: Nonce,
  name: Text(120).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().positive().optional(),
})
export type BlobRef = z.infer<typeof BlobRef>

/** What a sender knows before sealing: everything but the key material. */
export const BlobMeta = BlobRef.omit({ blobId: true, bytes: true, sha256: true, k: true, n: true })
export type BlobMeta = z.infer<typeof BlobMeta>
