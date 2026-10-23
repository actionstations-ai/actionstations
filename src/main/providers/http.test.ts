import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  joinUrl,
  ndjsonLines,
  providerError,
  redactSecrets,
  request,
  retryDelayMs,
  sseEvents,
} from './http'
import { chunkedResponse, stubFetch } from './text/test-fixtures'

afterEach(() => vi.unstubAllGlobals())

const fast = { vendor: 'Test', backoffBaseMs: 1 }

describe('request retry and errors', () => {
  it('retries 429 and 5xx, then returns the OK response', async () => {
    const calls = stubFetch([
      new Response('{"error":{"message":"slow down"}}', {
        status: 429,
        headers: { 'retry-after-ms': '1' },
      }),
      new Response('busy', { status: 503 }),
      new Response('ok', { status: 200 }),
    ])
    const res = await request('http://x/api', fast)
    expect(await res.text()).toBe('ok')
    expect(calls).toHaveLength(3)
  })

  it('retries network errors and gives up after the retry budget', async () => {
    const calls = stubFetch([
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
    ])
    await expect(request('http://127.0.0.1:9/x', fast)).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringContaining('unreachable at http://127.0.0.1:9'),
    })
    expect(calls).toHaveLength(4)
  })

  it('does not retry 400 and reports status plus vendor text', async () => {
    const calls = stubFetch([
      new Response('{"error":{"type":"invalid_request_error","message":"max_tokens too large"}}', {
        status: 400,
      }),
    ])
    await expect(request('http://x', fast)).rejects.toMatchObject({
      code: 'PROVIDER',
      message: 'Test HTTP 400: max_tokens too large',
      details: { status: 400 },
    })
    expect(calls).toHaveLength(1)
  })

  it('never puts the API key into error messages', async () => {
    const key = 'sk-ant-api03-SECRETSECRETSECRET'
    stubFetch([new Response(`{"error":"invalid x-api-key ${key}"}`, { status: 401 })])
    const err = await request('http://x', { ...fast, secret: key }).catch((e: Error) => e)
    expect((err as Error).message).not.toContain('SECRETSECRET')
    expect((err as Error).message).toContain('check the API key')
  })

  it('maps an aborted signal to CANCELLED without retrying', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const calls = stubFetch([new Response('ok')])
    await expect(request('http://x', { ...fast, signal: ctrl.signal })).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    expect(calls).toHaveLength(1)
  })

  it('times out when headers never arrive', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))),
        ),
    )
    await expect(request('http://x', { ...fast, timeoutMs: 20, retries: 0 })).rejects.toMatchObject(
      {
        code: 'PROVIDER',
        message: expect.stringContaining('timed out'),
      },
    )
  })
})

describe('retry delay', () => {
  it('honours retry-after seconds and caps long waits', () => {
    const res = (h: Record<string, string>) => new Response('', { status: 429, headers: h })
    expect(retryDelayMs(res({ 'retry-after': '2' }), 0, 500)).toBe(2000)
    expect(retryDelayMs(res({ 'retry-after': '3600' }), 0, 500)).toBe(30_000)
    expect(retryDelayMs(res({ 'retry-after-ms': '250' }), 0, 500)).toBe(250)
    const backoff = retryDelayMs(undefined, 2, 100)
    expect(backoff).toBeGreaterThanOrEqual(400)
    expect(backoff).toBeLessThan(500)
  })
})

describe('stream parsing', () => {
  it('parses SSE events split across chunks', async () => {
    const body = 'event: a\ndata: {"n":1}\n\nevent: b\ndata: {"n":2}\n\ndata: [DONE]\n\n'
    const events = []
    for await (const e of sseEvents(chunkedResponse(body, { chunkSize: 5 }), { vendor: 'T' }))
      events.push(e)
    expect(events.map((e) => [e.event, e.data])).toEqual([
      ['a', '{"n":1}'],
      ['b', '{"n":2}'],
      [undefined, '[DONE]'],
    ])
  })

  it('parses NDJSON lines including a trailing line without newline', async () => {
    const lines = []
    for await (const l of ndjsonLines(
      chunkedResponse('{"a":1}\n\n{"a":2}\n{"a":3}', { chunkSize: 3 }),
      {
        vendor: 'T',
      },
    ))
      lines.push(l)
    expect(lines).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }])
  })

  it('stops reading when the caller aborts mid-stream', async () => {
    const ctrl = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"a":1}\n'))
      },
    })
    const seen: unknown[] = []
    const run = (async () => {
      for await (const l of ndjsonLines(new Response(stream), {
        vendor: 'T',
        signal: ctrl.signal,
      })) {
        seen.push(l)
        ctrl.abort()
      }
    })()
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(seen).toEqual([{ a: 1 }])
  })

  it('fails a stalled stream after the idle timeout', async () => {
    const stream = new ReadableStream<Uint8Array>({ start() {} })
    const run = (async () => {
      for await (const _ of ndjsonLines(new Response(stream), { vendor: 'T', idleMs: 20 })) void _
    })()
    await expect(run).rejects.toMatchObject({ message: expect.stringContaining('stalled') })
  })
})

describe('helpers', () => {
  it('joins URLs without doubled slashes', () => {
    expect(joinUrl('http://h:1/v1/', '/models')).toBe('http://h:1/v1/models')
  })
  it('redacts bearer tokens and sk- keys', () => {
    expect(redactSecrets('Bearer abcdefghijkl sk-1234567890abcdef')).toBe(
      'Bearer [redacted] [redacted]',
    )
  })
  it('falls back to raw text for non-JSON error bodies', () => {
    expect(providerError('V', 502, '<html>Bad gateway</html>').message).toBe(
      'V HTTP 502: <html>Bad gateway</html>',
    )
  })
})

describe('redirects and key headers (#211)', () => {
  type Hit = { url: string; method: string; key: string | undefined }
  async function server(
    handle: (req: IncomingMessage, res: ServerResponse) => void,
  ): Promise<{ origin: string; hits: Hit[]; close: () => Promise<void> }> {
    const hits: Hit[] = []
    const srv = createServer((req, res) => {
      hits.push({
        url: req.url ?? '',
        method: req.method ?? '',
        key: req.headers['x-api-key'] as string | undefined,
      })
      handle(req, res)
    })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
    const { port } = srv.address() as AddressInfo
    return {
      origin: `http://127.0.0.1:${port}`,
      hits,
      close: () => new Promise((r) => srv.close(() => r())),
    }
  }
  const withKey = { ...fast, retries: 0, headers: { 'x-api-key': 'sk-test-KEYKEYKEYKEY' } }

  it('refuses a cross-origin redirect and never sends the key there', async () => {
    const other = await server((_req, res) => res.end('stolen'))
    const api = await server((_req, res) => {
      res.writeHead(307, { location: `${other.origin}/v1/messages` })
      res.end()
    })
    try {
      await expect(
        request(`${api.origin}/v1/messages`, { ...withKey, body: { a: 1 } }),
      ).rejects.toMatchObject({
        code: 'PROVIDER',
        message: expect.stringContaining('redirected to another host'),
      })
      expect(other.hits).toHaveLength(0)
    } finally {
      await Promise.all([api.close(), other.close()])
    }
  })

  it('follows a same-origin redirect with the headers and body intact', async () => {
    const api = await server((req, res) => {
      if (req.url === '/old') {
        res.writeHead(308, { location: '/new' })
        return res.end()
      }
      res.end('ok')
    })
    try {
      const res = await request(`${api.origin}/old`, { ...withKey, body: { a: 1 } })
      expect(await res.text()).toBe('ok')
      expect(api.hits.map((h) => [h.url, h.method, h.key])).toEqual([
        ['/old', 'POST', 'sk-test-KEYKEYKEYKEY'],
        ['/new', 'POST', 'sk-test-KEYKEYKEYKEY'],
      ])
    } finally {
      await api.close()
    }
  })

  it('asks fetch not to follow redirects itself', async () => {
    const seen: RequestInit['redirect'][] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen.push(init.redirect)
      return new Response('ok')
    })
    await request('http://x', fast)
    expect(seen).toEqual(['manual'])
  })
})

describe('409 retries (#211)', () => {
  it('does not retry 409 on POST', async () => {
    const calls = stubFetch([new Response('conflict', { status: 409 }), new Response('ok')])
    await expect(request('http://x', { ...fast, body: { a: 1 } })).rejects.toMatchObject({
      message: expect.stringContaining('HTTP 409'),
    })
    expect(calls).toHaveLength(1)
  })

  it('still retries 409 on GET', async () => {
    const calls = stubFetch([new Response('conflict', { status: 409 }), new Response('ok')])
    const res = await request('http://x', fast)
    expect(await res.text()).toBe('ok')
    expect(calls).toHaveLength(2)
  })
})
