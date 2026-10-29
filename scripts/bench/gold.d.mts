// Types for scripts/bench/gold.mjs (tests/scripts/bench-gold.test.ts).
import type { Gold } from './types.d.mts'
export const GOLD_SOURCE: string
export const GOLD_TAGGED: string
export const GOLD_FILE: string
export const TAG_GROUPS: string[][]
export interface GoldRow {
  id: string
  time: string
  from: string
  to: string
  event: string
  expectedAction: string
  phase: number
}
export function parseMsel(md: string): {
  phases: { index: number; title: string; startMin: number; endMin: number }[]
  rows: GoldRow[]
}
export function goldTag(row: GoldRow, tagged?: Record<string, string>): string
export function goldStats(md: string, tagged?: Record<string, string>): Gold
export function buildGold(root?: string): Gold
export function goldJson(gold: Gold): string
