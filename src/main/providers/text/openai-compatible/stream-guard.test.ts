// The stream guard option of the OpenAI-compatible adapter (#606): the Tabletop Mini Benchmark
// puts no time cap on a call; a call ends only when the model goes silent or loops.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { stubFetch } from '../test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { OpenAiCompatibleTextProvider } = await import('./chat')
const { clearJsonModeCache } = await import('./json-mode')

beforeAll(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-guard-'))
})
beforeEach(() => clearJsonModeCache())
afterEach(() => vi.unstubAllGlobals())

const GUARD = { firstTokenMs: 400, stallMs: 150, loopMinChars: 400, loopMinRepeats: 5 }
const messages = [{ role: 'user' as const, content: 'hi' }]

const provider = (options: ProviderConfig['options']) =>
  new OpenAiCompatibleTextProvider(
    {
      id: 'lmstudio',
      kind: 'openai-compatible',
      label: 'LM Studio',
      baseUrl: 'http://127.0.0.1:1234/v1',
      defaultModel: 'qwen3-30b-a3b-2507',
      options,
      enabled: true,
    },
    undefined,
  )

const sse = (content: string): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
const finish =
  `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 4 } })}\n\n` +
  'data: [DONE]\n\n'

/** An SSE response that sends each piece after its delay, then closes, or stays open. */
function timedStream(pieces: { after: number; text: string }[], hang = false): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const p of pieces) {
        await new Promise((r) => setTimeout(r, p.after))
        controller.enqueue(enc.encode(p.text))
      }
      if (!hang) controller.close()
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
}

describe('stream guard option', () => {
  it('ends a call that goes silent after its first tokens, with the raw tail in the error', async () => {
    stubFetch(() => timedStream([{ after: 10, text: sse('The pump trips and') }], true))
    await expect(provider({ streamGuard: GUARD }).chat({ messages })).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringMatching(/stalled.*The pump trips and/),
    })
  })

  it('ends a call that repeats itself', async () => {
    const line = 'Notify the county health office immediately. '
    const pieces = Array.from({ length: 40 }, () => ({ after: 5, text: sse(line) }))
    stubFetch(() => timedStream(pieces, true))
    await expect(provider({ streamGuard: GUARD }).chat({ messages })).rejects.toMatchObject({
      message: expect.stringMatching(/looped/),
    })
  })

  it('does not cut a reply that is slow but keeps producing tokens', async () => {
    const pieces = Array.from({ length: 12 }, (_, i) => ({ after: 60, text: sse(`w${i} `) }))
    pieces.push({ after: 5, text: finish })
    stubFetch(() => timedStream(pieces))
    const res = await provider({ streamGuard: GUARD, timeoutMs: 100 }).chat({ messages })
    expect(res.text).toContain('w11')
    expect(res.finishReason).toBe('stop')
  })
})
