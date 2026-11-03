/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// scripts/bench/mini/*: the Tabletop Mini Benchmark's scoring, verdict, call cap, LM Studio
// handling and task set (#604). No model and no app: scenarios are the shipped examples, calls
// are a scripted IPC double.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadExample,
  loadSuite,
  ROOT,
  scenarioIdFor,
  shippedScenario,
} from '../../scripts/bench/corpus.mjs'
import { rerunCall, waitCapped } from '../../scripts/bench/mini/probes.mjs'
import { spearman } from '../../scripts/bench/mini/replay.mjs'
import { lmsCommands, manageModel, parseMiniArgs } from '../../scripts/bench/mini/run.mjs'
import {
  miniScore,
  phaseView,
  repetitionShare,
  runObservation,
  scoreFormat,
  scoreLongContext,
  scoreLongOutput,
  scoreReview,
  speedOf,
} from '../../scripts/bench/mini/score.mjs'
import { LEVEL_LABEL, summaryMarkdown, verdictOf } from '../../scripts/bench/mini/verdict.mjs'
import { taskSetFiles, taskSetHash } from '../../scripts/bench/taskset.mjs'

const mini = loadSuite('mini') as any
const gold = JSON.parse(readFileSync(join(ROOT, 'bench/gold/scenario-3.json'), 'utf8'))
const chemical = shippedScenario(loadExample('chemical-rmp'), 'rail-spot-release') as any
const okCall = { ok: true, seconds: 10, outputTokens: 1000, repairAttempts: 0 }

describe('the Mini suite', () => {
  it('names probes on real example scenarios and its phase exists', () => {
    for (const p of Object.values(mini.probes) as any[])
      expect(() => scenarioIdFor(loadExample(p.example), p.scenario)).not.toThrow()
    expect(chemical.phases.some((p: any) => p.index === mini.probes.longContext.phaseIndex)).toBe(
      true,
    )
  })

  it('has a task set of its own with a stable hash covering every probe example', () => {
    const files = taskSetFiles('mini')
    expect(taskSetHash('mini')).toMatch(/^[0-9a-f]{64}$/)
    expect(taskSetHash('mini')).not.toBe(taskSetHash('quick'))
    const corpus = JSON.parse(files['corpus.json']!)
    expect(Object.keys(corpus)).toEqual(
      expect.arrayContaining(['city-water', 'chemical-rmp', 'county-911']),
    )
    expect(Object.keys(files)).toContain('defects/county-911-storm-tdos.json')
  })

  it('keeps the held-out probe out of the published task set', () => {
    expect(() => taskSetFiles('mini-held-out')).toThrow(/held out/)
  })
})

describe('probe scores', () => {
  it('scores a valid format answer 100 and a repaired one lower', () => {
    expect(scoreFormat(okCall).score).toBe(100)
    expect(scoreFormat({ ...okCall, repairAttempts: 1 }).score).toBe(70)
  })

  it('fails a call that errored or hit the time cap, with the reason', () => {
    const bad = scoreFormat({ ok: false, seconds: 3, error: 'Output did not match\nX' })
    expect(bad).toMatchObject({ ok: false, score: 0 })
    expect(bad.reason).toContain('Output did not match X')
    expect(scoreFormat({ ok: false, seconds: 180, capped: true }).reason).toMatch(/time cap/)
  })

  it('scores one phase of the shipped scenario with the full benchmark scorers', () => {
    const last = chemical.phases.at(-1)
    const view = phaseView(chemical, last.id)
    expect(view.phases).toHaveLength(1)
    expect(view.msel.every((r: any) => r.phaseId === last.id)).toBe(true)
    const r = scoreLongContext({
      obs: okCall,
      scenario: chemical,
      phaseId: last.id,
      suite: mini,
      gold,
    })
    expect(r.ok).toBe(true)
    expect(r.score).toBeGreaterThan(40)
    expect(r.metrics.rows).toBe(view.msel.length)
  })

  it('scores the shipped handbook as complete and varied', () => {
    const id = scenarioIdFor(loadExample('city-water'), 'chem')
    const md = readFileSync(
      join(ROOT, 'examples/city-water/project/scenarios', id, 'documents/handbook.md'),
      'utf8',
    )
    const r = scoreLongOutput({ obs: okCall, handbookMd: md, simcellScripts: 3, suite: mini })
    expect(r.metrics.handbookSections).toBeGreaterThanOrEqual(mini.thresholds.handbookMinSections)
    expect(r.score).toBeGreaterThan(80)
  })

  it('sees a looping handbook as repetition and an empty one as incomplete', () => {
    const loop =
      'the controller reads the inject aloud and waits for the players to respond. '.repeat(40)
    expect(repetitionShare(loop)).toBeGreaterThan(0.8)
    const r = scoreLongOutput({ obs: okCall, handbookMd: loop, suite: mini })
    expect(r.score).toBeLessThan(20)
  })

  it('passes the critique case result through unchanged', () => {
    const critique = {
      score: 61,
      parts: { recall: 66.7, fixed: 33.3, damage: 4, intact: 92, noise: 90 },
    }
    const r = scoreReview({ obs: okCall, critique })
    expect(r.score).toBe(61)
    expect(r.metrics).toMatchObject({ recall: 66.7, damage: 4 })
    expect(scoreReview({ obs: { ok: false, seconds: 1, error: 'no JSON' }, critique }).ok).toBe(
      false,
    )
  })

  it('reads a stage run from provenance', () => {
    const obs = runObservation(
      {
        provenance: [
          {
            stage: 'msel_phase',
            itemId: 'p1',
            status: 'ok',
            startedAt: '2026-11-03T10:00:00.000Z',
            finishedAt: '2026-11-03T10:00:30.000Z',
            inputTokens: 20000,
            outputTokens: 3000,
            repairAttempts: 1,
          },
        ],
      },
      'msel_phase',
      'p1',
    )
    expect(obs).toMatchObject({ ok: true, seconds: 30, inputTokens: 20000, repairAttempts: 1 })
    expect(runObservation({ provenance: [] }, 'critique').ok).toBe(false)
  })
})

describe('speed and the Mini score', () => {
  it('derives tokens per second and the long-prompt time from the calls', () => {
    const long = { ok: true, seconds: 40, inputTokens: 22000, outputTokens: 2000 }
    const s = speedOf({ calls: [okCall, long], longPrompt: long })
    expect(s).toMatchObject({ longPromptTokens: 22000, longPromptSeconds: 40, totalSeconds: 50 })
    expect(s.outputTokensPerSecond).toBe(60)
  })

  it('weights the probes and lets the held-out review share the review weight', () => {
    const probes = {
      format: { score: 100 },
      longContext: { score: 50 },
      longOutput: { score: 100 },
      review: { score: 40 },
      heldOutReview: { score: 80 },
    }
    // 0.1*100 + 0.35*50 + 0.2*100 + 0.35*60
    expect(miniScore(probes, mini.weights.mini)).toBe(68.5)
  })
})

describe('verdict', () => {
  const t = mini.thresholds
  const fine = (over: Record<string, unknown> = {}) => ({
    format: { ok: true, score: 100, metrics: { repairAttempts: 0 } },
    longContext: { ok: true, score: 80, metrics: { repairAttempts: 0 } },
    longOutput: { ok: true, score: 90, metrics: { repairAttempts: 0, repetition: 0.05 } },
    review: { ok: true, score: 70, metrics: { recall: 66, damage: 2 } },
    ...over,
  })
  const speed = {
    outputTokensPerSecond: 60,
    longPromptTokens: 22000,
    longPromptSeconds: 40,
    totalSeconds: 200,
  }
  const verdict = (probes: any, sp = speed, score = 80) =>
    verdictOf({ probes, speed: sp, score, thresholds: t })

  it('says will work when everything ran within the limits', () => {
    expect(verdict(fine()).level).toBe('will_work')
  })

  it("says won't work when a generation call failed, naming the cause", () => {
    const v = verdict(
      fine({
        longOutput: {
          ok: false,
          score: 0,
          metrics: {},
          reason: 'The long-output call failed: cut off at the length limit',
        },
      }),
    )
    expect(v.level).toBe('wont_work')
    expect(v.reasons[0]).toMatch(/cut off/)
  })

  it("says won't work for a very low score even if all calls ran", () => {
    expect(verdict(fine(), speed, 30).level).toBe('wont_work')
  })

  it('says risky for a review that damages correct rows, with the advice', () => {
    const v = verdict(
      fine({ review: { ok: true, score: 50, metrics: { recall: 66, damage: 23 } } }),
    )
    expect(v.level).toBe('risky')
    expect(v.reasons.join(' ')).toMatch(/23% damaged/)
  })

  it('says risky for a looping handbook, repair rounds, a failed review and slow output', () => {
    expect(
      verdict(
        fine({
          longOutput: { ok: true, score: 60, metrics: { repairAttempts: 0, repetition: 0.4 } },
        }),
      ).level,
    ).toBe('risky')
    expect(
      verdict(fine({ format: { ok: true, score: 70, metrics: { repairAttempts: 1 } } })).level,
    ).toBe('risky')
    expect(
      verdict(
        fine({ review: { ok: false, score: 0, metrics: {}, reason: 'The review call failed: x' } }),
      ).level,
    ).toBe('risky')
    expect(verdict(fine(), { ...speed, outputTokensPerSecond: 8 }).reasons.join(' ')).toMatch(
      /slow/,
    )
    expect(verdict(fine(), { ...speed, longPromptSeconds: 200 }).level).toBe('risky')
  })

  it('prints the summary with the level label and a probe table', () => {
    const md = summaryMarkdown({
      model: { ref: 'lmstudio:x' },
      suiteVersion: 1,
      score: 80,
      probes: fine(),
      speed,
      verdict: verdict(fine()),
    })
    expect(md).toContain(LEVEL_LABEL.will_work)
    expect(md).toContain('| Long prompt |')
  })
})

describe('the per-call time cap', () => {
  const running = (cancelled: string[]) => async (channel: string, payload: any) => {
    if (channel === 'jobs:get')
      return { id: 'j', status: cancelled.length ? 'cancelled' : 'running', message: '' }
    if (channel === 'jobs:cancel') {
      cancelled.push(payload.jobId)
      return undefined
    }
    if (channel === 'generate:rerun-stage') return { jobId: 'j' }
    if (channel === 'scenarios:get') return { provenance: [], warnings: [], msel: [] }
    throw new Error(`unexpected ${channel}`)
  }

  it('cancels a call that outlives the cap and reports it capped', async () => {
    const cancelled: string[] = []
    const ctx = { invoke: running(cancelled), log: () => {}, pollMs: 10 }
    const r = await waitCapped(ctx, 'j', 'x', 0.05)
    expect(r.capped).toBe(true)
    expect(cancelled).toEqual(['j'])
  })

  it('records a capped re-run as a failed observation', async () => {
    const ctx = { invoke: running([]), log: () => {}, pollMs: 10, capSeconds: 0.05 }
    const { obs } = await rerunCall(ctx, {
      projectPath: 'p',
      scenarioId: 's',
      stage: 'msel_phase',
      itemId: 'i',
    })
    expect(obs).toMatchObject({ ok: false, capped: true })
    expect(scoreFormat(obs).reason).toMatch(/time cap/)
  })
})

describe('the runner', () => {
  it('reads a list of models and the switches', () => {
    const a = parseMiniArgs([
      '--',
      '--models',
      'lmstudio:a, lmstudio:b',
      '--held-out',
      '--cap',
      '120',
    ])
    expect(a).toMatchObject({
      models: ['lmstudio:a', 'lmstudio:b'],
      heldOut: true,
      cap: 120,
      load: true,
    })
    expect(parseMiniArgs(['--models', 'ollama:a', '--no-load']).load).toBe(false)
    expect(() => parseMiniArgs([])).toThrow(/--models/)
    expect(() => parseMiniArgs(['--models', 'a', '--suite', 'quick'])).toThrow(/only/)
    expect(() => parseMiniArgs(['--models', 'a', '--cap', '5'])).toThrow(/30 to 1800/)
  })

  it('loads an LM Studio model at the suite context and unloads it after', () => {
    const calls: string[][] = []
    const model = { name: 'qwen/qwen3.5-9b', tool: 'lmstudio' }
    const m = manageModel(model, 32768, { load: true, exec: (a) => void calls.push(a) })
    m.done()
    expect(calls).toEqual([
      ['load', 'qwen/qwen3.5-9b', '--context-length', '32768', '-y'],
      ['unload', 'qwen/qwen3.5-9b'],
    ])
    expect(lmsCommands(model, 32768).serverStop).toEqual(['server', 'stop'])
  })

  it('leaves Ollama models and --no-load runs alone', () => {
    const calls: string[][] = []
    const exec = (a: string[]) => void calls.push(a)
    manageModel({ name: 'qwen3.5:9b', tool: 'ollama' }, 32768, { load: true, exec }).done()
    manageModel({ name: 'x', tool: 'lmstudio' }, 32768, { load: false, exec }).done()
    expect(calls).toEqual([])
  })

  it('still unloads when the unload command fails', () => {
    const exec = (a: string[]) => {
      if (a[0] === 'unload') throw new Error('not loaded')
    }
    expect(() =>
      manageModel({ name: 'x', tool: 'lmstudio' }, 32768, { load: true, exec }).done(),
    ).not.toThrow()
  })
})

describe('rank correlation for the validation', () => {
  it('is 1 for the same order, -1 for the reverse and handles ties', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1)
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1)
    expect(spearman([1, 1, 2], [1, 2, 3])).toBeGreaterThan(0.8)
  })
})
