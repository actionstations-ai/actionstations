/**
 * The session log, `scenarios/<id>/live/<sessionId>/log.jsonl` (spec 0417 FR-2, FR-3, FR-4):
 * one JSON object per line, append-only through one serialized writer per session, `i` and `at`
 * assigned here. The writer enforces what may never be in the file: raw client ids, join
 * tokens, keys and addresses, and display names in a `role` session. A torn last line (crash
 * mid-write) is dropped on read.
 */
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import {
  LOG_LINE_MAX_BYTES,
  SessionLogEntry,
  type Attribution,
  type SessionLogInput,
} from '@shared/schemas/live'
import { AppError } from '../lib/errors'

/** Field names that must never appear anywhere in an entry (FR-4, Security). */
export const LOG_DENY_LIST = new Set([
  'clientId',
  'joinToken',
  'resumeToken',
  'key',
  'root',
  'staffRoot',
  'playersRoot',
  'privateKey',
  'inviteUrl',
  'remoteAddress',
  'ip',
])

/** The first denied field name found anywhere in `value`, or undefined. */
export function findDeniedField(value: unknown, depth = 0): string | undefined {
  if (depth > 12 || value === null || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findDeniedField(item, depth + 1)
      if (hit) return hit
    }
    return undefined
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (LOG_DENY_LIST.has(k)) return k
    const hit = findDeniedField(v, depth + 1)
    if (hit) return hit
  }
  return undefined
}

export class LogWriter {
  private chain: Promise<unknown> = Promise.resolve()
  private next: number

  private constructor(
    readonly path: string,
    private readonly attribution: Attribution,
    lastIndex: number,
    private readonly now: () => Date,
  ) {
    this.next = lastIndex + 1
  }

  /** Open (or continue) a session's log; `i` continues after the last complete line. */
  static async open(
    path: string,
    attribution: Attribution,
    now: () => Date = () => new Date(),
  ): Promise<LogWriter> {
    await fs.mkdir(dirname(path), { recursive: true })
    let last = 0
    for await (const entry of readEntries(path)) last = entry.i
    return new LogWriter(path, attribution, last, now)
  }

  get lastIndex(): number {
    return this.next - 1
  }

  /** Append one entry; appends run in call order. Resolves with the written entry. */
  append(input: SessionLogInput): Promise<SessionLogEntry> {
    const run = this.chain.catch(() => undefined).then(() => this.write(input))
    this.chain = run
    return run
  }

  private async write(input: SessionLogInput): Promise<SessionLogEntry> {
    const denied = findDeniedField(input)
    if (denied) throw new AppError('VALIDATION', `Log entry carries a forbidden field: ${denied}`)
    const actor = { ...input.actor }
    if (this.attribution === 'role') delete actor.displayName
    const entry = SessionLogEntry.parse({
      ...input,
      actor,
      i: this.next,
      at: this.now().toISOString(),
    })
    const line = JSON.stringify(entry) + '\n'
    if (Buffer.byteLength(line) > LOG_LINE_MAX_BYTES) {
      throw new AppError('VALIDATION', 'Log entry over 64 KiB; media and attachments go by id')
    }
    await fs.appendFile(this.path, line)
    this.next += 1
    return entry
  }

  /** Resolves when every queued append is on disk. */
  async flush(): Promise<void> {
    await this.chain.catch(() => undefined)
  }
}

/** Every complete, valid entry in order. A torn or invalid line is skipped. */
export async function* readEntries(path: string): AsyncGenerator<SessionLogEntry> {
  let text: string
  try {
    text = await fs.readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
    throw e
  }
  const lines = text.split('\n')
  // Without a trailing newline the last line may be torn: drop it.
  if (lines.at(-1) !== '') lines.pop()
  for (const line of lines) {
    if (!line) continue
    try {
      const parsed = SessionLogEntry.safeParse(JSON.parse(line))
      if (parsed.success) yield parsed.data
    } catch {
      // not JSON: skip
    }
  }
}
