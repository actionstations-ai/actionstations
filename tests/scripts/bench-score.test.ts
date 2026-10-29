// scripts/bench/score/*: the deterministic scorers of the local model benchmark (#434).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { loadExample, loadSuite, shippedScenario, ROOT } from '../../scripts/bench/corpus.mjs'
import { citationScore } from '../../scripts/bench/score/citations.mjs'
import {
  aggregateTask,
  draftingCase,
  overallScore,
  summarizeRepeats,
} from '../../scripts/bench/score/composite.mjs'
import { critiqueScore } from '../../scripts/bench/score/critique.mjs'
import {
  cosine,
  droppedIdeaKeys,
  ideationScore,
  termVector,
} from '../../scripts/bench/score/ideation.mjs'
import { rowResults, supportScore } from '../../scripts/bench/score/grounding.mjs'
import { lintScore } from '../../scripts/bench/score/lint.mjs'
import {
  NO_JSON,
  PIPELINE_STAGES,
  reliability,
  tokensPerSecond,
} from '../../scripts/bench/score/reliability.mjs'
import { roleGaps, rubricScore, startEndOk } from '../../scripts/bench/score/rubric.mjs'
import { median, weighted } from '../../scripts/bench/score/util.mjs'
import type { Gold, ScenarioLike, WarningLike } from '../../scripts/bench/types.d.mts'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const suite = loadSuite('standard')
const gold: Gold = JSON.parse(readFileSync(join(ROOT, 'bench/gold/scenario-3.json'), 'utf8'))
/**
 * "pH on the Edge": a generated, hand-corrected example scenario with stage provenance. It
 * predates the eeg and sitman stages, so their runs are added as the pipeline records them now.
 */
function clean(): ScenarioLike {
  const s = structuredClone(shippedScenario(loadExample('city-water'), 'chem'))
  const at = '2026-01-01T00:00:00.000Z'
  for (const stage of ['eeg', 'sitman'])
    s.provenance.push({ stage, status: 'ok', startedAt: at, finishedAt: at, repairAttempts: 0 })
  return s
}

const warning = (code: string, severity: WarningLike['severity'], rowId?: string): WarningLike => ({
  code,
  severity,
  message: `${code} finding`,
  source: 'lint',
  ...(rowId ? { rowId } : {}),
})

describe('reliability', () => {
  it('lists the same pipeline stages as the engine', async () => {
    const { PIPELINE_STAGES: engine } = await import('../../src/main/generate/engine')
    expect(PIPELINE_STAGES).toEqual(engine)
  })

  it('counts every stage of a completed pipeline as a success', () => {
    const r = reliability(clean())
    expect(r.successRate).toBe(1)
    expect(r.score).toBe(100)
  })

  it('counts failed, no-JSON and never-reached stages against the pipeline', () => {
    const s = clean()
    const critique = s.provenance.find((r) => r.stage === 'critique')!
    critique.status = 'error'
    critique.error = `Stage critique failed: ${NO_JSON}`
    s.provenance = s.provenance.filter((r) => r.stage !== 'sitman')
    const r = reliability(s)
    expect(r.stagesFailed).toBe(1)
    expect(r.noJson).toBe(1)
    expect(r.successRate).toBeCloseTo((r.stagesExpected - 2) / r.stagesExpected)
  })

  it('counts the keys a CITATION_DROPPED warning names', () => {
    const s = clean()
    s.warnings = [
      {
        ...warning('CITATION_DROPPED', 'warning', 'I-01'),
        message:
          'msel_phase (I-01) cited S3, S9, which was not among the retrieved sections; dropped',
      },
    ]
    expect(reliability(s).droppedCitations).toBe(2)
  })

  it('reports output tokens per second over runs with usage and times', () => {
    const runs = [
      {
        stage: 'a',
        status: 'ok',
        startedAt: '2026-01-01T00:00:00Z',
        finishedAt: '2026-01-01T00:00:10Z',
        outputTokens: 100,
      },
      { stage: 'b', status: 'ok', startedAt: '2026-01-01T00:00:00Z' },
    ]
    expect(tokensPerSecond(runs)).toBe(10)
  })
})

describe('lint score', () => {
  it('scores a scenario without findings 100 and an empty MSEL 0', () => {
    expect(lintScore([], 40, 20).score).toBe(100)
    expect(lintScore([], 0, 20).score).toBe(0)
  })

  it('weights findings by severity per 10 rows and ignores critique notes', () => {
    const ws = [
      warning('A', 'error'),
      warning('B', 'warning'),
      warning('B', 'warning'),
      warning('C', 'info'),
      { ...warning('CRITIQUE', 'warning'), source: 'critique' as const },
    ]
    const r = lintScore(ws, 20, 20)
    // (5 + 2 + 2 + 0.5) / 20 rows × 10 = 4.75 per 10 rows; 4.75 of a 20-point cap
    expect(r.penaltyPer10Rows).toBeCloseTo(4.75)
    expect(r.score).toBeCloseTo(76.25)
    expect(r.byCode).toEqual({ A: 1, B: 2, C: 1 })
  })

  it('bottoms out at 0 past the cap', () => {
    const many = Array.from({ length: 50 }, () => warning('A', 'error'))
    expect(lintScore(many, 10, 20).score).toBe(0)
  })
})

describe('citation score', () => {
  it('scores resolution from kept and dropped keys and coverage over content rows', () => {
    const s = clean()
    const base = citationScore(s)
    expect(base.resolution).toBe(100)
    expect(base.coverage).toBeGreaterThan(70)
    s.warnings.push({
      ...warning('CITATION_DROPPED', 'warning'),
      message: `x cited ${Array.from({ length: base.kept }, (_, i) => `K${i}`).join(', ')}, which was not among the retrieved sections`,
    })
    expect(citationScore(s).resolution).toBe(50)
  })

  it('adds grounding support when the source check ran, and leaves it out otherwise', () => {
    const s = clean()
    expect(citationScore(s)).not.toHaveProperty('support')
    const items = Object.fromEntries(
      s.msel.map((r, i) => [`row:${r.id}`, { label: i % 2 ? 'grounded' : 'none' }]),
    )
    expect(citationScore(s, { items }).support).toBe(100)
  })
})

describe('grounding support', () => {
  it('is the share of claim-bearing items labelled grounded, unsupported ones counted against', () => {
    const labels = ['grounded', 'grounded', 'grounded', 'review', 'unsupported', 'none']
    const r = supportScore(labels.map((label) => ({ label })))
    expect(r).toEqual({ support: 40, claimBearing: 5, grounded: 3, review: 1, unsupported: 1 })
    expect(supportScore([{ label: 'unsupported' }, { label: 'review' }]).support).toBe(0)
    expect(supportScore([{ label: 'none' }, undefined]).support).toBe(0)
  })

  it('reads only the MSEL rows of a scenario result', () => {
    const items = { 'row:I-01': { label: 'grounded' }, 'inject:x': { label: 'unsupported' } }
    expect(rowResults({ items })).toEqual([{ label: 'grounded' }])
  })
})

describe('structure rubric', () => {
  const rubric = (s: ScenarioLike, lints: WarningLike[] = []) =>
    rubricScore(s, lints, gold, suite.weights.structure, suite.thresholds.paceBand)

  it('passes the hand-corrected example on every item but role coverage', () => {
    const r = rubric(clean())
    expect(r.items).toMatchObject({
      pace: true,
      tagMix: true,
      decisionPhase: true,
      startEnd: true,
      briefIds: true,
      noReferenceLeak: true,
    })
    expect(r.score).toBeGreaterThan(85)
  })

  it('fails the lint-based items on BRIEF_IDS_MISSING and REFERENCE_LEAK', () => {
    const r = rubric(clean(), [
      warning('BRIEF_IDS_MISSING', 'warning'),
      warning('REFERENCE_LEAK', 'error'),
    ])
    expect(r.items.briefIds).toBe(false)
    expect(r.items.noReferenceLeak).toBe(false)
  })

  it('fails tag mix, the decision phase and start/end when those rows are missing', () => {
    const s = clean()
    s.msel = s.msel.filter((r) => !['DECISION_POINT', 'CLUE', 'STARTEX'].includes(r.purposeTag))
    const r = rubric(s)
    expect(r.items.tagMix).toBe(false)
    expect(r.missingTagGroups).toEqual(expect.arrayContaining(['CLUE', 'DECISION_POINT']))
    expect(r.items.decisionPhase).toBe(false)
    expect(startEndOk(s.msel)).toBe(false)
  })

  it('passes nothing for an empty MSEL', () => {
    const s = clean()
    s.msel = []
    expect(rubric(s).score).toBe(0)
  })

  it('finds a role that receives no inject in a phase', () => {
    const s = clean()
    s.msel = s.msel.filter((r) => !r.toRoleIds.includes('regulator'))
    expect(roleGaps(s).some((g) => g.endsWith(':regulator'))).toBe(true)
  })
})

describe('drafting case', () => {
  it('scores the clean example high and the same scenario with planted lint failures lower', () => {
    const good = draftingCase({ scenario: clean(), lints: [], gold, suite })
    const lints = [
      ...Array.from({ length: 6 }, () => warning('MIX', 'error')),
      warning('REFERENCE_LEAK', 'error'),
    ]
    const bad = draftingCase({ scenario: clean(), lints, gold, suite })
    expect(good.score).toBeGreaterThan(85)
    // 7 errors × 5 = 35 points over 43 rows → 8.1 per 10 rows of a 20 cap: lint 59.3;
    // REFERENCE_LEAK fails a structure item of weight 2 out of 10.
    expect(bad.parts.lint).toBeCloseTo(100 * (1 - ((35 / 43) * 10) / 20), 1)
    expect(good.parts.structure! - bad.parts.structure!).toBeCloseTo(20, 5)
    expect(bad.score).toBeLessThan(good.score - 10)
  })

  it('scores rows the source check finds unsupported lower', () => {
    const s = clean()
    const label = (l: string) =>
      Object.fromEntries(s.msel.map((r) => [`row:${r.id}`, { label: l }]))
    const grounded = draftingCase({
      scenario: s,
      lints: [],
      gold,
      suite,
      grounding: { items: label('grounded') },
    })
    const unsupported = draftingCase({
      scenario: s,
      lints: [],
      gold,
      suite,
      grounding: { items: label('unsupported') },
    })
    expect(grounded.parts['citations.support']).toBe(100)
    expect(unsupported.parts['citations.support']).toBe(0)
    // support weighs 0.4 of citations, citations 0.2 of drafting: 8 points
    expect(grounded.score - unsupported.score).toBeCloseTo(8, 5)
  })
})

describe('ideation', () => {
  const idea = (title: string, hook: string, threatFamily?: string) => ({
    title,
    hook,
    ...(threatFamily ? { threatFamily } : {}),
    sectionsExercised: [{ headingPath: 'ERP › 7' }],
  })

  it('treats the same words as identical and unrelated text as distinct', () => {
    expect(
      cosine(termVector('pump station flood'), termVector('flood at the pump station')),
    ).toBeCloseTo(1)
    expect(cosine(termVector('ransomware billing'), termVector('tornado siren'))).toBe(0)
  })

  it('scores valid, distinct, resolved and spread ideas', () => {
    const ideas = [
      idea('Caustic overfeed', 'A vendor session raises the caustic dose', 'cyber_physical'),
      idea('Caustic overfeed again', 'A vendor session raises the caustic dose', 'cyber_physical'),
      idea(
        'Main break',
        'A transmission main breaks during a telemetry outage',
        'infrastructure_failure',
      ),
    ]
    const r = ideationScore(ideas, { count: 6, dropped: 1, threshold: 0.85 })
    expect(r.valid).toBe(50)
    expect(r.nearDuplicates).toBe(2)
    expect(r.distinct).toBeCloseTo(100 / 3)
    expect(r.resolution).toBe(75)
    expect(r.spread).toBeCloseTo(200 / 3)
    expect(r).not.toHaveProperty('grounding')
  })

  it('scores whyItTeaches grounding of the valid ideas from grounding:ideas', () => {
    const ideas = [
      { id: 'a', ...idea('Caustic overfeed', 'Vendor session') },
      { id: 'b', ...idea('Main break', 'Telemetry outage') },
    ]
    const grounding = {
      a: { label: 'grounded' },
      b: { label: 'review' },
      gone: { label: 'grounded' },
    }
    expect(
      ideationScore(ideas, { count: 6, dropped: 0, threshold: 0.85, grounding }).grounding,
    ).toBe(50)
  })

  it('reads dropped keys from the ideate job log', () => {
    const log = [
      { message: 'Idea "01ABC" cited unknown keys S4, S7; dropped' },
      { message: 'ideate: 6 ideas, 1200 in / 900 out tokens' },
    ]
    expect(droppedIdeaKeys(log)).toBe(2)
  })
})

describe('critique', () => {
  const planted = [
    {
      id: 'order',
      kind: 'time_order',
      words: ['order'],
      rows: ['I-01', 'I-02', 'I-03'],
      anyRow: false,
    },
    {
      id: 'dup',
      kind: 'duplicate_row',
      words: ['duplicate'],
      rows: ['I-05', 'I-05x'],
      anyRow: false,
    },
  ]
  const note = (rowId: string, message: string) => ({
    code: 'CRITIQUE',
    rowId,
    message,
    source: 'critique' as const,
  })

  it('scores recall of matched defects and penalizes notes on unflagged rows', () => {
    const r = critiqueScore({
      notes: [
        note('I-03', 'Out of order with I-02'),
        note('I-09', 'Weak inject'),
        note('I-07', 'Lint row'),
      ],
      planted,
      lints: [{ code: 'X', rowId: 'I-07' }],
      rowCount: 20,
      noisePenalty: 20,
    })
    expect(r.recall).toBe(50)
    expect(r.found).toEqual(['order'])
    expect(r.missed).toEqual(['dup'])
    expect(r.noisePer10Rows).toBe(0.5)
    expect(r.noise).toBe(90)
  })
})

describe('composite', () => {
  it('weights the overall score from the suite and ignores tasks without weight', () => {
    expect(weighted({ a: 100, b: 0, c: 50 }, { a: 1, b: 1 })).toBe(50)
    const tasks = [
      { task: 'drafting', score: 80 },
      { task: 'critique', score: 40 },
      { task: 'ideation', score: 60 },
    ]
    expect(overallScore(tasks, suite.weights.overall)).toBe(65)
  })

  it('averages a task over its cases', () => {
    const t = aggregateTask('critique', [
      { caseId: 'a', score: 40, parts: { recall: 40 }, details: {} },
      { caseId: 'b', score: 60, parts: { recall: 60 }, details: {} },
    ])
    expect(t.score).toBe(50)
    expect(t.parts.recall).toBe(50)
  })

  it('reports the median and range over repeats and flags a range wider than 15 points', () => {
    const rep = (overall: number) => ({ overall, tasks: [{ task: 'drafting', score: overall }] })
    const stable = summarizeRepeats([rep(60), rep(70), rep(64)], [1, 0.9, 1], 15)
    expect(stable.median.overall).toBe(64)
    expect(stable.range.overall).toEqual([60, 70])
    expect(stable.unstable).toBe(false)
    expect(stable.median.draftingReliability).toBe(1)
    expect(summarizeRepeats([rep(50), rep(70)], [1, 1], 15).unstable).toBe(true)
    expect(median([3, 1, 2, 4])).toBe(2.5)
  })
})
