// One JSON line per provider call in userData/provider-calls.jsonl (ADR-0006): metering
// only. Never prompt text, never keys. Logging failures never fail the call itself.
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { ProviderKind } from '@shared/schemas'
import { userDataPath } from '../lib/paths'
import type { ChatResponse } from './types'

export interface ProviderCallEntry {
  at: string
  providerId: string
  kind: ProviderKind
  /** 'chat' or 'embed'. */
  op: 'chat' | 'embed'
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  costUsd?: number
  durationMs: number
  structuredVia?: ChatResponse['structuredVia']
  ok: boolean
  error?: string
}

export const CALL_LOG_FILE = 'provider-calls.jsonl'

export function callLogPath(): string {
  return userDataPath(CALL_LOG_FILE)
}

let writes: Promise<void> = Promise.resolve()

/** Append an entry. Writes are serialised so lines never interleave. */
export function logProviderCall(entry: Omit<ProviderCallEntry, 'at'>): Promise<void> {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry, error: clip(entry.error) })
  writes = writes.then(() => append(line)).catch(() => undefined)
  return writes
}

async function append(line: string): Promise<void> {
  try {
    const file = callLogPath()
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.appendFile(file, line + '\n', 'utf8')
  } catch {
    /* metering is best-effort */
  }
}

function clip(s: string | undefined): string | undefined {
  return s === undefined ? undefined : s.slice(0, 300)
}

export interface CallContext {
  providerId: string
  kind: ProviderKind
  model: string
}

/** Run a chat call and log its outcome (success or failure). */
export async function withChatLog(
  ctx: CallContext,
  run: () => Promise<ChatResponse>,
): Promise<ChatResponse> {
  const started = Date.now()
  try {
    const res = await run()
    await logProviderCall({
      ...ctx,
      op: 'chat',
      model: res.model,
      inputTokens: res.usage.inputTokens,
      outputTokens: res.usage.outputTokens,
      cacheReadTokens: res.usage.cacheReadTokens,
      cacheWriteTokens: res.usage.cacheWriteTokens,
      costUsd: res.costUsd,
      durationMs: Date.now() - started,
      structuredVia: res.structuredVia,
      ok: true,
    })
    return res
  } catch (err) {
    await logFailure(ctx, 'chat', started, err)
    throw err
  }
}

/** Run an embeddings call and log it. */
export async function withEmbedLog<T>(
  ctx: CallContext,
  run: () => Promise<{ value: T; inputTokens?: number }>,
): Promise<T> {
  const started = Date.now()
  try {
    const { value, inputTokens } = await run()
    await logProviderCall({
      ...ctx,
      op: 'embed',
      inputTokens: inputTokens ?? 0,
      outputTokens: 0,
      durationMs: Date.now() - started,
      ok: true,
    })
    return value
  } catch (err) {
    await logFailure(ctx, 'embed', started, err)
    throw err
  }
}

async function logFailure(
  ctx: CallContext,
  op: 'chat' | 'embed',
  started: number,
  err: unknown,
): Promise<void> {
  await logProviderCall({
    ...ctx,
    op,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: Date.now() - started,
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  })
}
