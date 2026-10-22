/// <reference types="electron-vite/node" />
// Main-process side of local ONNX embeddings (#65): forwards batches to an Electron
// utilityProcess (embed-worker.ts). If the child dies, pending requests fail with
// AppError('PROVIDER') and the next request forks a fresh child. Under Vitest (no
// electron-vite build, no utilityProcess) batches run in-process.
import { AppError, type ErrorCode } from '../../lib/errors'
import type { WorkerReply, WorkerRequest } from './embed-protocol'

/** The subset of Electron's UtilityProcess the host uses (a fake in unit tests). */
export interface ChildHandle {
  postMessage(message: WorkerRequest): void
  on(event: 'message', listener: (reply: WorkerReply) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  kill(): boolean
}

export type ForkChild = () => ChildHandle

export interface EmbedRunner {
  embed(modelsDir: string, model: string, texts: string[]): Promise<Float32Array[]>
  dispose(): Promise<void>
}

const REQUEST_TIMEOUT_MS = 180_000

type Pending = {
  resolve: (v: Float32Array[]) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type RequestBody =
  { op: 'embed'; modelsDir: string; model: string; texts: string[] } | { op: 'dispose' }

export class EmbedHost implements EmbedRunner {
  private child: ChildHandle | undefined
  private pending = new Map<number, Pending>()
  private nextId = 1
  /** Children forked so far (1 + restarts); read by tests and diagnostics. */
  forks = 0

  constructor(
    private readonly fork: ForkChild,
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
  ) {}

  private ensureChild(): ChildHandle {
    if (this.child) return this.child
    const child = this.fork()
    this.forks++
    child.on('message', (reply) => this.settle(reply))
    child.on('exit', (code) => this.onExit(child, code))
    this.child = child
    return child
  }

  private settle(reply: WorkerReply): void {
    const p = this.pending.get(reply.id)
    if (!p) return
    this.pending.delete(reply.id)
    clearTimeout(p.timer)
    if (reply.ok) p.resolve(reply.vectors)
    else p.reject(new AppError(reply.code as ErrorCode, reply.message))
  }

  private onExit(child: ChildHandle, code: number): void {
    if (this.child === child) this.child = undefined
    const err = new AppError(
      'PROVIDER',
      `The local embedding process stopped unexpectedly (exit code ${code}). It restarts on the next request; if this keeps happening, switch to built-in embeddings in Settings.`,
    )
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(err)
      this.pending.delete(id)
    }
  }

  private request(body: RequestBody): Promise<Float32Array[]> {
    const child = this.ensureChild()
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new AppError('PROVIDER', 'The local embedding process did not answer in time'))
        child.kill()
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      child.postMessage({ id, ...body } as WorkerRequest)
    })
  }

  embed(modelsDir: string, model: string, texts: string[]): Promise<Float32Array[]> {
    return this.request({ op: 'embed', modelsDir, model, texts })
  }

  async dispose(): Promise<void> {
    if (!this.child) return
    await this.request({ op: 'dispose' }).catch(() => undefined)
  }

  /** Stop the child (app quit). Pending requests fail; a later request forks again. */
  kill(): void {
    this.child?.kill()
  }
}

const inProcessRunner: EmbedRunner = {
  async embed(modelsDir, model, texts) {
    const { embedBatch } = await import('./onnx-runtime')
    return embedBatch(modelsDir, model, texts)
  },
  async dispose() {
    const { disposeAll } = await import('./onnx-runtime')
    await disposeAll()
  },
}

async function utilityFork(): Promise<ForkChild> {
  const [{ utilityProcess }, script] = await Promise.all([
    import('electron'),
    import('./embed-worker?modulePath').then((m) => m.default),
  ])
  return () =>
    utilityProcess.fork(script, [], {
      serviceName: 'Tabletop Generator Embeddings',
      stdio: 'inherit',
    }) as unknown as ChildHandle
}

let shared: Promise<EmbedRunner> | undefined

/** The process-wide runner: a utilityProcess host in the app, in-process under Vitest. */
export function embedRunner(): Promise<EmbedRunner> {
  shared ??= process.env.VITEST
    ? Promise.resolve(inProcessRunner)
    : utilityFork().then((fork) => new EmbedHost(fork))
  return shared
}
