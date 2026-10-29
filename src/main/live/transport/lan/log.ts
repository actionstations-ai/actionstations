/**
 * The LAN server's connection log, `userData/live/lan.log` (spec 0407 NFR-2): one line per
 * event with fixed fields (time, event, remote address, client id, close code, reason), rotated
 * at 5 MB × 3. It takes no free text from the network and never a frame, so it cannot leak
 * exercise content. URLs are reduced to their path (a fragment never reaches a server anyway).
 */
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

export const LAN_LOG_MAX_BYTES = 5 * 1024 * 1024
export const LAN_LOG_KEEP = 3

export type LanLogEvent =
  'listen' | 'stop' | 'connect' | 'refused' | 'close' | 'upgrade-rejected' | 'flood' | 'http'

export interface LanLogRecord {
  event: LanLogEvent
  remote?: string
  clientId?: string
  code?: number
  reason?: string
  /** Request path only; the query string (join token) and fragment are never recorded. */
  path?: string
  status?: number
  transport?: 'ws' | 'sse' | 'post' | 'local'
}

const SAFE_REASON = /[^\x20-\x7e]/g

/** Strip a URL to its path: no query (`?j=<joinToken>`), no fragment (the key). */
export function redactPath(url: string | undefined): string | undefined {
  if (!url) return undefined
  const cut = url.search(/[?#]/)
  return (cut === -1 ? url : url.slice(0, cut)).slice(0, 200)
}

export function formatRecord(at: Date, r: LanLogRecord): string {
  const fields: string[] = [at.toISOString(), r.event]
  if (r.transport) fields.push(`via=${r.transport}`)
  if (r.remote) fields.push(`remote=${r.remote}`)
  if (r.clientId) fields.push(`client=${r.clientId}`)
  if (r.path) fields.push(`path=${redactPath(r.path)}`)
  if (r.status !== undefined) fields.push(`status=${r.status}`)
  if (r.code !== undefined) fields.push(`code=${r.code}`)
  if (r.reason) fields.push(`reason="${r.reason.replace(SAFE_REASON, '?').slice(0, 120)}"`)
  return fields.join(' ') + '\n'
}

export class LanLog {
  private chain: Promise<unknown> = Promise.resolve()
  private size: number | undefined

  constructor(
    private readonly path: string,
    private readonly opts: { maxBytes?: number; keep?: number; now?: () => Date } = {},
  ) {}

  /** Append one record; writes are serialized and never throw into the server. */
  write(record: LanLogRecord): Promise<void> {
    const line = formatRecord(this.opts.now?.() ?? new Date(), record)
    const run = this.chain.catch(() => undefined).then(() => this.append(line))
    this.chain = run.catch(() => undefined)
    return this.chain as Promise<void>
  }

  /** Resolves when every queued line is on disk. */
  flush(): Promise<void> {
    return this.chain.then(() => undefined)
  }

  private async append(line: string): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true })
    if (this.size === undefined)
      this.size = await fs.stat(this.path).then(
        (s) => s.size,
        () => 0,
      )
    const bytes = Buffer.byteLength(line)
    if (this.size + bytes > (this.opts.maxBytes ?? LAN_LOG_MAX_BYTES)) {
      await this.rotate()
      this.size = 0
    }
    await fs.appendFile(this.path, line)
    this.size += bytes
  }

  /** lan.log → lan.log.1 → lan.log.2 …; the oldest beyond `keep` is dropped. */
  private async rotate(): Promise<void> {
    const keep = this.opts.keep ?? LAN_LOG_KEEP
    await fs.rm(`${this.path}.${keep}`, { force: true })
    for (let i = keep - 1; i >= 1; i--) {
      await fs.rename(`${this.path}.${i}`, `${this.path}.${i + 1}`).catch(() => undefined)
    }
    await fs.rename(this.path, `${this.path}.1`).catch(() => undefined)
  }
}
