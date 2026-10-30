// worker_threads entry: parses one imported hazard layer file off the main thread and posts the
// layer (or the error) back. Built as its own chunk via `?modulePath` in layer-host.ts.
import { parentPort, workerData } from 'node:worker_threads'
import { readLayerFile, type LayerRequest } from './infrastructure'

async function run(): Promise<void> {
  const { file, where, input } = workerData as LayerRequest
  try {
    parentPort?.postMessage({ ok: true, layer: await readLayerFile(file, where, input) })
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
