// Types for scripts/bench/corpus.mjs (tests/scripts/bench-run.test.ts).
import type { DefectsFile } from './defects.d.mts'
import type { ScenarioLike, Suite } from './types.d.mts'
export const ROOT: string
export interface Example {
  id: string
  dir: string
  build: { scenarios: { key: string; threatFamily?: string; userPrompt?: string }[] }
  manifest: { scenarios: { id: string }[] }
}
export interface Brief {
  userPrompt?: string
  audience: string[]
  durationHours: number
  phaseCount: number
  threatFamily?: string
  [key: string]: unknown
}
export function loadSuite(name: string, root?: string): Suite
export function loadExample(id: string, root?: string): Example
export function scenarioIdFor(example: Example, key: string): string
export function shippedScenario(example: Example, key: string): ScenarioLike & { brief: Brief }
export function caseBrief(example: Example, key: string): Brief
export function loadDefects(name: string, root?: string): DefectsFile
export function corpusHash(example: Example): string
export function slug(s: string): string
export function machineSlug(hw: { platform: string; arch: string; ramGb: number }): string
export function runFileName(
  startedAt: string,
  modelRef: string,
  hw: { platform: string; arch: string; ramGb: number },
): string
