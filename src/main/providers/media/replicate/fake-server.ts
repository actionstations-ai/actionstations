// Test helper: an in-process stand-in for Replicate's predictions API (create with Prefer: wait,
// get, cancel, account and a file host). Not imported by app code.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type FakeReplicateMode =
  | 'sync'
  | 'async'
  | 'failed'
  | 'nsfw'
  | 'canceled'
  | 'hang'
  | 'unauthorized'
  | 'billing'
  | 'rate-limited'
  | 'not-found'
  | 'oversized'
  | 'wrong-type'

export interface FakeReplicateOptions {
  mode?: FakeReplicateMode
  file?: { contentType: string; bytes: Buffer }
  /** Output shape: a single link (most models) or a list (FLUX schnell). */
  output?: 'string' | 'array'
  /** Polls that answer "processing" before the prediction succeeds (async mode). */
  processingPolls?: number
}

export interface FakeReplicate {
  url: string
  creates: { path: string; headers: IncomingMessage['headers']; body: Record<string, unknown> }[]
  polls: number
  cancels: string[]
  accountCalls: number
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

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function startFakeReplicate(
  options: FakeReplicateOptions = {},
): Promise<FakeReplicate> {
  const mode = options.mode ?? 'sync'
  const file = options.file ?? { contentType: 'video/mp4', bytes: Buffer.from('fake-mp4-bytes') }
  const processing = options.processingPolls ?? 1
  const fake: FakeReplicate = {
    url: '',
    creates: [],
    polls: 0,
    cancels: [],
    accountCalls: 0,
    fileFetches: [],
    close: async () => undefined,
  }

  const outputLink = (): string | string[] => {
    const name = mode === 'oversized' ? 'big' : mode === 'wrong-type' ? 'page' : 'out'
    const link = `${fake.url}/files/${name}`
    return options.output === 'array' ? [link] : link
  }
  const prediction = (status: string, extra: Record<string, unknown> = {}) => ({
    id: 'pred1234',
    status,
    ...extra,
  })

  const server = createServer(async (req, res) => {
    const path = (req.url ?? '').split('?')[0]!
    if (path.startsWith('/files/')) return serveFile(req, res)
    if (mode === 'unauthorized' || !/^Bearer \S+$/.test(req.headers.authorization ?? ''))
      return send(res, 401, { title: 'Unauthenticated', detail: 'Invalid token' })
    if (path === '/v1/account') {
      fake.accountCalls++
      return send(res, 200, { type: 'user', username: 'exercise-lead' })
    }
    const create = /^\/v1\/models\/([^/]+\/[^/]+)\/predictions$/.exec(path)
    if (req.method === 'POST' && create) return createPrediction(req, res, create[1]!)
    const cancel = /^\/v1\/predictions\/([^/]+)\/cancel$/.exec(path)
    if (req.method === 'POST' && cancel) {
      fake.cancels.push(cancel[1]!)
      return send(res, 200, prediction('canceled'))
    }
    if (req.method === 'GET' && /^\/v1\/predictions\/[^/]+$/.test(path)) return poll(res)
    send(res, 404, { detail: 'Not found' })
  })

  async function createPrediction(
    req: IncomingMessage,
    res: ServerResponse,
    model: string,
  ): Promise<void> {
    const body = JSON.parse(await readBody(req)) as { input: Record<string, unknown> }
    fake.creates.push({ path: model, headers: req.headers, body: body.input })
    if (mode === 'billing')
      return send(res, 402, { detail: 'You have insufficient credit to run this model.' })
    if (mode === 'rate-limited')
      return send(res, 429, { detail: 'Request was throttled. Your rate limit resets in ~30s.' })
    if (mode === 'not-found')
      return send(res, 404, { detail: 'The requested resource could not be found.' })
    if (mode === 'sync') return send(res, 201, prediction('succeeded', { output: outputLink() }))
    if (mode === 'failed') return send(res, 201, prediction('failed', { error: 'Model crashed' }))
    if (mode === 'nsfw')
      return send(res, 201, prediction('failed', { error: 'NSFW content detected (E005)' }))
    send(res, 201, prediction('starting'))
  }

  function poll(res: ServerResponse): void {
    fake.polls++
    if (mode === 'hang') return send(res, 200, prediction('processing'))
    if (mode === 'canceled') return send(res, 200, prediction('canceled'))
    if (fake.polls <= processing) return send(res, 200, prediction('processing'))
    send(res, 200, prediction('succeeded', { output: outputLink() }))
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
