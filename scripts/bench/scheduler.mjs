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
 * The tasks the recommendation floor judges (#592). Critique is advisory: its recall, fixed
 * count and damage are reported next to the floor, but a model is not refused for them.
 */
export const FLOOR_TASKS = ['drafting', 'ideation']

/**
 * Why a set of task scores and drafting reliability would miss the floor (FR-20); empty when
 * it passes. `tasks` is a repeat's `tasks` array; `reliability` the share 0 to 1.
 */
export function floorMisses(tasks, reliability, thresholds) {
  const misses = tasks
    .filter((t) => FLOOR_TASKS.includes(t.task) && t.score < thresholds.floorTaskScore)
    .map((t) => `${t.task} scored ${Math.round(t.score)}, floor ${thresholds.floorTaskScore}`)
  if (reliability < thresholds.floorDraftingReliability)
    misses.push(
      `drafting reliability ${Math.round(reliability * 100)}%, floor ` +
        `${Math.round(thresholds.floorDraftingReliability * 100)}%`,
    )
  return misses
}

/** Which floor criteria a repeat misses: task names, and "drafting reliability". */
function missedCriteria(repeat, thresholds) {
  const tasks = repeat.tasks
    .filter((t) => FLOOR_TASKS.includes(t.task) && t.score < thresholds.floorTaskScore)
    .map((t) => t.task)
  return repeat.reliability < thresholds.floorDraftingReliability
    ? [...tasks, 'drafting reliability']
    : tasks
}

/**
 * Early stop, only when the median of three repeats is already decided: after repeat 2, if both
 * repeats miss the floor on the same criterion, the middle value of three is below it whatever
 * repeat 3 scores. One repeat never decides a median, so nothing stops after repeat 1.
 * `done` holds the finished repeats in order; returns the reason, or null to carry on.
 */
export function earlyStopReason(done, plannedRepeats, thresholds) {
  if (plannedRepeats !== 3 || done.length !== 2) return null
  const [a, b] = done.map((r) => missedCriteria(r, thresholds))
  const shared = a.filter((c) => b.includes(c))
  if (!shared.length) return null
  return (
    `Repeats 1 and 2 both missed the floor on ${shared.join(' and ')}, ` +
    'so the median of three repeats cannot reach it'
  )
}

/** Output tokens per second from a single-request pass; undefined without a usable timing. */
export function speedFigure(tokens) {
  return tokens && tokens.ms > 0 && tokens.output > 0
    ? tokens.output / (tokens.ms / 1000)
    : undefined
}
