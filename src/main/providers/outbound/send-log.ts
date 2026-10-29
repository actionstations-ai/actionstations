// The send log (FR-16): one JSON line per cloud request in <project>/cloud-sends.jsonl, or in
// <userData>/cloud-sends.jsonl for a request outside a project. Sizes, document ids and section
// headings only: no prompt text, no redacted values, no mapping.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { CloudSendEntry } from '@shared/schemas'
import { userDataPath } from '../../lib/paths'

export const SEND_LOG_FILE = 'cloud-sends.jsonl'
/** Reading stops here; the log is a record, not a database. */
const MAX_READ_BYTES = 20 * 1024 * 1024
const DEFAULT_LIMIT = 200

export const sendLogPath = (projectPath?: string): string =>
  projectPath ? join(projectPath, SEND_LOG_FILE) : userDataPath(SEND_LOG_FILE)

const queues = new Map<string, Promise<unknown>>()

/** Append one entry; writes to one file never interleave. */
export function appendSend(entry: CloudSendEntry, projectPath?: string): Promise<void> {
  const file = sendLogPath(projectPath)
  const line = JSON.stringify(CloudSendEntry.parse(entry)) + '\n'
  const run = (queues.get(file) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => fs.appendFile(file, line, { encoding: 'utf8', mode: 0o600 }))
  queues.set(file, run)
  return run
}

async function readTail(file: string): Promise<string> {
  let handle: fs.FileHandle
  try {
    handle = await fs.open(file, 'r')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw e
  }
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, MAX_READ_BYTES)
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, size - length)
    const text = buf.toString('utf8')
    return size > length ? text.slice(text.indexOf('\n') + 1) : text
  } finally {
    await handle.close()
  }
}

/** Entries newest first; lines that do not parse are skipped. */
export async function readSends(
  projectPath: string,
  opts: { limit?: number; before?: string } = {},
): Promise<CloudSendEntry[]> {
  const out: CloudSendEntry[] = []
  for (const line of (await readTail(sendLogPath(projectPath))).split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = CloudSendEntry.safeParse(JSON.parse(line))
      if (parsed.success) out.push(parsed.data)
    } catch {
      // A torn or edited line: skip it.
    }
  }
  const before = opts.before
  return out
    .filter((e) => !before || e.at < before)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, opts.limit ?? DEFAULT_LIMIT)
}
