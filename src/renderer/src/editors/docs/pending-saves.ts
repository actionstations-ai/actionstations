// Edits whose save was refused (CONFLICT: a generation job owns the scenario) after their
// editor was closed — the user switched tab or document before the save went through (#115).
// They are kept here, in memory per scenario + document, and saved again when a job finishes;
// an editor that opens the same document again takes its edit back (and saves it itself).
import { create } from 'zustand'
import { toast } from '../../components/toast-store'
import { subscribe } from '../../lib/api'
import { queryClient } from '../../lib/query'
import { isConflict } from './conflict'

export interface PendingSave {
  /** pendingKey(projectPath, scenarioId, doc) */
  key: string
  scenarioId: string
  /** What the edit is to, for the indicator ("Rubric", "Controller handbook"). */
  label: string
  value: unknown
  write: (value: unknown) => Promise<void>
}

interface PendingStore {
  entries: Record<string, PendingSave>
  park: (entry: PendingSave) => void
  drop: (key: string) => void
}

export const usePendingSaves = create<PendingStore>((set) => ({
  entries: {},
  park: (entry) => set((s) => ({ entries: { ...s.entries, [entry.key]: entry } })),
  drop: (key) =>
    set((s) => {
      const { [key]: _gone, ...rest } = s.entries
      return { entries: rest }
    }),
}))

export const pendingKey = (projectPath: string, scenarioId: string, doc: string): string =>
  `${projectPath}\u0000${scenarioId}\u0000${doc}`

/** The parked edit for a document, if any (does not remove it). */
export const peekPending = (key: string): PendingSave | undefined =>
  usePendingSaves.getState().entries[key]

let unsubscribe: (() => void) | undefined

/** Keep an edit whose editor is gone; it is saved on the next job:done. */
export function parkPendingSave(entry: PendingSave): void {
  usePendingSaves.getState().park(entry)
  unsubscribe ??= subscribe('job:done', () => void flushPendingSaves())
}

function refreshScenarioQueries(): void {
  for (const key of ['scenarios:get', 'scenarios:doc-get', 'scenarios:history'])
    void queryClient.invalidateQueries({ queryKey: [key] })
}

async function flushOne(entry: PendingSave): Promise<void> {
  try {
    await entry.write(entry.value)
    // Only drop what was written: an editor may have taken the edit back meanwhile.
    if (peekPending(entry.key) === entry) usePendingSaves.getState().drop(entry.key)
    refreshScenarioQueries()
    toast.success(`Saved your pending edit to ${entry.label}`)
  } catch (e) {
    if (!isConflict(e)) toast.error(`Could not save your pending edit to ${entry.label}`, e)
  }
}

/** Try every parked edit once (another job may still hold its scenario: it stays parked). */
export async function flushPendingSaves(): Promise<void> {
  const entries = Object.values(usePendingSaves.getState().entries)
  await Promise.all(entries.map(flushOne))
  if (!Object.keys(usePendingSaves.getState().entries).length) {
    unsubscribe?.()
    unsubscribe = undefined
  }
}
