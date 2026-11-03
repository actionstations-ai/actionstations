// scripts/bench/scheduler.mjs and the run file fields it feeds (#584): the worker pool,
// early stop, triage and the separate speed figure.
import { describe, expect, it } from 'vitest'
import { BenchRun } from '@shared/schemas/bench'
import { loadSuite } from '../../scripts/bench/corpus.mjs'
import {
  earlyStopReason,
  floorMisses,
  runPool,
  speedFigure,
  workerCount,
} from '../../scripts/bench/scheduler.mjs'
import {
  buildRun,
  parseArgs,
  repeatFromCases,
  summaryMarkdown,
  triageLine,
  type CaseResult,
} from '../../scripts/bench/run.mjs'

const thresholds = { floorTaskScore: 50, floorDraftingReliability: 0.9 }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('the worker pool', () => {
  it('never runs more items at once than there are workers', async () => {
    let running = 0
    let peak = 0
    await runPool([1, 2, 3, 4, 5, 6], 3, async () => {
      peak = Math.max(peak, ++running)
      await sleep(5)
      running--
    })
    expect(peak).toBe(3)
  })

  it('runs every item once and hands each worker its own index', async () => {
    const seen: number[] = []
    const workers = new Set<number>()
    await runPool([1, 2, 3, 4, 5], 2, async (item, w) => {
      seen.push(item)
      workers.add(w)
      await sleep(1)
    })
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5])
    expect([...workers].sort()).toEqual([0, 1])
  })

  it('starts items in list order', async () => {
    const started: number[] = []
    await runPool([1, 2, 3, 4], 2, async (item) => {
      started.push(item)
      await sleep(item === 1 ? 20 : 1)
    })
    expect(started).toEqual([1, 2, 3, 4])
  })

  it('stops handing out items after a failure and rejects with it', async () => {
    const ran: number[] = []
    await expect(
      runPool([1, 2, 3, 4, 5], 1, async (item) => {
        ran.push(item)
        if (item === 2) throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(ran).toEqual([1, 2])
  })

  it('starts no more app instances than there are cases', () => {
    expect(workerCount(3, 10)).toBe(3)
    expect(workerCount(3, 2)).toBe(2)
    expect(workerCount(3, 0)).toBe(1)
  })
})

describe('the floor and early stop', () => {
  const tasks = (d: number, c = 80, i = 80) => [
    { task: 'ideation', score: i },
    { task: 'drafting', score: d },
    { task: 'critique', score: c },
  ]

  it('names each miss', () => {
    expect(floorMisses(tasks(70), 1, thresholds)).toEqual([])
    expect(floorMisses(tasks(40, 30), 0.85, thresholds)).toEqual([
      'drafting scored 40, floor 50',
      'critique scored 30, floor 50',
      'drafting reliability 85%, floor 90%',
    ])
  })

  it('stops a multi-repeat run whose first repeat misses the floor, and says why', () => {
    const reason = earlyStopReason({ tasks: tasks(70), reliability: 0.8 }, 3, thresholds)
    expect(reason).toMatch(/Missed the floor in repeat 1: drafting reliability 80%/)
  })

  it('carries on when the first repeat reaches the floor', () => {
    expect(earlyStopReason({ tasks: tasks(70), reliability: 0.95 }, 3, thresholds)).toBeNull()
  })

  it('never stops a single-repeat run', () => {
    expect(earlyStopReason({ tasks: tasks(10), reliability: 0 }, 1, thresholds)).toBeNull()
  })
})

describe('arguments', () => {
  const base = ['--models', 'ollama:a']

  it('defaults to three parallel cases and accepts 1 to 8', () => {
    expect(parseArgs(base).concurrency).toBe(3)
    expect(parseArgs([...base, '--concurrency', '1']).concurrency).toBe(1)
    for (const bad of ['0', '9', '2.5', 'x'])
      expect(() => parseArgs([...base, '--concurrency', bad])).toThrow(/--concurrency/)
  })

  it('--triage means the standard suite at one repeat', () => {
    expect(parseArgs([...base, '--triage'])).toMatchObject({
      triage: true,
      suite: 'standard',
      repeats: 1,
    })
  })

  it('--triage refuses another suite, more repeats and --determinism', () => {
    expect(() => parseArgs([...base, '--triage', '--suite', 'quick'])).toThrow(/standard/)
    expect(() => parseArgs([...base, '--triage', '--repeats', '3'])).toThrow(/one repeat/)
    expect(() => parseArgs([...base, '--triage', '--determinism'])).toThrow(/determinism/)
  })
})

describe('the run file', () => {
  const suite = loadSuite('quick')
  const result = (caseId: string, score: number, extra: Partial<CaseResult> = {}): CaseResult => ({
    caseId,
    score,
    parts: { a: score },
    details: {},
    wallSeconds: 10,
    tokens: { output: 500, ms: 10_000 },
    ...extra,
  })
  const cases: Record<string, CaseResult> = {
    '0:ideation:city-water': result('city-water', 80),
    '0:drafting:city-water-chem': result('city-water-chem', 60, { reliability: 0.5 }),
    '0:critique:city-water-chem': result('city-water-chem', 40),
    '0:critique:county-911-storm-tdos': result('county-911-storm-tdos', 20),
  }
  const hardware = {
    platform: 'darwin',
    arch: 'arm64',
    appleSilicon: true,
    ramGb: 32,
    budgetGb: 24,
  }
  const model = { ref: 'ollama:m', tool: 'ollama' as const, name: 'm' }
  const build = (extra: Record<string, unknown> = {}) => {
    const { speed, stoppedEarly, ...top } = extra
    return buildRun({
      suite,
      model,
      embedder: 'hash',
      mstate: { startedAt: '2026-11-01T10:00:00.000Z', cases, speed, stoppedEarly } as never,
      repeats: 1,
      hardware,
      appVersion: '0.7.0',
      ...top,
    })
  }

  it('scores the same whatever the speed pass measured', () => {
    const serial = repeatFromCases(suite, 0, cases)
    const sped = repeatFromCases(suite, 0, cases, { output: 100, ms: 1000 })
    expect(sped.overall).toBe(serial.overall)
    expect(sped.tasks.map((t) => t.score)).toEqual(serial.tasks.map((t) => t.score))
  })

  it('reports tokens per second from the single-request pass, not the loaded cases', () => {
    const run = build({ speed: { output: 600, ms: 4000 } })
    expect(run.repeats[0]!.tasks.every((t) => t.outputTokensPerSecond === 150)).toBe(true)
    expect(speedFigure({ output: 0, ms: 0 })).toBeUndefined()
  })

  it('records concurrency, triage and the early-stop reason, and still validates', () => {
    const run = build({
      concurrency: 3,
      triage: true,
      stoppedEarly: { afterRepeat: 1, reason: 'Missed the floor in repeat 1: x' },
    })
    const parsed = BenchRun.parse(run)
    expect(parsed).toMatchObject({ concurrency: 3, triage: true })
    expect(summaryMarkdown(parsed)).toContain('Stopped early: Missed the floor in repeat 1: x.')
    expect(triageLine(parsed, thresholds)).toMatch(/misses the floor.*drafting reliability 50%/)
  })

  it('leaves the new fields out of a serial run', () => {
    const parsed = BenchRun.parse(build())
    expect(parsed).not.toHaveProperty('concurrency')
    expect(parsed).not.toHaveProperty('triage')
    expect(parsed).not.toHaveProperty('stoppedEarly')
  })
})
