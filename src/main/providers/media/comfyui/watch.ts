// Waiting for a queued prompt: WebSocket events (ws://host/ws?clientId=…) for progress and a
// fast completion signal, with GET /history/{id} polling as the source of truth and fallback
// when the socket cannot connect or drops.
import WebSocket from 'ws'
import { AppError } from '../../../lib/errors'
import type { MediaProgress } from '../../types'
import { VENDOR, type ComfyClient, type HistoryEntry } from './client'

export interface ComfyEvent {
  type: string
  data: Record<string, unknown>
}

type Listener = (e: ComfyEvent) => void

/** Opened before POST /prompt so no event for the new prompt is missed. Never throws. */
export class ExecutionWatcher {
  private ws: WebSocket | undefined
  private buffered: ComfyEvent[] = []
  private listener: Listener | undefined
  connected = false

  static async open(url: string, connectTimeoutMs = 3_000): Promise<ExecutionWatcher> {
    const w = new ExecutionWatcher()
    await w.connect(url, connectTimeoutMs)
    return w
  }

  private connect(url: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let ws: WebSocket
      try {
        ws = new WebSocket(url, { handshakeTimeout: timeoutMs })
      } catch {
        return resolve()
      }
      this.ws = ws
      const done = (): void => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        ws.terminate()
        done()
      }, timeoutMs)
      ws.on('open', () => {
        this.connected = true
        done()
      })
      ws.on('error', () => done())
      ws.on('close', () => {
        this.connected = false
        done()
      })
      ws.on('message', (raw, isBinary) => {
        if (!isBinary) this.receive(raw.toString())
      })
    })
  }

  private receive(text: string): void {
    let msg: { type?: unknown; data?: unknown }
    try {
      msg = JSON.parse(text) as typeof msg
    } catch {
      return
    }
    if (typeof msg.type !== 'string') return
    const event = { type: msg.type, data: (msg.data ?? {}) as Record<string, unknown> }
    if (this.listener) this.listener(event)
    else this.buffered.push(event)
  }

  /** Set the listener and replay everything received so far. */
  onEvent(listener: Listener): void {
    this.listener = listener
    const pending = this.buffered
    this.buffered = []
    for (const e of pending) listener(e)
  }

  close(): void {
    this.listener = undefined
    this.ws?.removeAllListeners('message')
    this.ws?.on('error', () => undefined)
    try {
      this.ws?.terminate()
    } catch {
      /* already closed */
    }
  }
}

export interface WaitOptions {
  signal?: AbortSignal
  timeoutMs: number
  pollMs?: number
  onProgress?: (p: MediaProgress) => void
}

/** Text of the execution_error message stored in a failed history entry. */
export function historyError(entry: HistoryEntry): string | undefined {
  if (entry.status?.status_str !== 'error') return undefined
  for (const m of entry.status.messages ?? []) {
    if (Array.isArray(m) && m[0] === 'execution_error') return describeExecutionError(m[1])
  }
  return `${VENDOR} reported an error while running the workflow`
}

export function describeExecutionError(data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>
  const where = d.node_type ? ` in ${String(d.node_type)} (node ${String(d.node_id ?? '?')})` : ''
  return `${VENDOR} failed${where}: ${String(d.exception_message ?? 'unknown error').trim()}`
}

function isFinished(entry: HistoryEntry): boolean {
  const s = entry.status
  if (!s) return Object.keys(entry.outputs ?? {}).length > 0
  return s.completed === true || s.status_str === 'success' || s.status_str === 'error'
}

/** Resolve with the finished history entry; reject on error, cancel or timeout. */
export function waitForCompletion(
  client: ComfyClient,
  promptId: string,
  watcher: ExecutionWatcher,
  opts: WaitOptions,
): Promise<HistoryEntry> {
  return new Promise<HistoryEntry>((resolve, reject) => {
    let settled = false
    let checking = false
    const pollMs = opts.pollMs ?? (watcher.connected ? 3_000 : 1_000)
    const finish = (err?: AppError, entry?: HistoryEntry): void => {
      if (settled) return
      settled = true
      clearInterval(poll)
      clearTimeout(timeout)
      opts.signal?.removeEventListener('abort', onAbort)
      if (err) reject(err)
      else resolve(entry!)
    }
    const check = async (): Promise<void> => {
      if (settled || checking) return
      checking = true
      try {
        const entry = await client.history(promptId)
        if (!entry || !isFinished(entry)) return
        const error = historyError(entry)
        finish(error ? new AppError('PROVIDER', error) : undefined, entry)
      } catch (err) {
        if (!watcher.connected)
          finish(err instanceof AppError ? err : new AppError('PROVIDER', String(err)))
      } finally {
        checking = false
      }
    }
    const onAbort = (): void => finish(new AppError('CANCELLED', 'Cancelled'))
    if (opts.signal?.aborted) return onAbort()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    const timeout = setTimeout(
      () =>
        finish(
          new AppError(
            'PROVIDER',
            `${VENDOR} did not finish within ${Math.round(opts.timeoutMs / 1000)} s`,
          ),
        ),
      opts.timeoutMs,
    )
    const poll = setInterval(() => void check(), pollMs)
    watcher.onEvent((e) => {
      if (e.data.prompt_id !== promptId) return
      handleEvent(e, opts.onProgress, () => void check(), finish)
    })
    void check()
  })
}

function handleEvent(
  e: ComfyEvent,
  onProgress: ((p: MediaProgress) => void) | undefined,
  check: () => void,
  finish: (err?: AppError) => void,
): void {
  switch (e.type) {
    case 'execution_start':
      onProgress?.({ progress: 0.05, message: 'ComfyUI started the workflow' })
      return
    case 'progress': {
      const value = Number(e.data.value)
      const max = Number(e.data.max)
      if (max > 0)
        onProgress?.({
          progress: 0.1 + 0.8 * Math.min(1, value / max),
          message: `Sampling step ${value}/${max}`,
        })
      return
    }
    case 'executing':
      if (e.data.node === null) check()
      return
    case 'execution_success':
      check()
      return
    case 'execution_error':
      finish(new AppError('PROVIDER', describeExecutionError(e.data)))
      return
    case 'execution_interrupted':
      finish(new AppError('CANCELLED', `${VENDOR} interrupted the workflow`))
      return
  }
}
