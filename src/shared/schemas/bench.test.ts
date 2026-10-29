// Benchmark run and report schemas (#434): what the website imports must validate.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BenchReport, BenchRun, benchReportJsonSchema } from './bench'

const ROOT = join(__dirname, '..', '..', '..')

const run = {
  formatVersion: 1,
  suite: 'quick',
  suiteVersion: 1,
  scoringVersion: 1,
  appVersion: '0.7.0',
  appCommit: 'abc1234',
  promptHashes: {},
  corpusHashes: {},
  embedder: 'hash',
  model: { ref: 'ollama:m', tool: 'ollama', name: 'm' },
  hardware: {
    platform: 'linux',
    arch: 'x64',
    appleSilicon: false,
    ramGb: 64,
    vramGb: 24,
    budgetGb: 24,
  },
  startedAt: '2026-11-01T10:00:00.000Z',
  repeats: [
    {
      seed: 11,
      tasks: [{ task: 'drafting', score: 70, parts: { lint: 80 }, wallSeconds: 600 }],
      overall: 70,
    },
  ],
  median: { overall: 70, tasks: { drafting: 70 }, draftingReliability: 1 },
  range: { overall: [70, 70] },
  unstable: false,
}

describe('BenchRun', () => {
  it('accepts a run and fills defaults', () => {
    const parsed = BenchRun.parse(run)
    expect(parsed.repeats[0]!.failures).toEqual([])
    expect(parsed.repeats[0]!.tasks[0]!.details).toEqual({})
  })

  it('refuses scores out of range, unknown tools and tasks, and an empty repeat list', () => {
    const bad = (patch: Record<string, unknown>) => BenchRun.safeParse({ ...run, ...patch }).success
    expect(bad({ repeats: [] })).toBe(false)
    expect(bad({ model: { ...run.model, tool: 'anthropic' } })).toBe(false)
    expect(bad({ repeats: [{ ...run.repeats[0], overall: 140 }] })).toBe(false)
    expect(
      bad({
        repeats: [{ ...run.repeats[0], tasks: [{ ...run.repeats[0]!.tasks[0], task: 'injects' }] }],
      }),
    ).toBe(false)
    expect(bad({ formatVersion: 2 })).toBe(false)
  })
})

describe('BenchReport', () => {
  it('validates the committed report', () => {
    const file = join(ROOT, 'docs/benchmarks/model-benchmarks.json')
    expect(BenchReport.safeParse(JSON.parse(readFileSync(file, 'utf8'))).success).toBe(true)
  })

  it('matches the committed JSON Schema (pnpm bench:report --schema)', () => {
    const file = join(ROOT, 'docs/benchmarks/model-benchmarks.schema.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(benchReportJsonSchema())
  })
})
