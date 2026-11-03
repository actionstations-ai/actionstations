type Thresholds = { floorTaskScore: number; floorDraftingReliability: number }
type Scored = { task: string; score: number }
export function runPool<T>(
  items: T[],
  workers: number,
  fn: (item: T, worker: number) => Promise<void>,
): Promise<void>
export function workerCount(concurrency: number, pending: number): number
export function floorMisses(tasks: Scored[], reliability: number, thresholds: Thresholds): string[]
export function earlyStopReason(
  done: { tasks: Scored[]; reliability: number }[],
  plannedRepeats: number,
  thresholds: Thresholds,
): string | null
export function speedFigure(tokens?: { output: number; ms: number }): number | undefined
