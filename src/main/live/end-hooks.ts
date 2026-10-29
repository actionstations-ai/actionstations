// Work that follows a live session that ended normally (#431: a regression drill records its
// run). Hooks run after the session file and log are final; a failing hook is logged and never
// stops the others or the end of the session.
type EndHook = (root: string, scenarioId: string, sessionId: string) => Promise<void> | void

const hooks = new Set<EndHook>()

/** Register a hook; returns the function that removes it. */
export function onSessionEnd(hook: EndHook): () => void {
  hooks.add(hook)
  return () => void hooks.delete(hook)
}

export async function runSessionEndHooks(
  root: string,
  scenarioId: string,
  sessionId: string,
): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook(root, scenarioId, sessionId)
    } catch (err) {
      console.error('[live] session-end hook:', err)
    }
  }
}
