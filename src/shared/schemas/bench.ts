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
  /** Model-card settings the run used (#585): profile id, sampling, reasoning level, draft model. */
  inference: z
    .object({
      profile: z.string().max(60),
      sampling: z.record(z.string(), z.number()).optional(),
      temperaturePolicy: z.enum(['profile', 'stage']).optional(),
      source: z.string().url().optional(),
      reasoningEffort: z.string().max(20).optional(),
      draftModel: z.string().max(200).optional(),
    })
    .optional(),
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
  /**
   * Critique is advisory (scoring version 2): median % of planted defects found (noted or fixed
   * by the revision), % fixed by the revision, and % of correct rows the revision damaged.
   */
  critique: z
    .object({
      recall: z.number().min(0).max(100),
      fixed: z.number().min(0).max(100),
      damage: z.number().min(0).max(100),
    })
    .optional(),
})
export type BenchMedian = z.infer<typeof BenchMedian>

export const BenchRange = z.object({ overall: z.tuple([z.number(), z.number()]) })

export const BENCH_FORMAT_VERSION = 1

export const BenchRun = z.object({
  formatVersion: z.literal(BENCH_FORMAT_VERSION),
  suite: z.string().min(1).max(40),
  suiteVersion: z.number().int().positive(),
  /** Bumped when a scorer changes; 1 includes grounding support (#423), 2 scores the revised critique (#592). */
  scoringVersion: z.number().int().positive(),
  appVersion: z.string().max(40),
  appCommit: z.string().max(60),
  promptHashes: z.record(z.string(), z.string()),
  corpusHashes: z.record(z.string(), z.string()),
  // `pnpm bench:export` hash of the task set the run used (#586); older runs lack it.
  taskSetHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  /** "local-onnx:Xenova/bge-small-en-v1.5" or "hash". */
  embedder: z.string().max(100),
  model: BenchModel,
  hardware: BenchHardware,
  startedAt: IsoDateTime,
  /** App instances that ran cases in parallel (#584); absent for a serial run. */
  concurrency: z.number().int().min(2).max(8).optional(),
  /** A triage run (`--triage`): one repeat, pass or fail against the floor, never published. */
  triage: z.boolean().optional(),
  /** Set when the run stopped after repeat 2 because both repeats missed the floor on one criterion (#584). */
  stoppedEarly: z
    .object({ afterRepeat: z.number().int().positive(), reason: z.string().max(500) })
    .optional(),
  repeats: z.array(BenchRepeat).min(1),
  median: BenchMedian,
  range: BenchRange,
  unstable: z.boolean(),
  /** The optional local judge (`--judge`, FR-17); never part of the overall score. */
  judge: z
    .object({
      model: z.string().max(120),
      /** Agreement with the human-scored calibration rows; null without a calibration set. */
      kappa: z.number().nullable(),
      calibrationRows: z.number().int().nonnegative(),
      published: z.boolean(),
      scores: z.record(z.string(), z.number()),
    })
    .optional(),
  /** Two repeats at the same seed (`--determinism`): did they score the same (#503)? */
  determinism: z
    .object({ seed: z.number().int(), identical: z.boolean(), differing: z.array(z.string()) })
    .optional(),
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

// ---- Tabletop Mini Benchmark (#604, docs/specs/0445-tabletop-mini-benchmark.md) --------------

/** A failed call: what kind of failure, and for a stall or a loop the raw tail of the reply. */
export const MiniFailure = z.object({
  kind: z.enum(['stall', 'loop', 'cutoff', 'format', 'error']),
  detail: z.string().max(400),
  tail: z.string().max(400).optional(),
})
export type MiniFailure = z.infer<typeof MiniFailure>

export const MiniProbe = z.object({
  /** False when the call produced no usable reply (failed, cut off, stalled or looped). */
  ok: z.boolean(),
  /** Clean on the first try: no repair round and no reply cut off and asked again (not a failure if false). */
  firstTry: z.boolean(),
  /** The share of this probe's criteria met, 0 to 100 (for display; quality pools the criteria). */
  score: z.number().min(0).max(100),
  seconds: z.number().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  /** Absolute pass/fail criteria the quality score counts. */
  criteria: z.array(
    z.object({
      id: z.string().max(80),
      label: z.string().max(200),
      /** True when the criterion earned its full credit. */
      met: z.boolean(),
      /** Credit earned, 0 to 1: continuous measures earn a share (#612); absent in older run files. */
      credit: z.number().min(0).max(1).optional(),
    }),
  ),
  /** Raw measures (lint, citations, recall, damage, repetition…). */
  metrics: z.record(z.string(), z.number()),
  reason: z.string().max(400).optional(),
  failure: MiniFailure.optional(),
})
export type MiniProbe = z.infer<typeof MiniProbe>

export const MINI_LEVELS = ['recommended', 'usable', 'not_recommended'] as const

/** A figure with the range over the Mini's two runs; overlapping ranges are ties. */
export const MiniRange = z.object({ value: z.number(), min: z.number(), max: z.number() })
export type MiniRange = z.infer<typeof MiniRange>

const MiniSpeed = z.object({
  promptTokensPerSecond: z.number().nonnegative().optional(),
  outputTokensPerSecond: z.number().nonnegative().optional(),
  method: z.enum(['fit', 'pooled']).optional(),
  draftMinutes: z.number().nonnegative().optional(),
  longPromptTokens: z.number().int().nonnegative().optional(),
  longPromptSeconds: z.number().nonnegative().optional(),
  totalSeconds: z.number().nonnegative(),
})

/** One run of every probe, with its own seed and project copies. */
export const MiniRepeat = z.object({
  seed: z.number().int(),
  probes: z.record(z.string(), MiniProbe),
  quality: z.object({
    score: z.number().min(0).max(100),
    /** Credit earned over the criteria (a whole number when all were yes/no). */
    met: z.number().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  /** Percent of this run's calls that succeeded after the app's repair policy. */
  perCallRate: z.number().min(0).max(100),
  repairRate: z.number().min(0).max(100),
  completion: z.number().min(0).max(100),
  score: z.number().min(0).max(100),
  damage: z.number().min(0).max(100).optional(),
  speed: MiniSpeed,
  failures: z.array(
    z.object({
      probe: z.string().max(40),
      failure: MiniFailure.optional(),
    }),
  ),
})
export type MiniRepeat = z.infer<typeof MiniRepeat>

export const MiniRun = z.object({
  formatVersion: z.literal(BENCH_FORMAT_VERSION),
  kind: z.literal('mini'),
  suite: z.literal('mini'),
  suiteVersion: z.number().int().positive(),
  scoringVersion: z.number().int().positive(),
  appVersion: z.string().max(40),
  appCommit: z.string().max(60),
  promptHashes: z.record(z.string(), z.string()),
  corpusHashes: z.record(z.string(), z.string()),
  taskSetHash: z.string().regex(/^[0-9a-f]{64}$/),
  embedder: z.string().max(100),
  model: BenchModel,
  hardware: BenchHardware,
  startedAt: IsoDateTime,
  /** The stall and repetition limits the calls ran under (there is no time cap). */
  stream: z.object({
    firstTokenSeconds: z.number().positive(),
    stallSeconds: z.number().positive(),
    loopMinChars: z.number().int().positive(),
    loopMinRepeats: z.number().int().positive(),
  }),
  repeats: z.array(MiniRepeat).min(1),
  /** Quality x Completion, its pieces and the shown-alongside figures, each with its range. */
  result: z.object({
    score: MiniRange,
    quality: MiniRange.optional(),
    perCallRate: MiniRange,
    repairRate: MiniRange,
    completion: MiniRange,
    damage: MiniRange.optional(),
    draftMinutes: MiniRange.optional(),
    outputTokensPerSecond: MiniRange.optional(),
    promptTokensPerSecond: MiniRange.optional(),
    calls: z.number().int().nonnegative(),
    failedCalls: z.number().int().nonnegative(),
    repairedCalls: z.number().int().nonnegative(),
  }),
  verdict: z.object({
    level: z.enum(MINI_LEVELS),
    reasons: z.array(z.string().max(600)),
    notes: z.array(z.string().max(700)),
    uncertain: z.array(z.enum(MINI_LEVELS)).optional(),
  }),
})
export type MiniRun = z.infer<typeof MiniRun>
