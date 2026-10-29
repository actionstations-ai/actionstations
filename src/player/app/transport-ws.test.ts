import { describe, expect, it } from 'vitest'
import { createWebSocketTransport, type BrowserSocket } from './transport-ws'

/** A scriptable socket: the test opens, delivers and closes it. */
class FakeSocket implements BrowserSocket {
  readyState = 0
  sent: string[] = []
  closedWith: [number | undefined, string | undefined] | undefined
  onopen: BrowserSocket['onopen'] = null
  onmessage: BrowserSocket['onmessage'] = null
  onclose: BrowserSocket['onclose'] = null
  onerror: BrowserSocket['onerror'] = null
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}
  send(data: string) {
    this.sent.push(data)
  }
  close(code?: number, reason?: string) {
    this.closedWith = [code, reason]
    this.readyState = 3
    this.onclose?.({ code: code ?? 1005, reason: reason ?? '' } as CloseEvent)
  }
  open() {
    this.readyState = 1
    this.onopen?.({} as Event)
  }
  deliver(frame: string) {
    this.onmessage?.({ data: frame } as MessageEvent)
  }
  fail(code = 1006) {
    this.onerror?.({} as Event)
    this.readyState = 3
    this.onclose?.({ code, reason: '' } as CloseEvent)
  }
}

describe('WebSocket transport', () => {
  function make() {
    let socket!: FakeSocket
    const t = createWebSocketTransport(
      'ws://h/v1/sessions/x/ws?client=c',
      ['as-live.v1', 'j.JOIN', 'r.RESUME'],
      (url, protocols) => (socket = new FakeSocket(url, protocols)),
    )
    return { t, socket }
  }

  it('opens the socket with the tokens in the subprotocol list, never in the URL', () => {
    const { socket } = make()
    expect(socket.protocols).toEqual(['as-live.v1', 'j.JOIN', 'r.RESUME'])
    expect(socket.url).not.toMatch(/JOIN|RESUME/)
  })

  it('queues frames sent before open and flushes them on open', async () => {
    const { t, socket } = make()
    t.send('a')
    t.send('b')
    expect(socket.sent).toEqual([])
    socket.open()
    await t.opened
    expect(socket.sent).toEqual(['a', 'b'])
    t.send('c')
    expect(socket.sent).toEqual(['a', 'b', 'c'])
  })

  it('delivers text frames and ignores binary ones', () => {
    const { t, socket } = make()
    const frames: string[] = []
    t.onFrame((f) => frames.push(f))
    socket.open()
    socket.deliver('{"a":1}')
    socket.onmessage?.({ data: new ArrayBuffer(2) } as MessageEvent)
    expect(frames).toEqual(['{"a":1}'])
  })

  it('a socket that never opens rejects `opened` and reports the close code once', async () => {
    const { t, socket } = make()
    const closes: number[] = []
    t.onClose((code) => closes.push(code))
    socket.fail(1006)
    await expect(t.opened).rejects.toThrow(/1006/)
    socket.fail(1006)
    expect(closes).toEqual([1006])
    // A late subscriber still learns the socket is gone.
    t.onClose((code) => closes.push(code))
    expect(closes).toEqual([1006, 1006])
  })

  it('close() passes the code and reason to the socket and drops later sends', () => {
    const { t, socket } = make()
    socket.open()
    t.close(4003, 'bye')
    expect(socket.closedWith).toEqual([4003, 'bye'])
    t.send('late')
    expect(socket.sent).toEqual([])
  })
})
