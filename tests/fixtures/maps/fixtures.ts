// Small map files and a local tile server for tests (#436). Nothing here reaches the internet.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import Database from 'better-sqlite3'
import { FIXTURE_BOUNDS as BOUNDS } from './files'

export { makePmtiles, solidPng } from './files'

/** An MBTiles file of raster tiles; `tiles` are given in XYZ and stored in TMS rows. */
export function makeMbtiles(
  path: string,
  tiles: { z: number; x: number; y: number; data: Buffer }[],
  opts: { bounds?: string | null; attribution?: string } = {},
): void {
  const db = new Database(path)
  db.exec(`CREATE TABLE metadata (name TEXT, value TEXT);
    CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);`)
  const meta = db.prepare('INSERT INTO metadata VALUES (?, ?)')
  meta.run('name', 'Fixture')
  meta.run('format', 'png')
  meta.run('minzoom', '0')
  meta.run('maxzoom', '4')
  if (opts.bounds !== null)
    meta.run('bounds', opts.bounds ?? `${BOUNDS.w},${BOUNDS.s},${BOUNDS.e},${BOUNDS.n}`)
  if (opts.attribution) meta.run('attribution', opts.attribution)
  const put = db.prepare('INSERT INTO tiles VALUES (?, ?, ?, ?)')
  for (const t of tiles) put.run(t.z, t.x, 2 ** t.z - 1 - t.y, t.data)
  db.close()
}

export interface Seen {
  url: string
  headers: IncomingMessage['headers']
}

export interface FixtureServer {
  origin: string
  seen: Seen[]
  close(): Promise<void>
}

export type Route = (req: IncomingMessage, res: ServerResponse) => unknown

/** A loopback HTTP server that records every request it gets. */
export async function startServer(route: Route): Promise<FixtureServer> {
  const seen: Seen[] = []
  const server: Server = createServer((req, res) => {
    seen.push({ url: req.url ?? '', headers: req.headers })
    void Promise.resolve(route(req, res)).catch(() => res.destroy())
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  return {
    origin: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      }),
  }
}
