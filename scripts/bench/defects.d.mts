// Types for scripts/bench/defects.mjs (tests/scripts/bench-defects.test.ts).
import type { ScenarioLike, WarningLike } from './types.d.mts'
export const DEFECT_KINDS: string[]
export interface DefectSpec {
  id: string
  kind: string
  row?: string
  copyId?: string
  set?: Record<string, string>
  replace?: { field: string; find: string; with: string }[]
  words: string[]
}
export interface DefectsFile {
  case?: string
  example?: string
  scenario?: string
  defects: DefectSpec[]
}
export interface Planted {
  id: string
  kind: string
  words: string[]
  rows: string[]
  anyRow: boolean
}
export function applyDefects<S extends ScenarioLike>(
  scenario: S,
  file: DefectsFile,
): { scenario: S; planted: Planted[] }
export function noteMatches(note: Partial<WarningLike>, defect: Planted): boolean
