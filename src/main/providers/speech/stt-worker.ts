// Electron utilityProcess entry for hot wash transcription (#425). Whisper inference runs
// here, so a native crash or running out of memory only ends this child; stt-host.ts reports
// it as a PROVIDER error, and Retry resumes from the last finished window. Built as its own
// chunk via electron-vite's `?modulePath` import in stt-host.ts.
import { WorkerRequest, type WorkerReply } from './stt-protocol'
import { disposePipelines, runTranscription } from './stt-runtime'

const port = process.parentPort

function errorReply(id: number, err: unknown): WorkerReply {
  const e = err as { code?: string; message?: string }
  return { id, type: 'error', code: e.code ?? 'PROVIDER', message: e.message ?? String(err) }
}

async function handle(raw: unknown): Promise<void> {
  const parsed = WorkerRequest.safeParse(raw)
  if (!parsed.success) {
    const id = (raw as { id?: unknown })?.id
    port.postMessage(errorReply(typeof id === 'number' ? id : 0, new Error('Bad request')))
    return
  }
  const req = parsed.data
  try {
    if (req.op === 'dispose') {
      await disposePipelines()
      port.postMessage({ id: req.id, type: 'done', language: '', model: '' })
      return
    }
    await runTranscription(req, (reply) => port.postMessage(reply))
  } catch (err) {
    port.postMessage(errorReply(req.id, err))
  }
}

// One job at a time: ORT sessions are not re-entrant per model.
let chain: Promise<unknown> = Promise.resolve()
port.on('message', (e: { data: unknown }) => {
  chain = chain.then(() => handle(e.data))
})
