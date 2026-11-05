// A small concurrency limit for gallery preview renders (#1070). The main process renders
// through a pool of two offscreen windows; asking it for hundreds of previews at once keeps that
// pool busy for minutes and puts the card the user is looking at at the back of the line. Here
// at most `limit` renders are in flight, and when a slot frees the next one is a card that is on
// screen now, before cards that were only scrolled past.

export interface QueueOptions {
  /** Is the caller still on screen? Visible callers start first. */
  isVisible?: () => boolean
  /** Aborting drops a call that has not started; a started render is left to finish. */
  signal?: AbortSignal
}

interface Waiting {
  start: () => void
  isVisible: () => boolean
}

export interface RenderQueue {
  run<T>(task: () => Promise<T>, opts?: QueueOptions): Promise<T>
  /** Calls waiting for a slot (for tests). */
  readonly waiting: number
  readonly running: number
}

function abortError(): Error {
  return new DOMException('The render was not needed any more.', 'AbortError')
}

export function createRenderQueue(limit: number): RenderQueue {
  const queue: Waiting[] = []
  let running = 0

  const next = () => {
    while (running < limit && queue.length > 0) {
      const visible = queue.findIndex((w) => w.isVisible())
      const [w] = queue.splice(visible === -1 ? 0 : visible, 1)
      w!.start()
    }
  }

  function run<T>(task: () => Promise<T>, opts: QueueOptions = {}): Promise<T> {
    const { signal, isVisible = () => true } = opts
    if (signal?.aborted) return Promise.reject(abortError())
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        const i = queue.indexOf(waiting)
        if (i === -1) return
        queue.splice(i, 1)
        reject(abortError())
      }
      const waiting: Waiting = {
        isVisible,
        start: () => {
          signal?.removeEventListener('abort', onAbort)
          running++
          task()
            .then(resolve, reject)
            .finally(() => {
              running--
              next()
            })
        },
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      queue.push(waiting)
      next()
    })
  }

  return {
    run,
    get waiting() {
      return queue.length
    },
    get running() {
      return running
    },
  }
}

/**
 * Gallery previews share one queue. Two render windows plus one waiting in main keeps the pool
 * busy without stacking work in front of the next card the user scrolls to.
 */
export const GALLERY_RENDER_LIMIT = 3
export const galleryRenders = createRenderQueue(GALLERY_RENDER_LIMIT)
