// Test helper: an in-process fake ComfyUI (HTTP + WebSocket) that behaves like the real server
// for the endpoints the adapter uses. Not imported by app code.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { PNG } from 'pngjs'
import { WebSocketServer, type WebSocket } from 'ws'

export type FakeMode = 'ok' | 'error' | 'hang' | 'invalid'

export interface FakeComfyOptions {
  /** Refuse WebSocket upgrades so the adapter must poll /history. */
  ws?: boolean
  mode?: FakeMode
  nodeClasses?: string[]
  /** Output file the "workflow" writes (extension decides image/video). */
  outputName?: string
  stepDelayMs?: number
}

export interface FakeComfy {
  url: string
  prompts: {
    prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>
    client_id: string
  }[]
  uploads: string[]
  interrupts: unknown[]
  queueDeletes: unknown[]
  options: FakeComfyOptions
  close(): Promise<void>
}

export function tinyPng(width = 64, height = 48): Buffer {
  const png = new PNG({ width, height })
  png.data.fill(128)
  return PNG.sync.write(png)
}

const DEFAULT_NODES = [
  'CheckpointLoaderSimple',
  'EmptyLatentImage',
  'CLIPTextEncode',
  'KSampler',
  'VAEDecode',
  'SaveImage',
  'LoadImage',
]

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function startFakeComfy(options: FakeComfyOptions = {}): Promise<FakeComfy> {
  const state: FakeComfy = {
    url: '',
    prompts: [],
    uploads: [],
    interrupts: [],
    queueDeletes: [],
    options,
    close: async () => undefined,
  }
  const history = new Map<string, unknown>()
  const sockets = new Map<string, WebSocket>()
  let counter = 0

  const send = (clientId: string, type: string, data: Record<string, unknown>): void => {
    sockets.get(clientId)?.send(JSON.stringify({ type, data }))
  }

  const run = (promptId: string, clientId: string): void => {
    const mode = options.mode ?? 'ok'
    const delay = options.stepDelayMs ?? 10
    const file = {
      filename: options.outputName ?? 'ttx_00001_.png',
      subfolder: 'ttx',
      type: 'output',
    }
    const steps: (() => void)[] = [
      () => send(clientId, 'execution_start', { prompt_id: promptId }),
      () => send(clientId, 'executing', { node: '3', prompt_id: promptId }),
      () => send(clientId, 'progress', { value: 1, max: 2, node: '3', prompt_id: promptId }),
      () => send(clientId, 'progress', { value: 2, max: 2, node: '3', prompt_id: promptId }),
    ]
    if (mode === 'hang') steps.length = 2
    if (mode === 'error')
      steps.push(() => {
        const err = {
          prompt_id: promptId,
          node_id: '3',
          node_type: 'KSampler',
          exception_message: 'MPS out of memory',
        }
        history.set(promptId, {
          outputs: {},
          status: { status_str: 'error', completed: false, messages: [['execution_error', err]] },
        })
        send(clientId, 'execution_error', err)
      })
    if (mode === 'ok')
      steps.push(() => {
        history.set(promptId, {
          outputs: { '9': { images: [file, { ...file, filename: 'preview.png', type: 'temp' }] } },
          status: { status_str: 'success', completed: true, messages: [] },
        })
        send(clientId, 'executed', { node: '9', output: { images: [file] }, prompt_id: promptId })
        send(clientId, 'executing', { node: null, prompt_id: promptId })
      })
    steps.forEach((step, i) => setTimeout(step, delay * (i + 1)))
  }

  const routes = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://x')
    const body = req.method === 'POST' ? await readBody(req) : Buffer.alloc(0)
    if (url.pathname === '/system_stats')
      return json(res, 200, {
        system: { comfyui_version: '0.42.0' },
        devices: [{ name: 'mps', type: 'mps' }],
      })
    if (url.pathname === '/object_info')
      return json(
        res,
        200,
        Object.fromEntries((options.nodeClasses ?? DEFAULT_NODES).map((n) => [n, {}])),
      )
    if (url.pathname === '/prompt' && req.method === 'POST') {
      const parsed = JSON.parse(body.toString()) as FakeComfy['prompts'][number]
      state.prompts.push(parsed)
      if (options.mode === 'invalid')
        return json(res, 400, {
          error: {
            type: 'prompt_outputs_failed_validation',
            message: 'Prompt outputs failed validation',
            details: '',
          },
          node_errors: {
            '4': {
              class_type: 'CheckpointLoaderSimple',
              errors: [
                {
                  message: 'Value not in list',
                  details: "ckpt_name: 'missing.safetensors' not in []",
                },
              ],
            },
          },
        })
      const promptId = `p-${++counter}`
      run(promptId, parsed.client_id)
      return json(res, 200, { prompt_id: promptId, number: counter, node_errors: {} })
    }
    if (url.pathname.startsWith('/history/')) {
      const id = decodeURIComponent(url.pathname.slice('/history/'.length))
      return json(res, 200, history.has(id) ? { [id]: history.get(id) } : {})
    }
    if (url.pathname === '/view') {
      const name = url.searchParams.get('filename') ?? ''
      res.writeHead(200, { 'content-type': name.endsWith('.png') ? 'image/png' : 'video/mp4' })
      return void res.end(name.endsWith('.png') ? tinyPng() : Buffer.from('fake-mp4-bytes'))
    }
    if (url.pathname === '/upload/image' && req.method === 'POST') {
      const name = /filename="([^"]+)"/.exec(body.toString('latin1'))?.[1] ?? 'upload.png'
      state.uploads.push(name)
      return json(res, 200, { name, subfolder: '', type: 'input' })
    }
    if (url.pathname === '/interrupt') {
      state.interrupts.push(JSON.parse(body.toString() || '{}'))
      return json(res, 200, {})
    }
    if (url.pathname === '/queue') {
      state.queueDeletes.push(JSON.parse(body.toString() || '{}'))
      return json(res, 200, {})
    }
    json(res, 404, { error: 'not found' })
  }

  const server: Server = createServer((req, res) => void routes(req, res))
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    if (options.ws === false) return socket.destroy()
    const clientId = new URL(req.url ?? '/', 'http://x').searchParams.get('clientId') ?? ''
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.set(clientId, ws)
      ws.send(
        JSON.stringify({
          type: 'status',
          data: { status: { exec_info: { queue_remaining: 0 } }, sid: clientId },
        }),
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  state.close = async () => {
    for (const ws of sockets.values()) ws.terminate()
    wss.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  return state
}
