// Per-artifact history: scenarios/<id>/history/<artifact>.jsonl, one JSON entry per line,
// newest last, trimmed to MAX_HISTORY. Callers hold the scenario lock.
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import type { HistoryEntry } from '@shared/ipc'
import { writeFileAtomic } from '../lib/fs'
import { newId, nowIso } from '../lib/ids'

export const MAX_HISTORY = 50

export const StoredHistoryEntry = z.object({
  id: z.string(),
  at: z.string(),
  by: z.enum(['user', 'ai']),
  note: z.string().optional(),
  snapshot: z.unknown(),
})
export type StoredHistoryEntry = z.infer<typeof StoredHistoryEntry>

/** Read every valid line; a corrupt line is skipped rather than failing the whole file. */
export async function readHistory(file: string): Promise<StoredHistoryEntry[]> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
  const entries: StoredHistoryEntry[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = StoredHistoryEntry.safeParse(JSON.parse(line))
      if (parsed.success) entries.push(parsed.data)
    } catch {
      // skip unparseable line
    }
  }
  return entries
}

export async function appendHistory(
  file: string,
  entry: { by: 'user' | 'ai'; note?: string | undefined; snapshot: unknown },
  max = MAX_HISTORY,
): Promise<StoredHistoryEntry> {
  const next: StoredHistoryEntry = {
    id: newId(),
    at: nowIso(),
    by: entry.by,
    ...(entry.note ? { note: entry.note } : {}),
    snapshot: entry.snapshot,
  }
  const kept = [...(await readHistory(file)), next].slice(-max)
  await writeFileAtomic(file, kept.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return next
}

/** Public view (no snapshot), newest first. */
export function toHistoryEntries(entries: StoredHistoryEntry[]): HistoryEntry[] {
  return entries
    .map(({ id, at, by, note }) => ({ id, at, by, ...(note ? { note } : {}) }))
    .reverse()
}
