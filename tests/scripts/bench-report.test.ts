// scripts/bench/report.mjs: merging benchmark runs into the report the website reads (#434).
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BenchReport, BenchRun } from '@shared/schemas/bench'
import { loadSuite } from '../../scripts/bench/corpus.mjs'
import {
  BEGIN,
  buildReport,
  END,
  findForbidden,
  fitsBudgetGb,
  loadRuns,
  md,
  readmeTables,
  recommend,
  mergeRuns,
  spliceReadme,
  tierLabel,
} from '../../scripts/bench/report.mjs'

const suite = loadSuite('standard')
const TIERS = [
  { min: 0, max: 10 },
  { min: 10, max: 24 },
  { min: 24, max: 72 },
  { min: 72, max: Infinity },
]
const GB = 1e9

interface RunOpts {
  ref: string
  sizeGb: number
  overall: number
  tasks?: Partial<Record<'drafting' | 'critique' | 'ideation', number>>
  reliability?: number
  unstable?: boolean
  suiteVersion?: number
  startedAt?: string
}

function run(o: RunOpts): BenchRun {
  const tasks = { drafting: o.overall, critique: o.overall, ideation: o.overall, ...o.tasks }
  return BenchRun.parse({
    formatVersion: 1,
    suite: 'standard',
    suiteVersion: o.suiteVersion ?? suite.suiteVersion,
    scoringVersion: 1,
    appVersion: '0.7.0',
    appCommit: 'abc1234',
    promptHashes: { critique: 'h' },
    corpusHashes: { 'city-water': 'c' },
    embedder: 'local-onnx:Xenova/bge-small-en-v1.5',
    model: {
      ref: o.ref,
      tool: 'ollama',
      name: o.ref.slice('ollama:'.length),
      quantization: 'Q4_K_M',
      sizeBytes: Math.round(o.sizeGb * GB),
      contextLength: 32768,
    },
    hardware: { platform: 'darwin', arch: 'arm64', appleSilicon: true, ramGb: 32, budgetGb: 24 },
    startedAt: o.startedAt ?? '2026-11-01T10:00:00.000Z',
    repeats: [{ seed: 11, tasks: [], overall: o.overall, failures: [] }],
    median: { overall: o.overall, tasks, draftingReliability: o.reliability ?? 1 },
    range: { overall: [o.overall - 2, o.overall + 2] },
    unstable: o.unstable ?? false,
  })
}

describe('fitting a memory budget', () => {
  it('adds a context-cache estimate to the size on disk', () => {
    expect(fitsBudgetGb({ sizeBytes: 6.55 * GB, contextLength: 32768 })).toBe(7.2)
    expect(fitsBudgetGb({ sizeBytes: 6.55 * GB, contextLength: 65536 })).toBe(7.9)
    expect(fitsBudgetGb({ sizeBytes: 0.5 * GB })).toBe(0.8)
  })

  it('labels the tiers as the setup screen does', () => {
    expect(TIERS.map(tierLabel)).toEqual(['under 10 GB', '10–24 GB', '24–72 GB', '72 GB and up'])
  })
})

describe('recommend', () => {
  const entries = (runs: BenchRun[]) => mergeRuns(runs, suite.thresholds.unstableRange)

  it('picks the best model that fits each tier and passes the floor', () => {
    const recs = recommend(
      entries([
        run({ ref: 'ollama:small', sizeGb: 3.3, overall: 60 }),
        run({ ref: 'ollama:mid', sizeGb: 6.6, overall: 72 }),
        run({ ref: 'ollama:big', sizeGb: 18.6, overall: 80 }),
      ]),
      TIERS,
      suite.thresholds,
    )
    expect(recs.map((r) => r.model)).toEqual([
      'ollama:small',
      'ollama:mid',
      'ollama:big',
      'ollama:big',
    ])
    expect(recs[1]!.reason).toMatch(/72/)
    expect(recs[1]!.backedBy).toEqual([
      { hardware: expect.objectContaining({ ramGb: 32 }), startedAt: '2026-11-01T10:00:00.000Z' },
    ])
  })

  it('skips models below the floor: a task under 50, drafting reliability under 90% or unstable', () => {
    const recs = recommend(
      entries([
        run({ ref: 'ollama:weak-critic', sizeGb: 3, overall: 90, tasks: { critique: 40 } }),
        run({ ref: 'ollama:flaky', sizeGb: 3, overall: 85, reliability: 0.8 }),
        run({ ref: 'ollama:unstable', sizeGb: 3, overall: 80, unstable: true }),
        run({ ref: 'ollama:steady', sizeGb: 3, overall: 55 }),
      ]),
      TIERS,
      suite.thresholds,
    )
    expect(recs[0]!.model).toBe('ollama:steady')
  })

  it('says so when no model in a tier passes the floor or none fits', () => {
    const recs = recommend(
      entries([run({ ref: 'ollama:mid', sizeGb: 6.6, overall: 45 })]),
      TIERS,
      suite.thresholds,
    )
    expect(recs[0]).toMatchObject({
      model: null,
      reason: expect.stringMatching(/No benchmarked model fits/),
    })
    expect(recs[1]).toMatchObject({
      model: null,
      reason: expect.stringMatching(/passes the floor/),
    })
  })
})

describe('buildReport', () => {
  it('merges runs per model, archives other suite versions and validates', () => {
    const runs = [
      run({ ref: 'ollama:mid', sizeGb: 6.6, overall: 70 }),
      run({ ref: 'ollama:mid', sizeGb: 6.6, overall: 80, startedAt: '2026-11-02T10:00:00.000Z' }),
      run({ ref: 'ollama:old', sizeGb: 3, overall: 99, suiteVersion: 99 }),
    ]
    const report = BenchReport.parse(
      buildReport(runs, {
        suite,
        scoringVersion: 1,
        tiers: TIERS,
        now: new Date('2026-11-03T00:00:00Z'),
      }),
    )
    expect(report.models).toHaveLength(1)
    expect(report.models[0]).toMatchObject({
      runs: 2,
      median: { overall: 75 },
      range: { overall: [68, 82] },
    })
    expect(report.archived).toEqual([{ suiteVersion: 99, scoringVersion: 1, runs: 1 }])
    expect(report.recommendations[1]!.model).toBe('ollama:mid')
  })

  it('flags a model whose runs disagree by more than the unstable range', () => {
    const [m] = mergeRuns(
      [
        run({ ref: 'ollama:a', sizeGb: 3, overall: 50 }),
        run({ ref: 'ollama:a', sizeGb: 3, overall: 80 }),
      ],
      15,
    )
    expect(m!.unstable).toBe(true)
  })
})

describe('run files are untrusted', () => {
  it('finds absolute paths and host or user fields anywhere in a run', () => {
    expect(findForbidden({ a: { b: ['/Users/someone/x'] } })).toEqual(['$.a.b[0]'])
    expect(findForbidden({ hostname: 'box', note: 'C:\\Users\\x' })).toEqual([
      '$.hostname',
      '$.note',
    ])
    expect(findForbidden({ ref: 'ollama:qwen3.5:9b', gpuName: 'Apple M3' })).toEqual([])
  })

  it('refuses a file with a path, a malformed file and a mock run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-runs-'))
    const good = run({ ref: 'ollama:mid', sizeGb: 6.6, overall: 70 })
    writeFileSync(join(dir, 'a.json'), JSON.stringify(good))
    expect(loadRuns(dir, BenchRun)).toHaveLength(1)
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ ...good, appCommit: '/home/me/repo' }))
    expect(() => loadRuns(dir, BenchRun)).toThrow(/b.json: paths/)
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ ...good, suite: 3 }))
    expect(() => loadRuns(dir, BenchRun)).toThrow(/b.json: not a benchmark run/)
    writeFileSync(
      join(dir, 'b.json'),
      JSON.stringify({ ...good, model: { ...good.model, tool: 'mock' } }),
    )
    expect(() => loadRuns(dir, BenchRun)).toThrow(/mock runs/)
  })

  it('escapes Markdown in table cells', () => {
    expect(md('evil | <img src=x> [link](http://x)\n')).toBe(
      'evil \\| \\<img src=x\\> \\[link\\]\\(http://x\\)',
    )
  })
})

describe('the README table', () => {
  const report = buildReport([run({ ref: 'ollama:mid', sizeGb: 6.6, overall: 72 })], {
    suite,
    scoringVersion: 1,
    tiers: TIERS,
  })

  it('has header rows and text values only', () => {
    const text = readmeTables(report)
    expect(text).toContain('| Memory for models | Recommended model | Why |')
    expect(text).toContain(
      '| mid | ollama | Q4\\_K\\_M | 6.6 GB | 72 (70–74) | 72 | 72 | 72 | 1 | 1 | stable |',
    )
  })

  it('replaces only the generated block', () => {
    const readme = `# Title\n\nIntro\n\n${BEGIN}\nold\n${END}\n\nOutro\n`
    const out = spliceReadme(readme, 'NEW')
    expect(out).toBe(`# Title\n\nIntro\n\n${BEGIN}\n\nNEW\n\n${END}\n\nOutro\n`)
    expect(() => spliceReadme('# no markers', 'x')).toThrow(/markers/)
  })
})
