// Test-only: a local http server on 127.0.0.1 with per-path routes, for the catalog and
// download tests (#267). Imported only from *.test.ts files.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'

export type Route = (req: IncomingMessage, res: ServerResponse) => void

export interface TestServer {
  base: string
  url(path: string): string
  route(path: string, handler: Route): void
  /** Paths requested so far, in order. */
  hits: string[]
  close(): Promise<void>
}

export async function startServer(): Promise<TestServer> {
  const routes = new Map<string, Route>()
  const hits: string[] = []
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!
    hits.push(path)
    const handler = routes.get(path)
    if (!handler) {
      res.writeHead(404).end('not found')
      return
    }
    handler(req, res)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`
  return {
    base,
    url: (path) => `${base}${path}`,
    route: (path, handler) => void routes.set(path, handler),
    hits,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      }),
  }
}

export const json =
  (body: unknown, status = 200): Route =>
  (_req, res) => {
    const text = JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(text),
    })
    res.end(text)
  }

export const bytes =
  (data: Buffer, withLength = true): Route =>
  (_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      ...(withLength ? { 'content-length': data.length } : {}),
    })
    res.end(data)
  }

export const redirect =
  (location: string, status = 302): Route =>
  (_req, res) => {
    res.writeHead(status, { location }).end()
  }

/** Sends the headers and one chunk, then nothing until the client gives up. */
export const stall =
  (first?: Buffer): Route =>
  (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    if (first) res.write(first)
  }

/** Never answers at all. */
export const hang: Route = () => undefined

export const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

export function catalogEntry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'org.example.rail',
    name: 'Freight Rail',
    version: '1.0.0',
    summary: 'Freight rail domain',
    author: { name: 'Example Author' },
    license: 'CC-BY-4.0',
    kinds: ['domains'],
    minAppVersion: '0.3.0',
    size: 1024,
    sha256: 'a'.repeat(64),
    url: 'https://packs.example.org/org.example.rail-1.0.0.aspack',
    updated: '2026-10-23T00:00:00Z',
    ...over,
  }
}

export function catalogBody(packs: unknown[], over: Record<string, unknown> = {}) {
  return {
    catalogVersion: 1,
    name: 'Test Catalog',
    updated: '2026-10-23T00:00:00Z',
    packs,
    ...over,
  }
}
