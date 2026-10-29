/**
 * Two JSON-lines logs (spec 0409 FR-8): `connections.log` (one line per connection event) and
 * `server.log` (startup, settings, errors), rotated at 10 MB × 5. A redaction guard refuses any
 * record that carries a field that could hold content or a credential, so a future bug cannot
 * log a frame or a token by accident. There is no debug level, so nothing can print a frame.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

export const FORBIDDEN_FIELDS: ReadonlySet<string> = new Set([
  'payload',
  'frame',
  'frames',
  'entries',
  'token',
  'joinToken',
  'controllerToken',
  'resumeToken',
  'serverKey',
  'key',
  'authorization',
  'cookie',
  'bytes',
])

export class RedactionError extends Error {}

/** Throws when any key, at any depth, is one a log must never contain. */
export function assertLoggable(record: unknown, path = ''): void {
  if (Array.isArray(record)) {
    record.forEach((v, i) => assertLoggable(v, `${path}[${i}]`))
    return
  }
  if (record && typeof record === 'object') {
    for (const [key, value] of Object.entries(record)) {
      if (FORBIDDEN_FIELDS.has(key))
        throw new RedactionError(`refusing to log field "${path}${key}"`)
      assertLoggable(value, `${path}${key}.`)
    }
  }
}

export interface RotatingOptions {
  maxBytes?: number
  keep?: number
}

export class RotatingJsonl {
  private readonly maxBytes: number
  private readonly keep: number
  private fd: number | undefined
  private size = 0

  constructor(
    readonly path: string,
    options: RotatingOptions = {},
  ) {
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024
    this.keep = options.keep ?? 5
  }

  write(record: Record<string, unknown>): void {
    assertLoggable(record)
    const line = JSON.stringify(record) + '\n'
    if (this.fd === undefined) this.open()
    if (this.size + line.length > this.maxBytes && this.size > 0) this.rotate()
    writeSync(this.fd!, line)
    this.size += line.length
  }

  private open(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    this.fd = openSync(this.path, 'a')
    this.size = existsSync(this.path) ? statSync(this.path).size : 0
  }

  /** `x.log` → `x.log.1` → … → `x.log.<keep>`; the oldest falls off. */
  private rotate(): void {
    this.close()
    for (let i = this.keep - 1; i >= 1; i--) {
      const from = `${this.path}.${i}`
      if (existsSync(from)) renameSync(from, `${this.path}.${i + 1}`)
    }
    if (existsSync(this.path)) renameSync(this.path, `${this.path}.1`)
    this.open()
  }

  close(): void {
    if (this.fd !== undefined) closeSync(this.fd)
    this.fd = undefined
    this.size = 0
  }
}

/** One connection event: fixed fields only, never a frame, token or key. */
export interface ConnectionRecord {
  event: string
  session?: string
  remote?: string
  clientId?: string
  code?: number
  reason?: string
  transport?: string
  path?: string
  status?: number
}

export type LogLevel = 'info' | 'warn'

export interface ServerLogs {
  connection(event: ConnectionRecord): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  close(): void
}

export function openLogs(
  logDir: string,
  level: LogLevel,
  now: () => number = () => Date.now(),
  echo: ((line: string) => void) | undefined = undefined,
): ServerLogs {
  const connections = new RotatingJsonl(join(logDir, 'connections.log'))
  const server = new RotatingJsonl(join(logDir, 'server.log'))
  const stamp = () => new Date(now()).toISOString()
  const emit = (lvl: LogLevel, message: string, fields: Record<string, unknown>) => {
    if (level === 'warn' && lvl === 'info') return
    const record = { time: stamp(), level: lvl, message, ...fields }
    server.write(record)
    echo?.(`${record.time} ${lvl.padEnd(4)} ${message}`)
  }
  return {
    connection(event) {
      connections.write({ time: stamp(), ...event })
    },
    info: (message, fields = {}) => emit('info', message, fields),
    warn: (message, fields = {}) => emit('warn', message, fields),
    close() {
      connections.close()
      server.close()
    },
  }
}
