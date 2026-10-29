import type { z } from 'zod'
import type { MessageType } from '../protocol'
import { SEALED_PAYLOADS } from './payloads'
import { PLAINTEXT_PAYLOADS } from './relay'

export * from './envelope'
export * from './blob'
export * from './payloads'
export * from './relay'

/** Every message type to its payload schema. */
export const PAYLOAD_SCHEMAS = { ...SEALED_PAYLOADS, ...PLAINTEXT_PAYLOADS } as const

export type PayloadSchemas = typeof PAYLOAD_SCHEMAS
export type PayloadByType = { [T in MessageType]: z.infer<PayloadSchemas[T]> }
/** What a sender passes in: defaults not yet applied. */
export type PayloadInputByType = { [T in MessageType]: z.input<PayloadSchemas[T]> }
