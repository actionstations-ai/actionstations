/// <reference types="electron-vite/node" />
// Main-process side of hot wash transcription (#425), the counterpart of embed-host.ts: forks
// the speech-to-text utilityProcess on demand, runs one job at a time, kills the child on
// cancel and forks a fresh one for the next job after a crash. Window replies are handed to
// the caller in order, and the job waits for each one to be saved before it finishes. Under
// Vitest (no electron-vite build, no utilityProcess) jobs run in-process.
import { AppError, type ErrorCode } from '../../lib/errors'
import { WorkerReply, type TranscribeRequest, type WorkerRequest } from './stt-protocol'
import type { TranscribeProgress } from '../types'

/** The subset of Electron's UtilityProcess the host uses (a fake in unit tests). */
export interface SttChild {
  postMessage(message: WorkerRequest): void
  on(event: 'message', listener: (reply: unknown) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  kill(): boolean
}
export type ForkSttChild = () => SttChild

export type SttJob = Omit<TranscribeRequest, 'id' | 'op'>
export interface SttResult {
  language: string
  model: string
}
export type OnWindow = (p: TranscribeProgress) => void | Promise<void>

export interface SttRunner {
  transcribe(job: SttJob, onWindow: OnWindow, signal?: AbortSignal): Promise<SttResult>
  dispose(): Promise<void>
}

/** A window of 30 s takes seconds; ten minutes without a reply means the worker is stuck. */
const IDLE_TIMEOUT_MS = 10 * 60_000

interface Active {
  id: number
  child: SttChild
  resolve: (r: SttResult) => void
  reject: (e: Error) => void
  onWindow: OnWindow
  /** Window saves run in order; `done` resolves after the last one. */
  saved: Promise<void>
  timer: ReturnType<typeof setTimeout> | undefined
  settled: boolean
}

export class SttHost implements SttRunner {
  private child: SttChild | undefined
  private active: Active | undefined
  private nextId = 1
  /** Children forked so far (1 + restarts); read by tests. */
  forks = 0

  constructor(
    private readonly fork: ForkSttChild,
    private readonly idleTimeoutMs = IDLE_TIMEOUT_MS,
  ) {}

  private ensureChild(): SttChild {
    if (this.child) return this.child
    const child = this.fork()
    this.forks++
    child.on('message', (raw) => this.onMessage(child, raw))
    child.on('exit', (code) => this.onExit(child, code))
    this.child = child
    return child
  }

  private fail(a: Active, err: Error, kill: boolean): void {
    if (a.settled) return
    a.settled = true
    clearTimeout(a.timer)
    if (this.active === a) this.active = undefined
    if (kill) a.child.kill()
    a.reject(err)
  }

  private armTimer(a: Active): void {
    clearTimeout(a.timer)
    a.timer = setTimeout(
      () =>
        this.fail(
          a,
          new AppError('PROVIDER', 'The transcription process stopped responding.'),
          true,
        ),
      this.idleTimeoutMs,
    )
  }

  private onMessage(child: SttChild, raw: unknown): void {
    const a = this.active
    if (!a || a.child !== child) return
    const parsed = WorkerReply.safeParse(raw)
    if (!parsed.success) {
      this.fail(a, new AppError('PROVIDER', 'The transcription process sent a bad message.'), true)
      return
    }
    const reply = parsed.data
    if (reply.id !== a.id) return
    this.armTimer(a)
    if (reply.type === 'window') {
      const { segments, doneUntilSec, progress } = reply
      a.saved = a.saved.then(() => a.onWindow({ segments, doneUntilSec, progress }))
      a.saved.catch((err: unknown) => this.fail(a, err as Error, true))
    } else if (reply.type === 'done') {
      void a.saved.then(
        () => {
          if (a.settled) return
          a.settled = true
          clearTimeout(a.timer)
          if (this.active === a) this.active = undefined
          a.resolve({ language: reply.language, model: reply.model })
        },
        () => undefined,
      )
    } else {
      this.fail(a, new AppError(reply.code as ErrorCode, reply.message), false)
    }
  }

  private onExit(child: SttChild, code: number): void {
    if (this.child === child) this.child = undefined
    const a = this.active
    if (a?.child === child)
      this.fail(
        a,
        new AppError(
          'PROVIDER',
          `The transcription process stopped unexpectedly (exit code ${code}). Retry continues from the last finished part; if it keeps happening, choose a smaller model.`,
        ),
        false,
      )
  }

  transcribe(job: SttJob, onWindow: OnWindow, signal?: AbortSignal): Promise<SttResult> {
    if (this.active)
      return Promise.reject(new AppError('CONFLICT', 'Another transcription is running.'))
    if (signal?.aborted) return Promise.reject(new AppError('CANCELLED', 'Transcription cancelled'))
    const child = this.ensureChild()
    const id = this.nextId++
    return new Promise<SttResult>((resolve, reject) => {
      const a: Active = {
        id,
        child,
        resolve,
        reject,
        onWindow,
        saved: Promise.resolve(),
        timer: undefined,
        settled: false,
      }
      this.active = a
      this.armTimer(a)
      signal?.addEventListener(
        'abort',
        () => this.fail(a, new AppError('CANCELLED', 'Transcription cancelled'), true),
        { once: true },
      )
      child.postMessage({ ...job, id, op: 'transcribe' })
    })
  }

  async dispose(): Promise<void> {
    if (this.active) return
    this.child?.kill()
    this.child = undefined
  }

  /** Stop the child (app quit). A running job fails; a later job forks again. */
  kill(): void {
    this.child?.kill()
  }
}

/** Vitest: the same runtime in this process (tests inject a fake pipeline loader). */
const inProcessRunner: SttRunner = {
  async transcribe(job, onWindow, signal) {
    const { runTranscription } = await import('./stt-runtime')
    let result: SttResult = { language: '', model: '' }
    let saved = Promise.resolve()
    await runTranscription(
      { ...job, id: 1, op: 'transcribe' },
      (reply) => {
        if (reply.type === 'window') saved = saved.then(() => onWindow(reply))
        else if (reply.type === 'done') result = { language: reply.language, model: reply.model }
      },
      { isCancelled: () => !!signal?.aborted },
    )
    await saved
    return result
  },
  async dispose() {
    const { disposePipelines } = await import('./stt-runtime')
    await disposePipelines()
  },
}

async function utilityFork(): Promise<ForkSttChild> {
  const [{ utilityProcess }, script] = await Promise.all([
    import('electron'),
    import('./stt-worker?modulePath').then((m) => m.default),
  ])
  return () =>
    utilityProcess.fork(script, [], {
      serviceName: 'Action Stations Transcription',
      stdio: 'inherit',
    }) as unknown as SttChild
}

let shared: Promise<SttRunner> | undefined

/** The process-wide runner: a utilityProcess host in the app, in-process under Vitest. */
export function sttRunner(): Promise<SttRunner> {
  shared ??= process.env.VITEST
    ? Promise.resolve(inProcessRunner)
    : utilityFork().then((fork) => new SttHost(fork))
  return shared
}
