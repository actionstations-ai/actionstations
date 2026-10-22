// Messages between the main process (embed-host.ts) and the embedding utilityProcess.

export type WorkerRequest =
  | { id: number; op: 'embed'; modelsDir: string; model: string; texts: string[] }
  | { id: number; op: 'dispose' }

export type WorkerReply =
  | { id: number; ok: true; vectors: Float32Array[] }
  | { id: number; ok: false; code: string; message: string }
