/// <reference types="electron-vite/node" />
// Runs heavy parsers (PDF) in a worker_thread so the main process stays responsive.
// Under Vitest (no electron-vite build) parsing runs in-process.
import { promises as fs } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { basename } from 'node:path'
import { AppError, type ErrorCode } from '../lib/errors'
import { needsWorker, parseFile, parserKindFor } from './parsers'
import type { ParsedDocument } from './types'

type WorkerReply =
  { ok: true; result: ParsedDocument } | { ok: false; code: ErrorCode; message: string }

async function workerScriptPath(): Promise<string | undefined> {
  if (process.env.VITEST) return undefined
  const mod = await import('./parse-worker?modulePath')
  return mod.default
}

const BASE_TIMEOUT_MS = 2 * 60_000
const PER_10MB_MS = 60_000
const MAX_TIMEOUT_MS = 30 * 60_000

/**
 * How long one file may parse before its worker is terminated (#210): two minutes plus one
 * per 10 MB, capped at 30 minutes, so a pathological file cannot hold an ingest slot forever.
 */
export function parseTimeoutMs(bytes: number): number {
  return Math.min(MAX_TIMEOUT_MS, BASE_TIMEOUT_MS + Math.ceil(bytes / 10_000_000) * PER_10MB_MS)
}

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000))

export function runWorker(
  script: string,
  filePath: string,
  displayName: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ParsedDocument> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { workerData: { filePath, displayName } })
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      fn()
      void worker.terminate()
    }
    const timer = setTimeout(() => {
      const message = `Parsing ${displayName} took longer than ${minutes(timeoutMs)} min and was stopped. The file may be damaged or too complex; try exporting it again or converting it to another format.`
      settle(() => reject(new AppError('INTERNAL', message)))
    }, timeoutMs)
    const onAbort = () => settle(() => reject(new AppError('CANCELLED', 'Cancelled')))
    signal?.addEventListener('abort', onAbort, { once: true })
    worker.once('message', (reply: WorkerReply) =>
      settle(() =>
        reply.ok ? resolve(reply.result) : reject(new AppError(reply.code, reply.message)),
      ),
    )
    worker.once('error', (err) =>
      settle(() => reject(new AppError('INTERNAL', `Parser crashed: ${err.message}`))),
    )
    worker.once('exit', (code) =>
      settle(() => reject(new AppError('INTERNAL', `Parser exited unexpectedly (code ${code})`))),
    )
  })
}

/** Parse a file, off-thread when the format is heavy. */
export async function parseDocument(
  filePath: string,
  displayName = basename(filePath),
  signal?: AbortSignal,
): Promise<ParsedDocument> {
  const script = needsWorker(parserKindFor(filePath)) ? await workerScriptPath() : undefined
  if (!script) return parseFile(filePath, displayName, signal ? { signal } : {})
  const { size } = await fs.stat(filePath)
  return runWorker(script, filePath, displayName, signal, parseTimeoutMs(size))
}
