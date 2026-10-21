/// <reference types="electron-vite/node" />
// Runs heavy parsers (PDF) in a worker_thread so the main process stays responsive.
// Under Vitest (no electron-vite build) parsing runs in-process.
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

function runWorker(
  script: string,
  filePath: string,
  displayName: string,
  signal?: AbortSignal,
): Promise<ParsedDocument> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { workerData: { filePath, displayName } })
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      fn()
      void worker.terminate()
    }
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
  return runWorker(script, filePath, displayName, signal)
}
