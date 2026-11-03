// Scheduling and early-stop rules for the benchmark runner (#584). Pure functions, no app or
// model access, so they are unit tested on their own (tests/scripts/bench-scheduler.test.ts).

/**
 * Run `fn(item, worker)` over `items` on `workers` parallel workers. Each worker takes the next
 * unstarted item when it is free, so items start in list order. Resolves when all are done;
 * rejects with the first error after the other running items settle.
 */
export async function runPool(items, workers, fn) {
  const queue = [...items]
  const count = Math.max(1, Math.min(workers, queue.length))
  let failure
  const lane = async (worker) => {
    while (queue.length && !failure) {
      const item = queue.shift()
      try {
        await fn(item, worker)
      } catch (err) {
        failure ??= { err }
      }
    }
  }
  await Promise.all(Array.from({ length: count }, (_, w) => lane(w)))
  if (failure) throw failure.err
}

/** How many app instances to start: never more than there are cases to run. */
export const workerCount = (concurrency, pending) => Math.max(1, Math.min(concurrency, pending))

/**
 * Why a set of task scores and drafting reliability would miss the floor (FR-20); empty when
 * it passes. `tasks` is a repeat's `tasks` array; `reliability` the share 0 to 1.
 */
export function floorMisses(tasks, reliability, thresholds) {
  const misses = tasks
    .filter((t) => t.score < thresholds.floorTaskScore)
    .map((t) => `${t.task} scored ${Math.round(t.score)}, floor ${thresholds.floorTaskScore}`)
  if (reliability < thresholds.floorDraftingReliability)
    misses.push(
      `drafting reliability ${Math.round(reliability * 100)}%, floor ` +
        `${Math.round(thresholds.floorDraftingReliability * 100)}%`,
    )
  return misses
}

/**
 * Early stop after a repeat: a model that misses the floor in repeat 1 is not given more
 * repeats. Returns the reason, or null to carry on. Only applies when more repeats are planned.
 */
export function earlyStopReason(repeat, plannedRepeats, thresholds) {
  if (plannedRepeats <= 1) return null
  const misses = floorMisses(repeat.tasks, repeat.reliability, thresholds)
  return misses.length ? `Missed the floor in repeat 1: ${misses.join('; ')}` : null
}

/** Output tokens per second from a single-request pass; undefined without a usable timing. */
export function speedFigure(tokens) {
  return tokens && tokens.ms > 0 && tokens.output > 0
    ? tokens.output / (tokens.ms / 1000)
    : undefined
}
