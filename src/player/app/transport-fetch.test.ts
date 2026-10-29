import { describe, expect, it } from 'vitest'
import { createFetchTransport, type Fetcher } from './transport-fetch'

/** A scripted event stream: the test writes SSE text and ends or fails it. */
function stream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) })
  const enc = new TextEncoder()
  return {
    body,
    write: (text: string) => controller.enqueue(enc.encode(text)),
    end: () => controller.close(),
    fail: () => controller.error(new Error('network')),
  }
}

const HEADERS = { 'x-as-join': 'JOIN', 'x-as-resume': 'RESUME' }

function make(opts: { status?: number; postStatus?: number; postBody?: string } = {}) {
  const s = stream()
  const calls: { url: string; init: Parameters<Fetcher>[1] }[] = []
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, init })
    if (init.method === 'GET') {
      const status = opts.status ?? 200
      return { ok: status < 300, status, body: status < 300 ? s.body : null, text: async () => '' }
    }
    return {
      ok: true,
      status: opts.postStatus ?? 202,
      body: null,
      text: async () => opts.postBody ?? '',
    }
  }
  const t = createFetchTransport('http://h/events', 'http://h/send', HEADERS, fetcher)
  return { t, s, calls }
}

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('fetch (SSE + POST) transport', () => {
  it('opens when the stream responds, sends the token headers, and delivers data frames', async () => {
    const { t, s, calls } = make()
    const frames: string[] = []
    t.onFrame((f) => frames.push(f))
    await t.opened
    expect(calls[0]!.url).toBe('http://h/events')
    expect(calls[0]!.init.headers).toMatchObject(HEADERS)
    expect(calls[0]!.init.headers.accept).toBe('text/event-stream')
    s.write(': connected\n\ndata: {"type":"relay.hello"}\n\n')
    await tick()
    expect(frames).toEqual(['{"type":"relay.hello"}'])
    expect(t.kind).toBe('fetch')
  })

  it('sends each frame as one POST with the headers and surfaces a relay.error answer as a frame', async () => {
    const { t, calls } = make({ postStatus: 400, postBody: '{"type":"relay.error"}' })
    const frames: string[] = []
    t.onFrame((f) => frames.push(f))
    await t.opened
    t.send('{"seq":1}')
    await tick()
    const post = calls.find((c) => c.init.method === 'POST')!
    expect(post.url).toBe('http://h/send')
    expect(post.init.body).toBe('{"seq":1}')
    expect(post.init.headers).toMatchObject(HEADERS)
    expect(frames).toEqual(['{"type":"relay.error"}'])
  })

  it('the server close event carries the close code, like a socket', async () => {
    const { t, s } = make()
    const closes: [number, string][] = []
    t.onClose((c, r) => closes.push([c, r]))
    await t.opened
    s.write(`event: close\ndata: ${JSON.stringify({ code: 4003, reason: 'Removed' })}\n\n`)
    await tick()
    expect(closes).toEqual([[4003, 'Removed']])
  })

  it('a refused stream rejects `opened` with 4001; a stream that ends or fails closes as 1006', async () => {
    const refused = make({ status: 401 })
    const codes: number[] = []
    refused.t.onClose((c) => codes.push(c))
    await expect(refused.t.opened).rejects.toThrow()
    expect(codes).toEqual([4001])

    const ended = make()
    const closes: number[] = []
    ended.t.onClose((c) => closes.push(c))
    await ended.t.opened
    ended.s.end()
    await tick()
    expect(closes).toEqual([1006])

    const failed = make()
    const fcodes: number[] = []
    failed.t.onClose((c) => fcodes.push(c))
    await failed.t.opened
    failed.s.fail()
    await tick()
    expect(fcodes).toEqual([1006])
  })

  it('close() aborts the stream and drops later sends', async () => {
    const { t, calls } = make()
    await t.opened
    t.close(1000, 'bye')
    t.send('late')
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false)
    expect(calls[0]!.init.signal?.aborted).toBe(true)
  })
})
