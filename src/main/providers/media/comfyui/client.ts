// Thin HTTP client for the ComfyUI server API: queue, history, outputs, uploads, interrupts,
// system stats and node discovery. Progress over WebSocket lives in ./watch.ts.
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { AppError } from '../../../lib/errors'
import { joinUrl, request, requestJson } from '../../http'
import type { ApiWorkflow } from '../../../comfy/workflow'
import type { NodeInfo } from './optional'

export const VENDOR = 'ComfyUI'

/** One file a node wrote ({ filename, subfolder, type }) as reported by history / executed. */
export interface ComfyFile {
  filename: string
  subfolder: string
  type: string
}

export interface HistoryEntry {
  outputs: Record<string, Record<string, unknown>>
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] }
}

interface PromptErrorBody {
  error?: { message?: string; details?: string; type?: string } | string
  node_errors?: Record<
    string,
    { class_type?: string; errors?: { message?: string; details?: string }[] }
  >
}

/** "Prompt outputs failed validation — node 4 (CheckpointLoaderSimple): Value not in list …" */
export function describePromptError(status: number, body: string): string {
  let parsed: PromptErrorBody
  try {
    parsed = JSON.parse(body) as PromptErrorBody
  } catch {
    return `${VENDOR} HTTP ${status}: ${body.trim().slice(0, 400) || 'no details'}`
  }
  const err = parsed.error
  const head = typeof err === 'string' ? err : (err?.message ?? `HTTP ${status}`)
  const nodes = Object.entries(parsed.node_errors ?? {}).map(([id, n]) => {
    const msgs = (n.errors ?? []).map((e) => [e.message, e.details].filter(Boolean).join(': '))
    return `node ${id} (${n.class_type ?? '?'}): ${msgs.join('; ')}`
  })
  const details = typeof err === 'object' && err?.details ? ` ${err.details}` : ''
  return `${VENDOR} rejected the workflow: ${head}${details}${nodes.length ? ` — ${nodes.join(' | ')}` : ''}`.slice(
    0,
    1200,
  )
}

/** Every output file in a history entry, in node order; previews ('temp') are skipped. */
export function outputFiles(entry: HistoryEntry): ComfyFile[] {
  const files: ComfyFile[] = []
  const nodeIds = Object.keys(entry.outputs).sort((a, b) => Number(a) - Number(b))
  for (const id of nodeIds) {
    for (const value of Object.values(entry.outputs[id] ?? {})) {
      if (!Array.isArray(value)) continue
      for (const f of value) if (isComfyFile(f) && f.type === 'output') files.push(f)
    }
  }
  return files
}

function isComfyFile(v: unknown): v is ComfyFile {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as ComfyFile).filename === 'string' &&
    typeof (v as ComfyFile).type === 'string'
  )
}

export class ComfyClient {
  constructor(
    readonly baseUrl: string,
    private readonly timeoutMs = 30_000,
  ) {}

  url(path: string): string {
    return joinUrl(this.baseUrl, path)
  }

  wsUrl(clientId: string): string {
    const u = new URL(this.url('/ws'))
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.searchParams.set('clientId', clientId)
    return u.toString()
  }

  systemStats(signal?: AbortSignal): Promise<Record<string, unknown>> {
    return requestJson(this.url('/system_stats'), {
      signal,
      timeoutMs: 5_000,
      retries: 0,
      vendor: VENDOR,
    })
  }

  /** Class names of every node the server can run (core + installed custom nodes). */
  async nodeClasses(signal?: AbortSignal): Promise<string[]> {
    const info = await requestJson<Record<string, unknown>>(this.url('/object_info'), {
      signal,
      timeoutMs: 60_000,
      retries: 1,
      vendor: VENDOR,
    })
    return Object.keys(info)
  }

  /** GET /object_info/<class>: the node's input specs, or undefined when it is not installed. */
  async nodeInfo(classType: string, signal?: AbortSignal): Promise<NodeInfo | undefined> {
    const info = await requestJson<Record<string, NodeInfo>>(
      this.url(`/object_info/${encodeURIComponent(classType)}`),
      { signal, timeoutMs: this.timeoutMs, retries: 1, vendor: VENDOR },
    )
    return info[classType]
  }

  /** POST /prompt; resolves the prompt id. Validation failures name the offending nodes. */
  async queuePrompt(
    workflow: ApiWorkflow,
    clientId: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const timer = AbortSignal.timeout(this.timeoutMs)
    let res: Response
    try {
      res = await fetch(this.url('/prompt'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        signal: signal ? AbortSignal.any([signal, timer]) : timer,
      })
    } catch (err) {
      if (signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
      throw new AppError(
        'PROVIDER',
        `${VENDOR} unreachable at ${new URL(this.baseUrl).origin}: ${(err as Error).message}`,
      )
    }
    const text = await res.text()
    if (!res.ok) throw new AppError('PROVIDER', describePromptError(res.status, text))
    const body = JSON.parse(text) as { prompt_id?: string }
    if (!body.prompt_id) throw new AppError('PROVIDER', `${VENDOR} did not return a prompt id`)
    return body.prompt_id
  }

  /** The finished history entry, or undefined while the prompt is queued / running. */
  async history(promptId: string, signal?: AbortSignal): Promise<HistoryEntry | undefined> {
    const all = await requestJson<Record<string, HistoryEntry>>(
      this.url(`/history/${encodeURIComponent(promptId)}`),
      { signal, timeoutMs: this.timeoutMs, retries: 2, vendor: VENDOR },
    )
    return all[promptId]
  }

  async download(file: ComfyFile, signal?: AbortSignal): Promise<Uint8Array> {
    const q = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder ?? '',
      type: file.type,
    })
    const res = await request(this.url(`/view?${q}`), {
      signal,
      timeoutMs: 120_000,
      vendor: VENDOR,
    })
    return new Uint8Array(await res.arrayBuffer())
  }

  /** Upload a local image into ComfyUI's input folder; returns the LoadImage value. */
  async uploadImage(path: string, signal?: AbortSignal): Promise<string> {
    const bytes = await fs.readFile(path)
    const form = new FormData()
    form.append('image', new Blob([bytes]), `ttx-${Date.now()}-${basename(path)}`)
    form.append('type', 'input')
    form.append('overwrite', 'true')
    const timer = AbortSignal.timeout(this.timeoutMs)
    const res = await fetch(this.url('/upload/image'), {
      method: 'POST',
      body: form,
      signal: signal ? AbortSignal.any([signal, timer]) : timer,
    }).catch((err: Error) => {
      if (signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
      throw new AppError('PROVIDER', `${VENDOR} upload failed: ${err.message}`)
    })
    if (!res.ok)
      throw new AppError(
        'PROVIDER',
        `${VENDOR} upload failed: HTTP ${res.status} ${await res.text()}`,
      )
    const body = (await res.json()) as { name: string; subfolder?: string }
    return body.subfolder ? `${body.subfolder}/${body.name}` : body.name
  }

  /** Stop the prompt if it is running and drop it from the queue if it is still waiting. */
  async cancel(promptId: string): Promise<void> {
    const opts = { method: 'POST' as const, timeoutMs: 5_000, retries: 0, vendor: VENDOR }
    await Promise.allSettled([
      request(this.url('/interrupt'), { ...opts, body: { prompt_id: promptId } }),
      request(this.url('/queue'), { ...opts, body: { delete: [promptId] } }),
    ])
  }
}
