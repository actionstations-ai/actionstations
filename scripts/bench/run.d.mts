// Types for the testable parts of scripts/bench/run.mjs (tests/scripts/bench-run.test.ts).
import type { BenchRun } from '../../src/shared/schemas/bench'
import type { Suite } from './types.d.mts'
export const LOCAL_EMBEDDER: string
export const TASKS: string[]
export interface RunArgs {
  suite: string
  out: string
  embedder: 'local' | 'hash'
  models: string[]
  repeats?: number
  baseUrl?: string
  yes?: boolean
  resume?: boolean
  clean?: boolean
  judge?: string
  determinism?: boolean
  concurrency: number
  triage?: boolean
}
export function parseArgs(argv: string[]): RunArgs
export interface CaseResult {
  caseId: string
  score: number
  parts: Record<string, number>
  details: Record<string, unknown>
  wallSeconds: number
  tokens?: { output: number; ms: number }
  reliability?: number
  promptHashes?: Record<string, string>
  failures?: { caseId: string; stage: string; error: string }[]
}
export function repeatFromCases(
  suite: Suite,
  r: number,
  cases: Record<string, CaseResult>,
  speed?: { output: number; ms: number },
): BenchRun['repeats'][number] & { reliability: number }
export function buildRun(input: {
  suite: Suite
  model: BenchRun['model']
  embedder: string
  mstate: {
    startedAt: string
    cases: Record<string, CaseResult>
    speed?: { output: number; ms: number }
    stoppedEarly?: { afterRepeat: number; reason: string }
  }
  repeats: number
  hardware: BenchRun['hardware']
  appVersion: string
  concurrency?: number
  triage?: boolean
}): BenchRun
export function summaryMarkdown(run: BenchRun): string
export function triageLine(
  run: BenchRun,
  thresholds: { floorTaskScore: number; floorDraftingReliability: number },
): string
