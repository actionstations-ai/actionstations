// Test support: replay recorded/hand-built HTTP fixtures (tests/fixtures/providers) through a
// stubbed global fetch. Bodies are streamed in small chunks so parsers see split events.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { vi } from 'vitest'

export interface HttpFixture {
  name: string
  status: number
  contentType: string
  body: string
  headers?: Record<string, string>
}

export const FIXTURE_DIR = resolve('tests/fixtures/providers')

export function loadFixture(name: string): HttpFixture {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8')) as HttpFixture
}

/** A streaming Response whose body arrives in `chunkSize`-byte pieces. */
export function chunkedResponse(
  body: string | Uint8Array,
  init: {
    status?: number
    contentType?: string
    headers?: Record<string, string>
    chunkSize?: number
  } = {},
): Response {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  const size = init.chunkSize ?? 97
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size))
      controller.close()
    },
  })
  return new Response(stream, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/json', ...init.headers },
  })
}

export function fixtureResponse(f: HttpFixture | string, chunkSize?: number): Response {
  const fx = typeof f === 'string' ? loadFixture(f) : f
  return chunkedResponse(fx.body, {
    status: fx.status,
    contentType: fx.contentType,
    headers: fx.headers,
    chunkSize,
  })
}

export interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/**
 * Stub global fetch with a queue of responses (or a function). Returns the captured calls.
 */
export function stubFetch(
  responses:
    | (Response | (() => Response) | Error)[]
    | ((call: RecordedCall) => Response | Promise<Response>),
): RecordedCall[] {
  const calls: RecordedCall[] = []
  const queue = Array.isArray(responses) ? [...responses] : undefined
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const call: RecordedCall = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === 'string' ? safeParse(init.body) : init.body,
    }
    calls.push(call)
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!queue) return (responses as (c: RecordedCall) => Response)(call)
    const next = queue.shift()
    if (!next) throw new Error(`Unexpected fetch #${calls.length}: ${call.method} ${call.url}`)
    if (next instanceof Error) throw next
    return typeof next === 'function' ? next() : next
  })
  return calls
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

/** SSE body from OpenAI-style chunk objects (plus the [DONE] sentinel). */
export function openAiSse(chunks: unknown[]): string {
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
}

export const LIVE = process.env.LIVE === '1'
