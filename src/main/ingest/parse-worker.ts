// worker_threads entry: parses one file off the main thread and posts the result back.
// Built as its own chunk via electron-vite's `?modulePath` import in worker-host.ts.
import { parentPort, workerData } from 'node:worker_threads'
import { parseFile } from './parsers'

interface ParseRequest {
  filePath: string
  displayName: string
}

async function run(): Promise<void> {
  const { filePath, displayName } = workerData as ParseRequest
  try {
    const result = await parseFile(filePath, displayName)
    parentPort?.postMessage({ ok: true, result })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    parentPort?.postMessage({
      ok: false,
      code: e.code ?? 'INTERNAL',
      message: e.message ?? String(err),
    })
  }
}

void run()
