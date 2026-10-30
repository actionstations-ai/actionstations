// Types for scripts/bench/determinism.mjs.
interface RepeatLike {
  tasks: { task: string; score: number; details?: Record<string, unknown> }[]
}
export function differingTasks(a: RepeatLike, b: RepeatLike): string[]
export function determinismOf(
  repeats: RepeatLike[],
  seed: number,
): { seed: number; identical: boolean; differing: string[] }
