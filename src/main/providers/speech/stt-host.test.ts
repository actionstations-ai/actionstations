// SttHost against a fake utilityProcess (#425): the worker protocol, window saves in order
// before the job ends, crash and stall handling, cancel kills the child, bad messages fail.
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { SttHost, type SttChild, type SttJob } from './stt-host'
import { WorkerRequest, type WorkerReply } from './stt-protocol'
import type { TranscribeProgress } from '../types'

class FakeChild extends EventEmitter implements SttChild {
  received: unknown[] = []
  killed = false
  postMessage(m: unknown): void {
    this.received.push(m)
  }
  reply(r: WorkerReply | Record<string, unknown>): void {
    this.emit('message', r)
  }
  crash(code = 133): void {
    this.emit('exit', code)
  }
  kill(): boolean {
    this.killed = true
    queueMicrotask(() => this.crash(0))
    return true
  }
  get lastId(): number {
    return (this.received.at(-1) as { id: number }).id
  }
}

const JOB: SttJob = {
  modelsDir: '/models',
  model: 'onnx-community/whisper-base',
  dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
  multilingual: true,
  audioPath: '/p/scenarios/S1/hotwash/R1/audio.wav',
  fromSec: 0,
}

function setup(idleMs = 60_000) {
  const children: FakeChild[] = []
  const host = new SttHost(() => {
    children.push(new FakeChild())
    return children.at(-1)!
  }, idleMs)
  return { host, children, child: () => children.at(-1)! }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('SttHost', () => {
  it('sends a valid transcribe request and resolves after every window is saved', async () => {
    const { host, child } = setup()
    const saved: TranscribeProgress[] = []
    const job = host.transcribe(JOB, async (w) => {
      await new Promise((r) => setTimeout(r, 5))
      saved.push(w)
    })
    const c = child()
    expect(WorkerRequest.safeParse(c.received[0]).success).toBe(true)
    expect(c.received[0]).toMatchObject({ op: 'transcribe', audioPath: JOB.audioPath })
    const id = c.lastId
    const seg = { startSec: 0, endSec: 4, text: 'We lost twenty minutes.' }
    c.reply({ id, type: 'window', segments: [seg], doneUntilSec: 4, progress: 0.5 })
    c.reply({ id, type: 'window', segments: [], doneUntilSec: 8, progress: 1 })
    c.reply({ id, type: 'done', language: 'en', model: JOB.model })
    await expect(job).resolves.toEqual({ language: 'en', model: JOB.model })
    expect(saved.map((w) => w.doneUntilSec)).toEqual([4, 8])
    expect(saved[0]!.segments).toEqual([seg])
  })

  it('ignores replies for another request id', async () => {
    const { host, child } = setup()
    const onWindow = vi.fn()
    const job = host.transcribe(JOB, onWindow)
    const id = child().lastId
    child().reply({ id: id + 99, type: 'window', segments: [], doneUntilSec: 1, progress: 0 })
    child().reply({ id, type: 'done', language: 'en', model: 'm' })
    await job
    expect(onWindow).not.toHaveBeenCalled()
  })

  it('fails with PROVIDER when the child crashes, and forks a fresh one for the next job', async () => {
    const { host, child, children } = setup()
    const first = host.transcribe(JOB, () => undefined)
    child().crash(139)
    await expect(first).rejects.toMatchObject({ code: 'PROVIDER' })
    await expect(first).rejects.toThrow(/stopped unexpectedly.*exit code 139/)
    const second = host.transcribe(JOB, () => undefined)
    expect(children).toHaveLength(2)
    child().reply({ id: child().lastId, type: 'done', language: 'en', model: 'm' })
    await expect(second).resolves.toMatchObject({ language: 'en' })
  })

  it('passes a worker error through with its code', async () => {
    const { host, child } = setup()
    const job = host.transcribe(JOB, () => undefined)
    child().reply({ id: child().lastId, type: 'error', code: 'VALIDATION', message: 'Not 16 kHz' })
    await expect(job).rejects.toMatchObject({ code: 'VALIDATION', message: 'Not 16 kHz' })
  })

  it('kills the child on cancel and reports CANCELLED', async () => {
    const { host, child } = setup()
    const ac = new AbortController()
    const job = host.transcribe(JOB, () => undefined, ac.signal)
    ac.abort()
    await expect(job).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(child().killed).toBe(true)
  })

  it('refuses a second job while one runs', async () => {
    const { host } = setup()
    void host.transcribe(JOB, () => undefined).catch(() => undefined)
    await expect(host.transcribe(JOB, () => undefined)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('fails and kills the child on a malformed reply', async () => {
    const { host, child } = setup()
    const job = host.transcribe(JOB, () => undefined)
    child().reply({ id: child().lastId, type: 'window', segments: 'nope' })
    await expect(job).rejects.toThrow(/bad message/)
    expect(child().killed).toBe(true)
  })

  it('fails when a window cannot be saved', async () => {
    const { host, child } = setup()
    const job = host.transcribe(JOB, () => {
      throw new Error('disk full')
    })
    const id = child().lastId
    child().reply({ id, type: 'window', segments: [], doneUntilSec: 1, progress: 0.1 })
    child().reply({ id, type: 'done', language: 'en', model: 'm' })
    await expect(job).rejects.toThrow('disk full')
    await flush()
  })

  it('kills a child that stops answering', async () => {
    vi.useFakeTimers()
    try {
      const { host, child } = setup(1_000)
      const job = host.transcribe(JOB, () => undefined)
      const caught = job.catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(1_001)
      expect(await caught).toMatchObject({ code: 'PROVIDER' })
      expect(child().killed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
