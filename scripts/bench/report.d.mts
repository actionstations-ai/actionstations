// Types for scripts/bench/report.mjs (tests/scripts/bench-report.test.ts).
import type { BenchReport, BenchRun } from '../../src/shared/schemas/bench'
import type { Suite } from './types.d.mts'
export const LOWEST_TIER_BUDGET_GB: number
export const BEGIN: string
export const END: string
export interface Tier {
  min: number
  max: number
}
export type MergedModel = BenchReport['models'][number] & {
  backedBy: { hardware: BenchRun['hardware']; startedAt: string }[]
}
export function findForbidden(value: unknown, at?: string): string[]
export function kvCacheGb(model: { sizeBytes?: number; contextLength?: number }): number
export function fitsBudgetGb(model: { sizeBytes?: number; contextLength?: number }): number
export function mergeRuns(runs: BenchRun[], unstableRange: number): MergedModel[]
export function passesFloor(entry: MergedModel, thresholds: Suite['thresholds']): boolean
export function tierLabel(t: Tier): string
export function tierBudget(t: Tier): number
export function recommend(
  entries: MergedModel[],
  tiers: readonly Tier[],
  thresholds: Suite['thresholds'],
): BenchReport['recommendations']
export function buildReport(
  runs: BenchRun[],
  opts: { suite: Suite; scoringVersion: number; tiers: readonly Tier[]; now?: Date },
): BenchReport
export function md(s: unknown): string
export function readmeTables(report: BenchReport): string
export function spliceReadme(readme: string, tables: string): string
export interface RunSchema {
  safeParse(value: unknown): {
    success: boolean
    data?: unknown
    error?: { issues: { message: string }[] }
  }
}
export function loadRuns(dir: string, schema: RunSchema): BenchRun[]
