// Work that must reach the disk before the app exits (#433: the encrypted store of redacted
// values). The quit guard runs every registered flush, bounded by a short timeout, after the
// unsaved-work check and before quitting. No Electron imports: modules anywhere can register.

/** How long quitting waits for pending writes; a stuck disk never blocks quitting for longer. */
export const QUIT_FLUSH_TIMEOUT_MS = 2000

const flushes = new Set<() => Promise<void>>()

/** Register a flush; returns a function that removes it. */
export function registerQuitFlush(flush: () => Promise<void>): () => void {
  flushes.add(flush)
  return () => flushes.delete(flush)
}

/** Run every flush; resolves when all finished or the timeout passed. Never rejects. */
export async function runQuitFlushes(timeoutMs = QUIT_FLUSH_TIMEOUT_MS): Promise<void> {
  if (!flushes.size) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const all = Promise.all(
    [...flushes].map((f) =>
      f().catch((e: unknown) => console.error('[quit-flush] a flush failed', e)),
    ),
  )
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  await Promise.race([all.then(() => undefined), timeout])
  clearTimeout(timer)
}
