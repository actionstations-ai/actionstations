/// <reference types="electron-vite/node" />
// Runs the imported-layer parse in a worker_thread so a 100 MB file cannot freeze the main
// process. Under Vitest (no electron-vite build) it runs in-process.
import { promises as fs } from 'node:fs'
import { Worker } from 'node:worker_threads'
import type { InfrastructureLayer } from '@shared/schemas'
import { AppError, type ErrorCode } from '../../lib/errors'
import {
  MAX_LAYER_BYTES,
  readLayerFile,
  type LayerImport,
  type LayerRequest,
} from './infrastructure'

type Reply =
  { ok: true; layer: InfrastructureLayer } | { ok: false; code: ErrorCode; message: string }

/** A file the size limit allows must parse within this time or the worker is stopped. */
export const LAYER_TIMEOUT_MS = 5 * 60_000

async function workerScriptPath(): Promise<string | undefined> {
  if (process.env.VITEST) return undefined
  const mod = await import('./layer-worker?modulePath')
  return mod.default
}

/** Run a worker script on one request; exported so tests can drive a stub script. */
export function runLayerWorker(
  script: string,
  request: LayerRequest,
  timeoutMs = LAYER_TIMEOUT_MS,
): Promise<InfrastructureLayer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { workerData: request })
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
      void worker.terminate()
    }
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(new AppError('INTERNAL', 'Reading the layer file took too long and was stopped')),
        ),
      timeoutMs,
    )
    worker.once('message', (reply: Reply) =>
      settle(() =>
        reply.ok ? resolve(reply.layer) : reject(new AppError(reply.code, reply.message)),
      ),
    )
    worker.once('error', (err) =>
      settle(() => reject(new AppError('INTERNAL', `Layer parser crashed: ${err.message}`))),
    )
    worker.once('exit', (code) =>
      settle(() =>
        reject(new AppError('INTERNAL', `Layer parser exited unexpectedly (code ${code})`)),
      ),
    )
  })
}

/**
 * Import a layer file and return the layer around `where`. A file of tens of megabytes takes
 * seconds to parse, so the parse runs in a worker thread (in-process under Vitest).
 */
export async function importLayerFile(
  file: string,
  where: { lat: number; lon: number },
  input: LayerImport,
): Promise<InfrastructureLayer> {
  const stat = await fs.stat(file)
  if (!stat.isFile()) throw new AppError('VALIDATION', 'Choose a file')
  if (stat.size > MAX_LAYER_BYTES)
    throw new AppError('VALIDATION', 'The file is larger than the 100 MB limit')
  const script = await workerScriptPath()
  if (!script) return readLayerFile(file, where, input)
  return runLayerWorker(script, { file, where, input })
}
