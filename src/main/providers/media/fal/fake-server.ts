// Test helper: an in-process stand-in for fal's queue API (submit, status, result, cancel and a
// file host). Not imported by app code.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type FakeFalMode =
  | 'ok'
  | 'failed'
  | 'hang'
  | 'unauthorized'
  | 'rate-limited'
  | 'oversized'
  | 'wrong-type'
  | 'foreign-link'
  | 'private-file'

export interface FakeFalOptions {
  mode?: FakeFalMode
  /** Result file served by the file host. */
  file?: { contentType: string; bytes: Buffer }
  /** Result shape: image models answer with images[], video models with video. */
  result?: 'video' | 'image'
  /** Status answers before COMPLETED, after the first IN_QUEUE. */
  inProgressPolls?: number
}

export interface FakeFal {
  url: string
  submits: { path: string; headers: IncomingMessage['headers']; body: Record<string, unknown> }[]
  statusPolls: number
  cancels: string[]
  fileFetches: { authorization?: string }[]
  close(): Promise<void>
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

export async function startFakeFal(options: FakeFalOptions = {}): Promise<FakeFal> {
  const mode = options.mode ?? 'ok'
  const resultKind = options.result ?? 'video'
  const file = options.file ?? { contentType: 'video/mp4', bytes: Buffer.from('fake-mp4-bytes') }
  const polls = options.inProgressPolls ?? 1
  const fake: FakeFal = {
    url: '',
    submits: [],
    statusPolls: 0,
    cancels: [],
    fileFetches: [],
    close: async () => undefined,
  }

  const server = createServer(async (req, res) => {
    const path = (req.url ?? '').split('?')[0]!
    if (path.startsWith('/files/')) return serveFile(req, res)
    if (mode === 'unauthorized' || !/^Key \S+$/.test(req.headers.authorization ?? ''))
      return send(res, 401, { detail: 'Invalid key' })
    const m = /^\/(.+)\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(path)
    if (req.method === 'POST' && !m) return submit(req, res, path.slice(1))
    if (!m) return send(res, 404, { detail: 'Not found' })
    const id = m[2]!
    if (req.method === 'PUT' && m[3] === '/cancel') {
      fake.cancels.push(id)
      return send(res, 202, { status: 'CANCELLATION_REQUESTED' })
    }
    if (m[3] === '/status') return status(res)
    return result(res)
  })

  async function submit(req: IncomingMessage, res: ServerResponse, model: string): Promise<void> {
    const body = JSON.parse(await readBody(req)) as Record<string, unknown>
    fake.submits.push({ path: model, headers: req.headers, body })
    if (mode === 'rate-limited')
      return send(res, 429, { request_id: null, error: 'queue is full' }, { 'retry-after': '0' })
    const link = (suffix: string): string => `${fake.url}/${model}/requests/req-1${suffix}`
    const foreign = mode === 'foreign-link' ? 'http://example.invalid' : fake.url
    send(res, 200, {
      request_id: 'req-1',
      status_url: mode === 'foreign-link' ? `${foreign}/s` : link('/status'),
      response_url: link(''),
      cancel_url: link('/cancel'),
      queue_position: 3,
    })
  }

  function status(res: ServerResponse): void {
    fake.statusPolls++
    if (mode === 'hang') return send(res, 200, { status: 'IN_PROGRESS' })
    if (fake.statusPolls === 1) return send(res, 200, { status: 'IN_QUEUE', queue_position: 1 })
    if (fake.statusPolls <= 1 + polls) return send(res, 200, { status: 'IN_PROGRESS' })
    if (mode === 'failed')
      return send(res, 200, {
        status: 'COMPLETED',
        error: 'content policy violation',
        error_type: 'content_policy',
      })
    send(res, 200, { status: 'COMPLETED' })
  }

  function result(res: ServerResponse): void {
    const host = mode === 'private-file' ? 'http://192.168.1.9' : fake.url
    const fileUrl = `${host}/files/${mode === 'oversized' ? 'big' : mode === 'wrong-type' ? 'page' : 'out'}`
    if (resultKind === 'image')
      return send(res, 200, {
        images: [{ url: fileUrl, width: 1024, height: 768, content_type: file.contentType }],
        seed: 1,
      })
    send(res, 200, { video: { url: fileUrl, content_type: file.contentType } })
  }

  function serveFile(req: IncomingMessage, res: ServerResponse): void {
    fake.fileFetches.push(
      req.headers.authorization ? { authorization: req.headers.authorization } : {},
    )
    if (mode === 'wrong-type') {
      res.writeHead(200, { 'content-type': 'text/html' })
      return void res.end('<html></html>')
    }
    if (mode === 'oversized') {
      res.writeHead(200, {
        'content-type': file.contentType,
        'content-length': String(500 * 1024 * 1024),
      })
      return void res.end('x')
    }
    res.writeHead(200, { 'content-type': file.contentType })
    res.end(file.bytes)
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  fake.close = () => new Promise((resolve) => server.close(() => resolve()))
  return fake
}
