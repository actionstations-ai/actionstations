// Electron utilityProcess entry for local ONNX embeddings (#65). Tokenization, inference and
// pooling run here, so a native crash (e.g. ORT under memory pressure) only kills this child;
// embed-host.ts reports it as a PROVIDER error and forks a fresh one on the next request.
// Built as its own chunk via electron-vite's `?modulePath` import in embed-host.ts.
import { disposeAll, embedBatch } from './onnx-runtime'
import type { WorkerReply, WorkerRequest } from './embed-protocol'

const port = process.parentPort

async function handle(req: WorkerRequest): Promise<WorkerReply> {
  try {
    if (req.op === 'dispose') {
      await disposeAll()
      return { id: req.id, ok: true, vectors: [] }
    }
    const vectors = await embedBatch(req.modelsDir, req.model, req.texts)
    return { id: req.id, ok: true, vectors }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { id: req.id, ok: false, code: e.code ?? 'PROVIDER', message: e.message ?? String(err) }
  }
}

// Requests are handled one at a time: ORT sessions are not re-entrant per model.
let chain: Promise<unknown> = Promise.resolve()
port.on('message', (e: { data: WorkerRequest }) => {
  chain = chain.then(async () => port.postMessage(await handle(e.data)))
})
