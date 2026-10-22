// EmbedHost against a fake utilityProcess: request routing, crash containment and restart (#65).
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { EmbedHost, type ChildHandle } from './embed-host'
import type { WorkerReply, WorkerRequest } from './embed-protocol'

class FakeChild extends EventEmitter implements ChildHandle {
  received: WorkerRequest[] = []
  killed = false
  constructor(private readonly auto: 'reply' | 'hold' = 'reply') {
    super()
  }
  postMessage(m: WorkerRequest): void {
    this.received.push(m)
    if (this.auto === 'reply') queueMicrotask(() => this.reply(m))
  }
  reply(m: WorkerRequest): void {
    const vectors = m.op === 'embed' ? m.texts.map((t) => Float32Array.from([t.length, 1])) : []
    this.emit('message', { id: m.id, ok: true, vectors } satisfies WorkerReply)
  }
  crash(code = 133): void {
    this.emit('exit', code)
  }
  kill(): boolean {
    this.killed = true
    queueMicrotask(() => this.crash(0))
    return true
  }
}

describe('EmbedHost', () => {
  it('forks lazily once and routes replies to their requests', async () => {
    const children: FakeChild[] = []
    const host = new EmbedHost(() => {
      children.push(new FakeChild())
      return children.at(-1)!
    })
    expect(host.forks).toBe(0)
    const [a, b] = await Promise.all([
      host.embed('/m', 'Xenova/bge-small-en-v1.5', ['ab']),
      host.embed('/m', 'Xenova/bge-small-en-v1.5', ['abcd', 'x']),
    ])
    expect(a.map((v) => v[0])).toEqual([2])
    expect(b.map((v) => v[0])).toEqual([4, 1])
    expect(host.forks).toBe(1)
    expect(children[0]!.received[0]).toMatchObject({ op: 'embed', modelsDir: '/m' })
  })

  it('turns a child crash into PROVIDER errors and forks a fresh child next time', async () => {
    const children: FakeChild[] = []
    const host = new EmbedHost(() => {
      children.push(new FakeChild(children.length === 0 ? 'hold' : 'reply'))
      return children.at(-1)!
    })
    const pending = host.embed('/m', 'Xenova/bge-small-en-v1.5', ['a', 'b'])
    children[0]!.crash(133)
    await expect(pending).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringContaining('exit code 133'),
    })
    const after = await host.embed('/m', 'Xenova/bge-small-en-v1.5', ['abc'])
    expect(after[0]![0]).toBe(3)
    expect(host.forks).toBe(2)
  })

  it('passes worker-side errors through with their code', async () => {
    const child = new FakeChild('hold')
    const host = new EmbedHost(() => child)
    const p = host.embed('/m', 'Xenova/bge-small-en-v1.5', ['a'])
    child.emit('message', { id: 1, ok: false, code: 'PROVIDER', message: 'not downloaded' })
    await expect(p).rejects.toMatchObject({ code: 'PROVIDER', message: 'not downloaded' })
  })

  it('kills a child that does not answer in time', async () => {
    const child = new FakeChild('hold')
    const host = new EmbedHost(() => child, 20)
    await expect(host.embed('/m', 'Xenova/bge-small-en-v1.5', ['a'])).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringContaining('did not answer'),
    })
    expect(child.killed).toBe(true)
  })
})
