// Types for scripts/bench/taskset.mjs (tests/scripts/bench-taskset.test.ts).
export interface TaskSetManifest {
  formatVersion: 1
  suite: string
  suiteVersion: number
  scoringVersion: number
  hash: string
  files: Record<string, string>
}
export function corpusManifest(suite: unknown, root?: string): Record<string, unknown>
export function taskSetFiles(suiteName: string, root?: string): Record<string, string>
export function hashFiles(files: Record<string, string>): string
export function taskSetManifest(suiteName: string, root?: string): TaskSetManifest
export function taskSetHash(suiteName: string, root?: string): string
export function exportTaskSet(
  suiteName: string,
  outDir: string,
  root?: string,
): { dir: string; manifest: TaskSetManifest }
