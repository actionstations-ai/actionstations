// Work that follows a recorded decision in a running session (#1130: the clinical downtime model
// answers restore and reconciliation decisions). A field registers a hook at startup; each hook
// sees the decision, every decision of the session so far, the log, and a way to message the
// players as an outside party. A failing hook is logged and never stops the decision, the other
// hooks or the session.
import type { DecisionRecord } from '@shared/schemas/decisions'
import type { SessionLogEntry } from '@shared/schemas/live'

export interface DecisionHookContext {
  root: string
  scenarioId: string
  record: DecisionRecord
  /** Every decision of the session, oldest first, the new one included. */
  records: readonly DecisionRecord[]
  /** The session log so far. */
  readLog: () => Promise<SessionLogEntry[]>
  /** Send a message from an outside party (a persona) to every team, or every role without one. */
  messagePlayers: (persona: string, text: string) => Promise<void>
}

type DecisionHook = (ctx: DecisionHookContext) => Promise<void> | void

const hooks = new Set<DecisionHook>()

/** Register a hook; returns the function that removes it. The same hook twice is one hook. */
export function onDecisionRecorded(hook: DecisionHook): () => void {
  hooks.add(hook)
  return () => void hooks.delete(hook)
}

export async function runDecisionHooks(ctx: DecisionHookContext): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook(ctx)
    } catch (err) {
      console.error('[live] decision hook:', err)
    }
  }
}
