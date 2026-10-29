/**
 * The fetch fallback transport (spec 0407 FR-5): frames arrive on a server-sent event stream
 * read with `fetch` (not `EventSource`, which cannot send the token headers), frames go out as
 * one `POST` each. Safari on iOS refuses a WebSocket to a certificate the user clicked through
 * for the page; this path inherits the page's acceptance. The server ends the stream with an
 * `event: close` carrying the close code so the page treats it like a socket.
 */
import { createParser } from 'eventsource-parser'
import type { Transport } from '../../shared/live/transport'

export interface StreamResponse {
  ok: boolean
  status: number
  body: ReadableStream<Uint8Array> | null
}
export type Fetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  body: ReadableStream<Uint8Array> | null
  text(): Promise<string>
}>

export interface FetchTransport extends Transport {
  kind: 'fetch'
  opened: Promise<void>
}

export function createFetchTransport(
  eventsUrl: string,
  sendUrl: string,
  headers: Record<string, string>,
  fetcher: Fetcher = (url, init) => fetch(url, { ...init, credentials: 'omit', cache: 'no-store' }),
): FetchTransport {
  const frameCbs = new Set<(frame: string) => void>()
  const closeCbs = new Set<(code: number, reason: string) => void>()
  const abort = new AbortController()
  let closed: [number, string] | undefined
  let open = false
  let resolveOpen!: () => void
  let rejectOpen!: (e: Error) => void
  const opened = new Promise<void>((resolve, reject) => {
    resolveOpen = resolve
    rejectOpen = reject
  })
  opened.catch(() => {})

  const finish = (code: number, reason: string) => {
    if (closed) return
    closed = [code, reason]
    abort.abort()
    if (!open) rejectOpen(new Error(`Stream closed before opening (${code})`))
    for (const cb of closeCbs) cb(code, reason)
  }

  const parser = createParser({
    onEvent(ev) {
      if (ev.event === 'close') {
        let code = 1000
        let reason = ''
        try {
          const parsed = JSON.parse(ev.data || '{}') as { code?: number; reason?: string }
          if (typeof parsed.code === 'number') code = parsed.code
          if (typeof parsed.reason === 'string') reason = parsed.reason
        } catch {
          // a bare close: normal closure
        }
        finish(code, reason)
        return
      }
      if (!ev.event || ev.event === 'message') for (const cb of frameCbs) cb(ev.data)
    },
  })

  void (async () => {
    let res: Awaited<ReturnType<Fetcher>>
    try {
      res = await fetcher(eventsUrl, {
        method: 'GET',
        headers: { ...headers, accept: 'text/event-stream' },
        signal: abort.signal,
      })
    } catch {
      return finish(1006, 'Stream failed')
    }
    if (!res.ok || !res.body)
      return finish(res.status === 401 ? 4001 : 1006, `Stream refused (${res.status})`)
    open = true
    resolveOpen()
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value, { stream: true }))
      }
      finish(1006, 'Stream ended')
    } catch {
      finish(1006, 'Stream interrupted')
    }
  })()

  return {
    kind: 'fetch',
    opened,
    send(frame) {
      if (closed) return
      void fetcher(sendUrl, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: frame,
      })
        .then(async (res) => {
          // A relay.error answer is a frame like any other; 202 carries nothing.
          if (res.status === 202) return
          const text = await res.text()
          if (text.startsWith('{')) for (const cb of frameCbs) cb(text)
          if (res.status >= 500) finish(1006, `Send failed (${res.status})`)
        })
        .catch(() => finish(1006, 'Send failed'))
    },
    close(code = 1000, reason = '') {
      finish(code, reason)
    },
    onFrame(cb) {
      frameCbs.add(cb)
      return () => frameCbs.delete(cb)
    },
    onClose(cb) {
      closeCbs.add(cb)
      if (closed) cb(...closed)
      return () => closeCbs.delete(cb)
    },
  }
}
