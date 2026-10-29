// Local model benchmark files (#434, docs/specs/0434-local-model-benchmark.md): a run file per
// model and machine (`BenchRun`, docs/benchmarks/runs/) and the merged report the website reads
// (`BenchReport`, docs/benchmarks/model-benchmarks.json). Nothing in the app reads these; the
// benchmark scripts validate with them through scripts/lib/bench-app.ts.
import { z } from 'zod'
import { IsoDateTime } from './common'

export const BENCH_TASKS = ['ideation', 'drafting', 'critique'] as const
export const BenchTask = z.enum(BENCH_TASKS)
export type BenchTask = z.infer<typeof BenchTask>

export const BenchModel = z.object({
  /** "ollama:qwen3.5:9b", "lmstudio:qwen/qwen3.5-9b"; "mock:…" only in smoke runs. */
  ref: z.string().min(1).max(200),
  tool: z.enum(['lmstudio', 'ollama', 'mock']),
  toolVersion: z.string().max(60).optional(),
  name: z.string().min(1).max(200),
  digest: z.string().max(100).optional(),
  quantization: z.string().max(60).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  /** Context length the run configured (or the tool reported for the loaded model). */
  contextLength: z.number().int().positive().optional(),
})
export type BenchModel = z.infer<typeof BenchModel>

/** Coarse hardware only: no hostname, username or path (NFR-2). */
export const BenchHardware = z.object({
  platform: z.string().max(20),
  arch: z.string().max(20),
  appleSilicon: z.boolean(),
  ramGb: z.number().int().nonnegative(),
  vramGb: z.number().int().nonnegative().optional(),
  gpuName: z.string().max(100).optional(),
  /** Memory a local model may use, as hardwareView computes it, rounded to GB. */
  budgetGb: z.number().int().nonnegative(),
})
export type BenchHardware = z.infer<typeof BenchHardware>

export const TaskScore = z.object({
  task: BenchTask,
  score: z.number().min(0).max(100),
  /** Sub-scores 0–100 and raw measures: reliability, lint, citations.resolution, … */
  parts: z.record(z.string(), z.number()),
  /** Per-code lint counts, missed defects, per-case scores. */
  details: z.record(z.string(), z.unknown()).default({}),
  wallSeconds: z.number().nonnegative(),
  outputTokensPerSecond: z.number().nonnegative().optional(),
})
export type TaskScore = z.infer<typeof TaskScore>

export const BenchFailure = z.object({
  caseId: z.string(),
  stage: z.string(),
  error: z.string().max(2000),
})
export type BenchFailure = z.infer<typeof BenchFailure>

export const BenchRepeat = z.object({
  seed: z.number().int(),
  tasks: z.array(TaskScore),
  overall: z.number().min(0).max(100),
  failures: z.array(BenchFailure).default([]),
})
export type BenchRepeat = z.infer<typeof BenchRepeat>

export const BenchMedian = z.object({
  overall: z.number(),
  tasks: z.record(z.string(), z.number()),
  /** Median share (0–1) of drafting pipeline stages that succeeded; the floor needs ≥ 0.9. */
  draftingReliability: z.number().min(0).max(1),
})
export type BenchMedian = z.infer<typeof BenchMedian>

export const BenchRange = z.object({ overall: z.tuple([z.number(), z.number()]) })

export const BENCH_FORMAT_VERSION = 1

export const BenchRun = z.object({
  formatVersion: z.literal(BENCH_FORMAT_VERSION),
  suite: z.string().min(1).max(40),
  suiteVersion: z.number().int().positive(),
  /** 1: no grounding support (FR-11 b) until #423 lands. */
  scoringVersion: z.number().int().positive(),
  appVersion: z.string().max(40),
  appCommit: z.string().max(60),
  promptHashes: z.record(z.string(), z.string()),
  corpusHashes: z.record(z.string(), z.string()),
  /** "local-onnx:Xenova/bge-small-en-v1.5" or "hash". */
  embedder: z.string().max(100),
  model: BenchModel,
  hardware: BenchHardware,
  startedAt: IsoDateTime,
  repeats: z.array(BenchRepeat).min(1),
  median: BenchMedian,
  range: BenchRange,
  unstable: z.boolean(),
})
export type BenchRun = z.infer<typeof BenchRun>

export const BenchReportModel = z.object({
  model: BenchModel,
  runs: z.number().int().positive(),
  median: BenchMedian,
  range: BenchRange,
  unstable: z.boolean(),
  hardware: z.array(BenchHardware),
  /** Size on disk plus the KV-cache estimate for the context used, in GB. */
  fitsBudgetGb: z.number().nonnegative(),
})
export type BenchReportModel = z.infer<typeof BenchReportModel>

export const BenchRecommendation = z.object({
  tier: z.string(),
  minBudgetGb: z.number(),
  maxBudgetGb: z.number().nullable(),
  /** Model ref, or null when no model in the tier passes the floor. */
  model: z.string().nullable(),
  reason: z.string(),
  /** The runs behind the recommendation: hardware and date. */
  backedBy: z.array(z.object({ hardware: BenchHardware, startedAt: IsoDateTime })).default([]),
})
export type BenchRecommendation = z.infer<typeof BenchRecommendation>

export const BenchReport = z.object({
  formatVersion: z.literal(BENCH_FORMAT_VERSION),
  generatedAt: IsoDateTime,
  suite: z.string(),
  suiteVersion: z.number().int().positive(),
  scoringVersion: z.number().int().positive(),
  models: z.array(BenchReportModel),
  recommendations: z.array(BenchRecommendation),
  archived: z.array(
    z.object({
      suiteVersion: z.number().int().positive(),
      scoringVersion: z.number().int().positive(),
      runs: z.number().int().positive(),
    }),
  ),
})
export type BenchReport = z.infer<typeof BenchReport>

/** JSON Schema of the report, committed as docs/benchmarks/model-benchmarks.schema.json. */
export function benchReportJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(BenchReport, { io: 'output' }) as Record<string, unknown>
}
