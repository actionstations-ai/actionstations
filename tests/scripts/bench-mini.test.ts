/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// scripts/bench/mini/*: the Tabletop Mini Benchmark's scoring, bands, stall handling, replay,
// LM Studio handling and task set (#604, #606). No model and no app: scenarios are the shipped
// examples, calls are a scripted IPC double.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadExample,
  loadSuite,
  ROOT,
  scenarioIdFor,
  shippedScenario,
} from '../../scripts/bench/corpus.mjs'
import { scenarioBudget, PIPELINE_STAGES } from '../../scripts/bench/mini/budget.mjs'
import { rerunCall, runProbes, streamGuardOptions } from '../../scripts/bench/mini/probes.mjs'
import { replayMiniRun, tableMarkdown } from '../../scripts/bench/mini/replay.mjs'
import { lmsCommands, manageModel, parseMiniArgs } from '../../scripts/bench/mini/run.mjs'
import {
  callRate,
  classifyFailure,
  compareRanges,
  damageOf,
  draftMinutes,
  firstTry,
  fitSpeeds,
  MINI_SCORING_VERSION,
  creditOf,
  handbookCriteria,
  longContextCredits,
  miniResult,
  phaseView,
  qualityOf,
  ramp,
  rangeOf,
  rateBounds,
  regradeProbe,
  repetitionShare,
  runObservation,
  scoreFormat,
  scoreLongContext,
  scoreLongOutput,
  scoreRepeat,
  speedOf,
  scoreReview,
  stretchPhase,
} from '../../scripts/bench/mini/score.mjs'
import {
  LEVEL_LABEL,
  bandOf,
  overBy,
  shortOf,
  summaryMarkdown,
  verdictOf,
} from '../../scripts/bench/mini/verdict.mjs'
import { restampRun } from '../../scripts/bench/mini/restamp.mjs'
import { rescoreRun } from '../../scripts/bench/mini/rescore.mjs'
import { taskSetFiles, taskSetHash } from '../../scripts/bench/taskset.mjs'

const mini = loadSuite('mini') as any
const gold = JSON.parse(readFileSync(join(ROOT, 'bench/gold/scenario-3.json'), 'utf8'))
const chemical = shippedScenario(loadExample('chemical-rmp'), 'rail-spot-release') as any
const okCall = { ok: true, seconds: 10, outputTokens: 1000, repairAttempts: 0, lengthRetries: 0 }
const bands = mini.bands

describe('the Mini suite', () => {
  it('names probes on real example scenarios and its phase exists', () => {
    for (const p of Object.values(mini.probes) as any[])
      expect(() => scenarioIdFor(loadExample(p.example), p.scenario)).not.toThrow()
    expect(chemical.phases.some((p: any) => p.index === mini.probes.longContext.phaseIndex)).toBe(
      true,
    )
  })

  it('has no per-call time cap and runs every probe twice with different seeds', () => {
    expect(JSON.stringify(mini)).not.toMatch(/callCap/i)
    expect(mini.repeats).toBe(2)
    expect(new Set(mini.seeds).size).toBe(2)
    expect(mini.stream).toMatchObject({ firstTokenSeconds: 600, stallSeconds: 60 })
  })

  it('asks the long-prompt probe for a full phase of 15 to 20 rows', () => {
    // The app asks for six rows an hour (src/main/generate/lint.ts, TARGET_ROWS_PER_HOUR).
    const asked = Math.round((mini.probes.longContext.phaseMinutes * 6) / 60)
    expect(asked).toBeGreaterThanOrEqual(15)
    expect(asked).toBeLessThanOrEqual(20)
    expect(mini.quality.phaseMinRows).toBe(15)
  })

  it('states the requirement bands in the suite file', () => {
    expect(bands).toEqual({
      recommended: { completion: 90, quality: 80, damage: 5 },
      usable: { completion: 75, quality: 60 },
    })
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

  it('turns the suite limits into provider options for the stream guard', () => {
    expect(streamGuardOptions(mini).streamGuard).toEqual({
      firstTokenMs: 600_000,
      stallMs: 60_000,
      loopMinChars: 400,
      loopMinRepeats: 5,
    })
  })
})

describe('the scenario token budget', () => {
  it('is what the pipeline and the bundled examples give, and matches the suite file', () => {
    const b = scenarioBudget({ phases: mini.scenarioBudget.phases })
    expect(b.modelStages).toBe(mini.scenarioBudget.modelStages)
    expect(b.inputTokens).toBe(mini.scenarioBudget.inputTokens)
    expect(b.outputTokens).toBe(mini.scenarioBudget.outputTokens)
  })

  it('lists the same stages as the pipeline', () => {
    const engine = readFileSync(join(ROOT, 'src/main/generate/engine.ts'), 'utf8')
    const block = /export const PIPELINE_STAGES: Stage\[\] = \[([^\]]*)\]/.exec(engine)![1]!
    const stages = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(PIPELINE_STAGES).toEqual(stages)
  })

  it('counts one msel_phase call per phase', () => {
    const four = scenarioBudget({ phases: 4 })
    const six = scenarioBudget({ phases: 6 })
    expect(six.modelStages - four.modelStages).toBe(2)
    expect(six.inputTokens).toBeGreaterThan(four.inputTokens)
  })
})

describe('stretching the phase', () => {
  const last = chemical.phases.at(-1)

  it('moves the end of the phase and the exercise, not the start', () => {
    const s = stretchPhase(chemical, last.id, 180)
    const p = s.phases.find((x: any) => x.id === last.id)
    expect(p.startTime).toBe(last.startTime)
    expect(p.endTime).toBe('6:00')
    expect(s.brief.durationHours).toBe(chemical.brief.durationHours + 2)
    expect(s.phases.filter((x: any) => x.id !== last.id)).toEqual(
      chemical.phases.filter((x: any) => x.id !== last.id),
    )
  })

  it('does not change the input scenario', () => {
    const before = JSON.stringify(chemical)
    stretchPhase(chemical, last.id, 180)
    expect(JSON.stringify(chemical)).toBe(before)
  })
})

describe('failures', () => {
  it('names a stall, a loop, a cut-off and a format failure, and keeps the raw tail', () => {
    const stall = classifyFailure(
      'Reply stalled: no new output for 60 s after the reply started. Last output: "The pump trips and"',
    )
    expect(stall).toMatchObject({ kind: 'stall', tail: 'The pump trips and' })
    const loop = classifyFailure(
      'Reply looped: repeating the same text (Notify the county). Last output: "Notify the county Notify"',
    )
    expect(loop.kind).toBe('loop')
    expect(
      classifyFailure(
        'no JSON object found in the reply (the reply was cut off at the length limit)',
      ).kind,
    ).toBe('cutoff')
    expect(classifyFailure('Output did not match the schema').kind).toBe('format')
    expect(classifyFailure('disk full').kind).toBe('error')
  })

  it('scores a failed call with no criteria, its reason and its tail', () => {
    const bad = scoreFormat({
      ok: false,
      seconds: 90,
      error: 'Reply stalled: no output for 600 s while the prompt was read. Last output: ""',
    })
    expect(bad).toMatchObject({ ok: false, firstTry: false, criteria: [] })
    expect(bad.reason).toMatch(/stalled/)
    expect(bad.failure?.kind).toBe('stall')
  })

  it('counts a repair round or a reply cut off and asked again as not first try', () => {
    expect(firstTry(okCall)).toBe(true)
    expect(firstTry({ ...okCall, repairAttempts: 1 })).toBe(false)
    expect(firstTry({ ...okCall, lengthRetries: 1 })).toBe(false)
    expect(scoreFormat({ ...okCall, repairAttempts: 1 })).toMatchObject({
      ok: true,
      firstTry: false,
    })
  })
})

describe('probe criteria', () => {
  it('judges a phase against the Scenario 3 reference with pass/fail criteria', () => {
    const last = chemical.phases.at(-1)
    const r = scoreLongContext({
      obs: okCall,
      scenario: chemical,
      phaseId: last.id,
      suite: { ...mini, quality: { ...mini.quality, phaseMinRows: 0 } },
      gold,
    })
    expect(r.ok).toBe(true)
    const ids = r.criteria.map((c: any) => c.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'rows',
        'pace',
        'tagMix',
        'opensEnds',
        'roles',
        'resolved',
        'covered',
      ]),
    )
    expect(r.criteria.every((c: any) => typeof c.met === 'boolean')).toBe(true)
    expect(r.metrics.rows).toBe(phaseView(chemical, last.id).msel.length)
  })

  it('needs a full phase of rows: the shipped one-hour phase fails the row-count criterion', () => {
    const last = chemical.phases.at(-1)
    const r = scoreLongContext({
      obs: okCall,
      scenario: chemical,
      phaseId: last.id,
      suite: mini,
      gold,
    })
    expect(r.criteria.find((c: any) => c.id === 'rows')?.met).toBe(false)
  })

  it('leaves the source-support criterion out when nothing was checked', () => {
    const last = chemical.phases.at(-1)
    const r = scoreLongContext({
      obs: okCall,
      scenario: chemical,
      phaseId: last.id,
      suite: mini,
      gold,
    })
    expect(r.criteria.map((c: any) => c.id)).not.toContain('supported')
  })

  it('scores the shipped handbook as complete and varied', () => {
    const id = scenarioIdFor(loadExample('city-water'), 'chem')
    const md = readFileSync(
      join(ROOT, 'examples/city-water/project/scenarios', id, 'documents/handbook.md'),
      'utf8',
    )
    const r = scoreLongOutput({ obs: okCall, handbookMd: md, simcellScripts: 3, suite: mini })
    expect(r.metrics.handbookSections).toBeGreaterThanOrEqual(mini.quality.handbookSections)
    expect(r.criteria.every((c: any) => c.met)).toBe(true)
    expect(r.score).toBe(100)
  })

  it('sees a looping handbook as repetition and a short one as incomplete', () => {
    const loop =
      'the controller reads the inject aloud and waits for the players to respond. '.repeat(40)
    expect(repetitionShare(loop)).toBeGreaterThan(0.8)
    const r = scoreLongOutput({ obs: okCall, handbookMd: loop, suite: mini })
    expect(r.criteria.filter((c: any) => c.met)).toHaveLength(0)
    expect(r.criteria.find((c: any) => c.id === 'noRepeat')?.met).toBe(false)
  })

  it('makes one criterion per planted defect and keeps damage as a metric', () => {
    const critique = {
      score: 61,
      parts: { recall: 66.7, fixed: 33.3, damage: 4, intact: 92, noise: 90 },
      details: { found: ['a', 'b'], missed: ['c'] },
    }
    const r = scoreReview({ obs: okCall, critique })
    expect(r.criteria.map((c: any) => [c.id, c.met])).toEqual([
      ['defect:a', true],
      ['defect:b', true],
      ['defect:c', false],
    ])
    expect(r.metrics).toMatchObject({ recall: 66.7, damage: 4 })
    expect(scoreReview({ obs: { ok: false, seconds: 1, error: 'no JSON' }, critique }).ok).toBe(
      false,
    )
  })

  it('reads a stage run from provenance, including cut-off retries', () => {
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
            lengthRetries: 1,
          },
        ],
      },
      'msel_phase',
      'p1',
    )
    expect(obs).toMatchObject({ ok: true, seconds: 30, repairAttempts: 1, lengthRetries: 1 })
    expect(runObservation({ provenance: [] }, 'critique').ok).toBe(false)
  })
})

describe('quality, completion and the Mini score', () => {
  const probe = (met: boolean[], over: Record<string, unknown> = {}) => ({
    ok: true,
    firstTry: true,
    score: 0,
    metrics: {},
    criteria: met.map((m, i) => ({ id: `c${i}`, label: 'x', met: m })),
    ...over,
  })
  const calls = (n: number) => Array.from({ length: n }, () => ({ key: 'x', ...okCall }))

  it('is the share of criteria met over the replies delivered; failed calls add none', () => {
    const q = qualityOf({
      a: probe([true, true, false, true]),
      b: probe([], { ok: false, firstTry: false }),
      c: probe([true]),
    })
    expect(q).toEqual({ score: 80, met: 4, total: 5 })
    expect(qualityOf({ a: probe([]) }).score).toBe(0)
  })

  it('takes review damage as the mean of the review calls', () => {
    expect(
      damageOf({
        review: probe([], { metrics: { damage: 10 } }),
        heldOutReview: probe([], { metrics: { damage: 4 } }),
      }),
    ).toBe(7)
    expect(damageOf({ format: probe([]) })).toBeUndefined()
  })

  it('raises the per-call success rate to the number of model calls in a scenario', () => {
    const allGood = { a: probe([true]), b: probe([true]), c: probe([true]), d: probe([true]) }
    const one = { ...allGood, d: probe([], { ok: false, firstTry: false }) }
    expect(callRate(one)).toBe(0.75)
    const good = scoreRepeat({ probes: allGood, calls: calls(4), suite: mini })
    expect(good).toMatchObject({ perCallRate: 100, repairRate: 0, completion: 100, score: 100 })
    const bad = scoreRepeat({ probes: one, calls: calls(4), suite: mini })
    // 0.75 ^ 14 = 1.8%
    expect(bad.completion).toBeCloseTo(1.8, 1)
    expect(bad.score).toBeLessThan(2)
  })

  it('does not count a repair round as a failure: it is reported as a repair rate', () => {
    const probes = { a: probe([true]), b: probe([true], { firstTry: false }) }
    const r = scoreRepeat({ probes, calls: calls(2), suite: mini })
    expect(r).toMatchObject({ perCallRate: 100, repairRate: 50, completion: 100, failures: [] })
    const result = miniResult({ repeats: [{ probes, result: r }], suite: mini })
    expect(result).toMatchObject({ failedCalls: 0, repairedCalls: 1, calls: 2 })
    expect(result.repairRate.value).toBe(50)
  })

  it('multiplies quality by completion and reports ranges over the two runs', () => {
    const run = (met: boolean[], firstTryAll = true) => {
      const probes = { a: probe(met), b: probe([true], { firstTry: firstTryAll }) }
      return { probes, result: scoreRepeat({ probes, calls: calls(2), suite: mini }) }
    }
    const r = miniResult({ repeats: [run([true, true]), run([true, false])], suite: mini })
    expect(r.quality).toEqual({ value: 83.4, min: 66.7, max: 100 })
    expect(r.completion.value).toBe(100)
    expect(r.score).toEqual({ value: 83.4, min: 66.7, max: 100 })
    expect(r.calls).toBe(4)
  })

  it('pools the success rate over every call of both runs', () => {
    const a = {
      probes: { a: probe([true]) },
      result: { quality: { score: 100 }, score: 100, completion: 100, perCallRate: 100, speed: {} },
    }
    const b = {
      probes: { a: probe([], { ok: false, firstTry: false }) },
      result: { quality: { score: 100 }, score: 0, completion: 0, perCallRate: 0, speed: {} },
    }
    const r = miniResult({ repeats: [a, b], suite: mini })
    expect(r.perCallRate.value).toBe(50)
    expect(r.completion.value).toBeCloseTo(0.5 ** 14 * 100, 1)
  })

  it('calls overlapping ranges a tie', () => {
    const a = rangeOf([70, 80])!
    expect(compareRanges(a, rangeOf([78, 90])!)).toBe('tie')
    expect(compareRanges(a, rangeOf([81, 90])!)).toBe('b')
    expect(compareRanges(rangeOf([85, 95])!, a)).toBe('a')
  })
})

describe('speed and draft time', () => {
  const budget = mini.scenarioBudget

  it('separates prompt and generation rates from the calls own timings', () => {
    // 600 prompt tokens/s and 40 output tokens/s.
    const mk = (i: number, o: number) => ({
      ok: true,
      inputTokens: i,
      outputTokens: o,
      seconds: i / 600 + o / 40,
    })
    const speeds = fitSpeeds([mk(5000, 700), mk(29000, 1500), mk(11500, 1300), mk(11700, 900)])!
    expect(speeds.method).toBe('fit')
    expect(speeds.promptTokensPerSecond).toBeCloseTo(600, 0)
    expect(speeds.outputTokensPerSecond).toBeCloseTo(40, 0)
    const minutes = draftMinutes(speeds, budget)!
    expect(minutes).toBeCloseTo((budget.inputTokens / 600 + budget.outputTokens / 40) / 60, 0)
  })

  it('falls back to one pooled rate when the fit is not usable', () => {
    const speeds = fitSpeeds([
      { ok: true, inputTokens: 1000, outputTokens: 100, seconds: 11 },
      { ok: true, inputTokens: 2000, outputTokens: 200, seconds: 22 },
    ])!
    expect(speeds.method).toBe('pooled')
    expect(speeds.outputTokensPerSecond).toBe(speeds.promptTokensPerSecond)
    expect(fitSpeeds([{ ok: false, seconds: 3 }])).toBeUndefined()
  })

  // A recorded run (gemma-4-26b-a4b, MLX, second repeat of 2026-11-03): the five calls' own
  // seconds and token counts. The pooled fallback used to print (input + output) / seconds,
  // 577, as both the output and the prompt rate; the answers were written at about 47 tokens/s.
  const recorded = [
    { key: 'format', seconds: 8, inputTokens: 5031, outputTokens: 426 },
    { key: 'longContext', seconds: 46.1, inputTokens: 30634, outputTokens: 3419 },
    { key: 'longOutput', seconds: 20.1, inputTokens: 11558, outputTokens: 1376 },
    { key: 'review', seconds: 42.1, inputTokens: 11743, outputTokens: 608 },
    { key: 'heldOutReview', seconds: 16, inputTokens: 11180, outputTokens: 396 },
  ].map((c) => ({ ...c, ok: true }))

  it('reports output and prompt rates as separate measured bounds (#610)', () => {
    const speed = speedOf({ calls: recorded, budget })
    expect(speed.method).toBe('pooled')
    expect(speed.outputTokensPerSecond).toBe(47.1)
    expect(speed.promptTokensPerSecond).toBe(698.8)
    expect(speed.outputTokensPerSecond).not.toBe(speed.promptTokensPerSecond)
    expect(speed.outputTokensPerSecond).toBeLessThan(speed.promptTokensPerSecond)
  })

  it('keeps the draft time on the pooled estimate while the rates are bounds', () => {
    const speed = speedOf({ calls: recorded, budget })
    expect(speed.draftMinutes).toBe(draftMinutes(fitSpeeds(recorded)!, budget))
  })

  it('re-scores a saved run offline: new rates and draft time, same quality and completion', () => {
    const probes = Object.fromEntries(
      recorded.map((c) => [
        c.key,
        { ok: true, seconds: c.seconds, inputTokens: c.inputTokens, outputTokens: c.outputTokens },
      ]),
    )
    const saved = {
      suite: 'mini',
      suiteVersion: 2,
      repeats: [{ seed: 11, probes, failures: [], speed: { outputTokensPerSecond: 577 } }],
      result: {
        quality: { value: 80, min: 80, max: 80 },
        completion: { value: 100, min: 100, max: 100 },
        damage: { value: 2, min: 2, max: 2 },
        outputTokensPerSecond: { value: 577, min: 577, max: 577 },
        promptTokensPerSecond: { value: 577, min: 577, max: 577 },
      },
    }
    const run = rescoreRun(saved)
    expect(run.suiteVersion).toBe(1)
    expect(run.result.outputTokensPerSecond.value).toBe(47.1)
    expect(run.result.promptTokensPerSecond.value).toBe(698.8)
    expect(run.result.quality).toEqual(saved.result.quality)
    expect(run.verdict.level).toBe('recommended')
  })

  it('counts only calls that wrote an answer for the output rate, and skips failed calls', () => {
    const calls = [
      { ok: true, seconds: 10, inputTokens: 1000, outputTokens: 100 },
      { ok: true, seconds: 5, inputTokens: 2000 },
      { ok: false, seconds: 99, inputTokens: 9999, outputTokens: 9999 },
    ]
    expect(rateBounds(calls)).toEqual({ outputTokensPerSecond: 10, promptTokensPerSecond: 400 })
    expect(rateBounds([{ ok: false, seconds: 3 }])).toEqual({})
  })
})

describe('bands', () => {
  it('applies the stated requirements', () => {
    expect(bandOf({ completion: 95, quality: 85, damage: 3 }, bands)).toBe('recommended')
    expect(bandOf({ completion: 95, quality: 85, damage: 12 }, bands)).toBe('usable')
    expect(bandOf({ completion: 80, quality: 70, damage: 0 }, bands)).toBe('usable')
    expect(bandOf({ completion: 74, quality: 95, damage: 0 }, bands)).toBe('not_recommended')
    expect(bandOf({ completion: 95, quality: 59, damage: 0 }, bands)).toBe('not_recommended')
  })

  const range = (value: number, min = value, max = value) => ({ value, min, max })
  const result = (over: Record<string, unknown> = {}) => ({
    score: range(80),
    quality: range(85),
    completion: range(95),
    perCallRate: range(99),
    damage: range(2),
    draftMinutes: range(40),
    calls: 8,
    failedCalls: 0,
    repairedCalls: 0,
    repairRate: range(0),
    ...over,
  })

  it('says why a model falls short, and never fails a model for a slow draft', () => {
    const v = verdictOf({
      result: result({ completion: range(15), draftMinutes: range(900) }),
      bands,
    })
    expect(v.level).toBe('not_recommended')
    expect(v.reasons.join(' ')).toMatch(/Completion 15\.0%/)
    expect(v.reasons.join(' ')).not.toMatch(/draft time|slow/i)
    expect(verdictOf({ result: result({ draftMinutes: range(900) }), bands }).level).toBe(
      'recommended',
    )
  })

  it('names the damage advice for a usable model and notes the stalled calls with their tail', () => {
    const v = verdictOf({
      result: result({ damage: range(23) }),
      repeats: [
        {
          failures: [
            {
              probe: 'longContext',
              failure: { kind: 'loop', detail: 'repeating', tail: 'abc abc' },
            },
            { probe: 'format', failure: { kind: 'format', detail: 'bad' } },
          ],
        },
      ],
      bands,
    })
    expect(v.level).toBe('usable')
    expect(v.reasons.join(' ')).toMatch(/Review damage 23\.0%.*turn the review step off/)
    expect(v.notes[0]).toMatch(/longContext: loop.*abc abc/)
    expect(v.notes[1]).toMatch(/format: format: bad/)
  })

  describe('band reasons never round across the threshold (#611)', () => {
    const reasonFor = (over: Record<string, unknown>) =>
      verdictOf({ result: result(over), bands }).reasons.join(' ')

    it('prints one decimal: quality 79.6 is "79.6, under 80", not "80, under 80"', () => {
      expect(reasonFor({ quality: range(79.6) })).toContain('Quality 79.6, under 80')
    })

    it('cuts toward the miss at the edges: 79.96 reads 79.9, 59.99 reads 59.9', () => {
      expect(reasonFor({ quality: range(79.96) })).toContain('Quality 79.9, under 80')
      expect(reasonFor({ quality: range(59.99), completion: range(95) })).toContain(
        'Quality 59.9, under 60',
      )
    })

    it('has no reason at the threshold itself, and one for the smallest miss', () => {
      expect(verdictOf({ result: result({ quality: range(80) }), bands }).level).toBe('recommended')
      expect(reasonFor({ quality: range(79.9) })).toContain('Quality 79.9, under 80')
    })

    it('does the same for completion below its threshold', () => {
      expect(reasonFor({ completion: range(89.96) })).toContain('Completion 89.9%')
      expect(reasonFor({ completion: range(89.96) })).toContain('is under 90%')
    })

    it('rounds review damage up when it is over its limit: 5.04 reads 5.1, never "5, over 5"', () => {
      const v = (damage: number) => reasonFor({ damage: range(damage) })
      expect(v(5.04)).toContain('Review damage 5.1%, over 5%')
      expect(v(5.1)).toContain('Review damage 5.1%, over 5%')
      expect(v(5)).not.toContain('Review damage')
    })

    it('formats exact values and survives float noise', () => {
      expect(shortOf(80)).toBe('80.0')
      expect(shortOf(79.6)).toBe('79.6')
      expect(shortOf(0.1 * 3 * 100)).toBe('30.0')
      expect(overBy(5)).toBe('5.0')
      expect(overBy(23)).toBe('23.0')
    })
  })

  it('marks a verdict whose ranges reach another band', () => {
    const v = verdictOf({
      result: result({ quality: range(82, 76, 88) }),
      bands,
    })
    expect(v.level).toBe('recommended')
    expect(v.uncertain).toEqual(['usable'])
  })

  describe('an uncertain band when the two-run range spans bands (#613)', () => {
    it('lists every band the range reaches, best first, the reported one included', () => {
      const v = verdictOf({
        result: result({ quality: range(70, 54.5, 90) }),
        bands,
      })
      expect(v.level).toBe('usable')
      expect(v.uncertain).toEqual(expect.arrayContaining(['not_recommended', 'recommended']))
      expect(v.reaches).toEqual(['recommended', 'usable', 'not_recommended'])
    })

    it('marks nothing uncertain when the range stays inside one band', () => {
      const v = verdictOf({ result: result({ quality: range(88, 84, 92) }), bands })
      expect(v.uncertain).toBeUndefined()
      expect(v.reaches).toBeUndefined()
    })

    it('says so in the summary beside the band label and lists the bands', () => {
      const r = result({ quality: range(70, 54.5, 90) })
      const md = summaryMarkdown({
        model: { ref: 'lmstudio:x' },
        suiteVersion: 1,
        result: r,
        verdict: verdictOf({ result: r, bands }),
      })
      expect(md).toContain('**Usable with editing (uncertain).**')
      expect(md).toContain(
        'reaches Recommended, Usable with editing, Not recommended. Two runs do not settle which applies',
      )
    })

    it('does not add an uncertain label to a settled result', () => {
      const r = result()
      const md = summaryMarkdown({
        model: { ref: 'lmstudio:x' },
        suiteVersion: 1,
        result: r,
        verdict: verdictOf({ result: r, bands }),
      })
      expect(md).toContain('**Recommended.**')
      expect(md).not.toContain('uncertain')
    })
  })

  it('prints the summary with the band label, the ranges and draft time as reported only', () => {
    const r = result({ quality: range(82, 76, 88) })
    const md = summaryMarkdown({
      model: { ref: 'lmstudio:x' },
      suiteVersion: 1,
      result: r,
      verdict: verdictOf({ result: r, bands }),
    })
    expect(md).toContain(LEVEL_LABEL.recommended)
    expect(md).toContain('82 (76 to 88)')
    expect(md).toMatch(/Draft time 40 \(?.*min.*Reported, never scored/)
  })
})

describe('calls with no time cap', () => {
  /** A job that runs for `ms`, then ends with `status`; every poll is recorded. */
  const scripted = (ms: number, status: string, error?: string) => {
    const calls: string[] = []
    const started = Date.now()
    return {
      calls,
      invoke: async (channel: string, payload: any) => {
        calls.push(channel)
        if (channel === 'generate:rerun-stage') return { jobId: 'j' }
        if (channel === 'jobs:get')
          return Date.now() - started < ms
            ? { id: 'j', status: 'running', message: '' }
            : { id: 'j', status, message: '', error }
        if (channel === 'scenarios:get')
          return {
            provenance: [
              {
                stage: payload.stage ?? 'scenario_overview',
                status: 'ok',
                startedAt: '2026-11-03T10:00:00.000Z',
                finishedAt: '2026-11-03T10:03:00.000Z',
                inputTokens: 100,
                outputTokens: 50,
              },
            ],
            warnings: [],
            msel: [],
          }
        throw new Error(`unexpected ${channel}`)
      },
    }
  }
  const input = { projectPath: 'p', scenarioId: 's', stage: 'scenario_overview' }

  it('waits for a slow call and never cancels it', async () => {
    const s = scripted(200, 'done')
    const { obs } = await rerunCall({ invoke: s.invoke, log: () => {}, pollMs: 20 }, input)
    expect(obs.ok).toBe(true)
    expect(obs.seconds).toBeGreaterThanOrEqual(0.2)
    expect(s.calls).not.toContain('jobs:cancel')
  })

  it('records a stalled reply as a failed call with the raw tail', async () => {
    const s = scripted(
      0,
      'error',
      'Reply stalled: no new output for 60 s after the reply started. Last output: "{\\"rows\\":[{\\"id\\":"',
    )
    const { obs } = await rerunCall({ invoke: s.invoke, log: () => {}, pollMs: 10 }, input)
    expect(obs.ok).toBe(false)
    const probe = scoreFormat(obs)
    expect(probe.failure).toMatchObject({ kind: 'stall' })
    expect(probe.failure?.tail).toContain('rows')
  })

  it('runs every probe in two repeats, setting each repeat seed first', async () => {
    const seen: [number, number][] = []
    const invoke = async (channel: string): Promise<any> => {
      if (channel === 'examples:open') return { path: mkdtempSync(join(tmpdir(), 'mini-')) }
      throw new Error('stop here')
    }
    const ctx = {
      invoke,
      log: () => {},
      suite: mini,
      gold,
      workDir: mkdtempSync(join(tmpdir(), 'mini-work-')),
      projects: {},
      beforeRepeat: async (r: number, seed: number) => void seen.push([r, seed]),
    }
    await expect(runProbes(ctx)).rejects.toThrow()
    expect(seen).toEqual([[0, 11]])
  })
})

describe('replaying saved runs', () => {
  const water = loadExample('city-water')
  const id = scenarioIdFor(water, 'chem')

  /** A work folder holding the shipped city-water scenario as the format and handbook probes left it. */
  function workFolder(provenance: (stage: string) => any) {
    const work = mkdtempSync(join(tmpdir(), 'mini-replay-'))
    for (const tag of ['format', 'long-output']) {
      const dir = join(work, tag, 'Water.asproj', 'scenarios', id)
      mkdirSync(join(dir, 'documents'), { recursive: true })
      const sc = shippedScenario(water, 'chem') as any
      const stage = tag === 'format' ? 'scenario_overview' : 'controller_handbook'
      sc.provenance = [provenance(stage)]
      writeFileSync(join(dir, 'scenario.json'), JSON.stringify(sc))
      cpSync(
        join(ROOT, 'examples/city-water/project/scenarios', id, 'documents/handbook.md'),
        join(dir, 'documents/handbook.md'),
      )
    }
    return work
  }
  const run = (extra: Record<string, unknown> = {}) => ({
    model: { ref: 'lmstudio:test' },
    score: 53.6,
    verdict: { level: 'wont_work', reasons: ['x'] },
    probes: {
      format: { ok: true },
      longContext: {
        ok: false,
        reason: 'The long-prompt call did not finish within the per-call time cap',
      },
      longOutput: { ok: true },
      review: { ok: true },
      ...extra,
    },
  })
  const okRun = (stage: string) => ({
    stage,
    status: 'ok',
    startedAt: '2026-11-03T10:00:00.000Z',
    finishedAt: '2026-11-03T10:01:40.000Z',
    inputTokens: 5000,
    outputTokens: 700,
    repairAttempts: 0,
  })

  it('scores the saved calls again and names what it cannot recompute', () => {
    const r = replayMiniRun(run(), workFolder(okRun), mini, gold, undefined)
    expect(Object.keys(r.probes).sort()).toEqual(['format', 'longOutput'])
    expect(r.unknown.map((u: any) => u.probe).sort()).toEqual(['longContext', 'review'])
    expect(r.unknown.find((u: any) => u.probe === 'longContext').why).toMatch(/180 s per-call cap/)
    expect(r.result.perCallRate.value).toBe(100)
    expect(r.verdict.level).toBeDefined()
    expect(r.before).toMatchObject({ score: 53.6, level: 'wont_work' })
  })

  it('counts a saved repair round as a repair, not a failure, and a saved failure as a failed call', () => {
    const repaired = replayMiniRun(
      run(),
      workFolder((stage) => ({ ...okRun(stage), repairAttempts: 1 })),
      mini,
      gold,
      undefined,
    )
    expect(repaired.result.perCallRate.value).toBe(100)
    expect(repaired.result.repairRate.value).toBe(100)
    const failed = replayMiniRun(
      run(),
      workFolder((stage) => ({
        ...okRun(stage),
        status: 'error',
        error: 'Output did not match the schema',
      })),
      mini,
      gold,
      undefined,
    )
    expect(failed.probes.format.failure.kind).toBe('format')
    expect(failed.result.completion.value).toBe(0)
  })

  it('prints a table that marks partial rows', () => {
    const r = replayMiniRun(run(), workFolder(okRun), mini, gold, undefined)
    const md = tableMarkdown([r])
    expect(md).toContain('lmstudio:test')
    expect(md).toContain('(partial)')
    expect(md).toContain("Won't work 53.6")
  })
})

describe('the runner', () => {
  it('reads a list of models and the switches', () => {
    const a = parseMiniArgs(['--', '--models', 'lmstudio:a, lmstudio:b', '--held-out'])
    expect(a).toMatchObject({ models: ['lmstudio:a', 'lmstudio:b'], heldOut: true, load: true })
    expect(parseMiniArgs(['--models', 'ollama:a', '--no-load']).load).toBe(false)
    expect(() => parseMiniArgs([])).toThrow(/--models/)
    expect(() => parseMiniArgs(['--models', 'a', '--suite', 'quick'])).toThrow(/only/)
  })

  it('has no per-call cap switch', () => {
    expect(() => parseMiniArgs(['--models', 'a', '--cap', '120'])).toThrow(/Unknown argument/)
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

  it('is the first published version of the suite, and old stamps are rewritten to it (#609)', () => {
    expect(mini.suiteVersion).toBe(1)
    const saved = { suite: 'mini', suiteVersion: 2, taskSetHash: 'old', result: { score: 70 } }
    const stamped = restampRun(saved)
    expect(stamped).toMatchObject({ suite: 'mini', suiteVersion: 1, result: { score: 70 } })
    expect(stamped.taskSetHash).toBe(taskSetHash('mini'))
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

describe('partial credit for continuous criteria (#612)', () => {
  const q = mini.quality

  it('maps linearly between a zero point and a full-credit point, in either direction', () => {
    expect(ramp(0, 0, 15)).toBe(0)
    expect(ramp(10, 0, 15)).toBeCloseTo(2 / 3)
    expect(ramp(15, 0, 15)).toBe(1)
    expect(ramp(40, 0, 15)).toBe(1)
    expect(ramp(12.5, 20, 5)).toBeCloseTo(0.5)
    expect(ramp(2, 20, 5)).toBe(1)
    expect(ramp(30, 20, 5)).toBe(0)
    expect(ramp(NaN, 0, 1)).toBe(0)
  })

  it('earns pace credit inside the band, falling to zero at half the low edge and twice the high', () => {
    const at = (rowsPerHour: number) => longContextCredits({ rows: 18, rowsPerHour }, q, gold).pace
    const lo = gold.rowsPerHour.min * q.paceBand[0]
    const hi = gold.rowsPerHour.max * q.paceBand[1]
    expect(at(lo)).toBe(1)
    expect(at(hi)).toBe(1)
    expect(at(lo / 2)).toBe(0)
    expect(at(hi * 2)).toBe(0)
    expect(at(lo * 0.75)).toBeCloseTo(0.5)
    expect(at(hi * 1.5)).toBeCloseTo(0.5)
  })

  it('credits lint, citations and tag mix by how far they got', () => {
    const c = longContextCredits(
      {
        rows: 10,
        tagGroups: { present: 4, total: 5 },
        lintPenaltyPer10Rows: 7.5,
        resolved: 70,
        covered: 40,
        supported: 35,
      },
      q,
      gold,
    )
    expect(c.rows).toBeCloseTo(10 / 15)
    expect(c.tagMix).toBeCloseTo(0.8)
    expect(c.lintLow).toBeCloseTo(12.5 / 15)
    expect(c.resolved).toBeCloseTo(0.5)
    expect(c.covered).toBeCloseTo(0.5)
    expect(c.supported).toBeCloseTo(0.5)
  })

  it('keeps yes/no items binary and marks only a full credit as met', () => {
    const last = chemical.phases.at(-1)
    const r = scoreLongContext({
      obs: okCall,
      scenario: chemical,
      phaseId: last.id,
      suite: mini,
      gold,
    })
    for (const id of ['opensEnds', 'roles', 'briefIds', 'noLeak', 'noLintErrors'])
      expect([0, 1]).toContain(r.criteria.find((c: any) => c.id === id)?.credit)
    const rows = r.criteria.find((c: any) => c.id === 'rows') as any
    expect(rows.met).toBe(false)
    expect(rows.credit).toBeGreaterThan(0)
    expect(rows.credit).toBeLessThan(1)
    expect(r.metrics).toHaveProperty('rowsPerHour')
    expect(r.metrics.tagGroupsTotal).toBe(5)
  })

  it('grades the handbook by sections, words and repetition', () => {
    const [sections, length, repeat] = handbookCriteria(
      { sections: 4, words: 500, repetition: 0.375 },
      q,
    )
    expect(sections?.credit).toBeCloseTo(0.8)
    expect(length?.credit).toBeCloseTo(0.5)
    expect(repeat?.credit).toBeCloseTo(0.5)
    const full = handbookCriteria({ sections: 5, words: 1000, repetition: 0.25 }, q)
    expect(full.every((c: any) => c.met)).toBe(true)
  })

  it('adds credit, not only whole criteria, to the share of quality', () => {
    const probe = (credits: number[]) => ({
      ok: true,
      firstTry: true,
      score: 0,
      metrics: {},
      criteria: credits.map((credit, i) => ({ id: `c${i}`, label: 'x', met: credit >= 1, credit })),
    })
    expect(qualityOf({ a: probe([1, 0.5, 0, 0.5]) })).toEqual({ score: 50, met: 2, total: 4 })
    expect(creditOf({ id: 'a', label: 'x', met: true })).toBe(1)
    expect(creditOf({ id: 'a', label: 'x', met: false })).toBe(0)
  })

  it('re-grades a saved probe from its saved measures and leaves yes/no results alone', () => {
    const saved = {
      ok: true,
      firstTry: true,
      score: 54.5,
      criteria: [
        { id: 'rows', label: 'x', met: false },
        { id: 'pace', label: 'x', met: false },
        { id: 'opensEnds', label: 'x', met: true },
        { id: 'covered', label: 'x', met: false },
        { id: 'lintLow', label: 'x', met: false },
      ],
      metrics: { rows: 10, lintPenaltyPer10Rows: 7.5, citationsCovered: 75 },
    }
    const credit = (p: any, id: string) => p.criteria.find((c: any) => c.id === id)?.credit
    const noShape = regradeProbe('longContext', saved, { suite: mini, gold })
    expect(credit(noShape, 'pace')).toBe(0)
    const withShape = regradeProbe('longContext', saved, {
      suite: mini,
      gold,
      measured: { rowsPerHour: 3.3 },
    })
    expect(credit(withShape, 'pace')).toBeCloseTo(0.65)
    expect(credit(withShape, 'opensEnds')).toBe(1)
    expect(credit(withShape, 'covered')).toBeCloseTo(0.9375)
    expect(withShape.score).toBeGreaterThan(saved.score)
  })

  it('re-scores saved runs offline with the new scoring version and the same completion', () => {
    const repeat = (covered: number) => ({
      seed: 11,
      completion: 100,
      probes: {
        longContext: {
          ok: true,
          firstTry: true,
          score: 0,
          criteria: [{ id: 'covered', label: 'x', met: false }],
          metrics: { citationsCovered: covered },
        },
      },
      speed: {},
      failures: [],
    })
    const saved = {
      suite: 'mini',
      scoringVersion: 1,
      repeats: [repeat(40), repeat(80)],
      result: {
        quality: { value: 0, min: 0, max: 0 },
        completion: { value: 100, min: 100, max: 100 },
        score: { value: 0, min: 0, max: 0 },
      },
    }
    const run = rescoreRun(saved)
    expect(run.scoringVersion).toBe(MINI_SCORING_VERSION)
    expect(run.result.quality).toEqual({ value: 75, min: 50, max: 100 })
    expect(run.result.completion).toEqual(saved.result.completion)
    expect(run.result.score.value).toBe(75)
  })

  it('leaves the task-set hash alone: the zero points are scoring code, not suite thresholds', () => {
    expect(taskSetHash('mini')).toBe(
      '499a538d4d9cb2fc6560378f2a88da8d6c36f89fa61b577fe1a03392eeadcdbc',
    )
    expect(MINI_SCORING_VERSION).toBe(2)
    expect(mini.suiteVersion).toBe(1)
  })
})
