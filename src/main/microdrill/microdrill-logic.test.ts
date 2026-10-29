// Micro-drills (#437): the pure parts. Annex selection, the build checks, hint fading, scoring,
// the checklist and the model-answer normalizer, and the assessment probes against the mock
// provider's word-based judge.
import { describe, expect, it } from 'vitest'
import type { MicroDrill } from '@shared/schemas'
import { MICRO_DRILL_LIMITS, type Chunk, type MicroDrillRunStep } from '@shared/schemas'
import { mockMicroDrillAssess } from '../providers/mock/micro-drill'
import { MOCK_FIXTURES } from '../providers/mock/fixtures'
import { checklistAssessment, normalizeAssessment, PROBES } from './assess'
import { draftFromOutput } from './build'
import { listAnnexes, readAnnex, type ChunkSource } from './annex'
import { decideHints, hintOffer, nextLevel, updateHistory, type AnnexHistory } from './hints'
import { lintDrill } from './lint'
import { coverageOf, runCoverage, stepScore } from './score'

const SENTENCE = 'The PIO may release information after consulting the Incident Commander.'

const chunk = (id: number, headingPath: string, text: string, tokenCount = 50): Chunk => ({
  id,
  documentId: 'doc',
  headingPath,
  ord: id,
  text,
  tokenCount,
  page: id,
})
const source = (chunks: Chunk[]): ChunkSource => ({ chunks: () => chunks })

const CHUNKS = [
  chunk(1, 'EOP › 6 Public Information', 'Overview of public information.'),
  chunk(2, 'EOP › 6 Public Information › 6.4 Releases', SENTENCE),
  chunk(3, 'EOP › 6 Public Information › 6.5 Rumors', 'Rumors are logged by the PIO.'),
  chunk(4, 'EOP › 7 Recovery', 'Recovery begins when the Incident Commander says so.'),
]

describe('annex', () => {
  it('lists each heading with the tokens of everything under it', () => {
    const options = listAnnexes(source(CHUNKS), 'doc')
    const section6 = options.find((o) => o.headingPath === 'EOP › 6 Public Information')!
    expect(section6.tokens).toBe(150)
    expect(section6.page).toBe(1)
    expect(options.find((o) => o.headingPath.endsWith('6.4 Releases'))!.tokens).toBe(50)
    expect(options.some((o) => o.headingPath === 'EOP')).toBe(false)
  })

  it('reads a heading and its subsections in reading order', () => {
    const annex = readAnnex(source([...CHUNKS].reverse()), 'doc', 'EOP › 6 Public Information')
    expect(annex.chunks.map((c) => c.id)).toEqual([1, 2, 3])
  })

  it('refuses a section over the size limit and asks for a narrower one', () => {
    const big = [chunk(1, 'EOP › Big', 'text', MICRO_DRILL_LIMITS.annexTokens + 1)]
    expect(() => readAnnex(source(big), 'doc', 'EOP › Big')).toThrow(/narrower section/)
  })

  it('refuses a heading that is not in the index', () => {
    expect(() => readAnnex(source(CHUNKS), 'doc', 'EOP › 9 Nothing')).toThrow(/not in the index/)
  })
})

function drillFromFixture(): { drill: MicroDrill; annexChunks: Chunk[] } {
  const annexChunks = [chunk(1, 'EOP › 6.4 Public Information', `Intro.\n\n${SENTENCE}`)]
  const annex = { headingPath: 'EOP › 6.4 Public Information', chunks: annexChunks, tokens: 50 }
  const drill = draftFromOutput(
    MOCK_FIXTURES.MicroDrillBuildOutput as never,
    annex,
    {
      documentId: 'doc',
      headingPath: annex.headingPath,
      settings: { audience: 'new_staff', durationMin: 15, mode: 'solo', stepCount: 3, focus: '' },
    },
    'Emergency Operations Plan',
  )
  return { drill, annexChunks }
}

describe('build mapping and checks', () => {
  it('maps passage keys to chunks and passes the checks for the mock drill', () => {
    const { drill } = drillFromFixture()
    expect(drill.lint).toEqual([])
    expect(drill.steps).toHaveLength(3)
    expect(drill.steps[0]!.expectedPoints[0]!.citation.chunkId).toBe(1)
    expect(drill.steps[0]!.hints.map((h) => h.level)).toEqual([1, 2, 3])
  })

  it('flags a citation outside the annex', () => {
    const { drill, annexChunks } = drillFromFixture()
    const bad = structuredClone(drill)
    bad.steps[0]!.expectedPoints[0]!.citation.chunkId = 99
    const issues = lintDrill(bad, annexChunks)
    expect(issues.map((i) => i.code)).toContain('citation_outside_annex')
  })

  it('flags a Level 3 quote that is not in the cited chunk', () => {
    const { drill, annexChunks } = drillFromFixture()
    const bad = structuredClone(drill)
    const hint = bad.steps[1]!.hints[2]
    bad.steps[1]!.hints[2] = { ...hint, quote: 'The PIO always releases everything at once.' }
    expect(lintDrill(bad, annexChunks)).toContainEqual(
      expect.objectContaining({ code: 'quote_not_verbatim', stepId: bad.steps[1]!.id }),
    )
  })

  it('accepts a quote that differs only in white space and the escaped ampersand', () => {
    const { drill, annexChunks } = drillFromFixture()
    const ok = structuredClone(drill)
    ok.steps[0]!.hints[2] = { ...ok.steps[0]!.hints[2], quote: SENTENCE.replace(/ /g, '  ') }
    expect(lintDrill(ok, annexChunks)).toEqual([])
  })

  it('flags a question that contains its own model answer', () => {
    const { drill, annexChunks } = drillFromFixture()
    const bad = structuredClone(drill)
    bad.steps[2]!.prompt = `Tell me: ${bad.steps[2]!.modelAnswer}`
    expect(lintDrill(bad, annexChunks).map((i) => i.code)).toContain('prompt_gives_answer')
  })

  it('flags more questions than the duration allows', () => {
    const { drill, annexChunks } = drillFromFixture()
    const long = { ...drill, durationMin: 10 as const, steps: [...drill.steps, ...drill.steps] }
    expect(lintDrill(long as MicroDrill, annexChunks).map((i) => i.code)).toContain('too_long')
  })

  it('flags a titled person name that the plan does not contain', () => {
    const { drill, annexChunks } = drillFromFixture()
    const bad = { ...drill, situation: 'Mr Okafor calls the desk about the boards.' }
    expect(lintDrill(bad, annexChunks).map((i) => i.code)).toContain('person_name')
  })

  it('maps an unknown passage key to a citation the checks reject', () => {
    const out = structuredClone(MOCK_FIXTURES.MicroDrillBuildOutput) as never as {
      steps: { expectedPoints: { source: string }[] }[]
    }
    out.steps[0]!.expectedPoints[0]!.source = 'P9'
    const annexChunks = [chunk(1, 'EOP › 6.4', SENTENCE)]
    const drill = draftFromOutput(
      out as never,
      { headingPath: 'EOP › 6.4', chunks: annexChunks, tokens: 10 },
      {
        documentId: 'doc',
        headingPath: 'EOP › 6.4',
        settings: { audience: 'new_staff', durationMin: 15, mode: 'solo', stepCount: 3, focus: '' },
      },
      'EOP',
    )
    expect(drill.lint.map((i) => i.code)).toContain('citation_outside_annex')
  })
})

const miss = (n = 1) =>
  Array.from({ length: n }, () => ({
    participantLabel: 'P1',
    text: 'x',
    at: '2026-01-01T00:00:00.000Z',
    covered: [],
    partial: [],
    missing: ['a'],
  }))
const runStep = (over: Partial<MicroDrillRunStep> = {}): MicroDrillRunStep => ({
  stepId: 's1',
  attempts: [],
  hintsUsed: [],
  score: 0,
  ...over,
})

describe('hints', () => {
  it('offers the first hint after one missed answer on a first run', () => {
    expect(hintOffer(runStep({ attempts: miss(1) }), 'first_miss', [])).toBe(1)
  })

  it('offers nothing before an answer, or after an answer that covers everything', () => {
    expect(hintOffer(runStep(), 'first_miss', [])).toBeNull()
    const all = [{ ...miss(1)[0]!, missing: [], covered: ['a'] }]
    expect(hintOffer(runStep({ attempts: all }), 'first_miss', [])).toBeNull()
  })

  it('waits for a second missed answer under the second-miss rule', () => {
    expect(hintOffer(runStep({ attempts: miss(1) }), 'second_miss', [])).toBeNull()
    expect(hintOffer(runStep({ attempts: miss(2) }), 'second_miss', [])).toBe(1)
  })

  it('moves up one level at a time and stops after Level 3', () => {
    expect(nextLevel([])).toBe(1)
    expect(nextLevel([1])).toBe(2)
    expect(nextLevel([1, 2])).toBe(3)
    expect(nextLevel([1, 2, 3])).toBeNull()
  })

  it('does not offer a withdrawn Level 3 hint', () => {
    const step = runStep({ attempts: miss(3), hintsUsed: [1, 2] })
    expect(hintOffer(step, 'first_miss', [])).toBe(3)
    expect(hintOffer(step, 'first_miss', ['s1'])).toBeNull()
  })
})

describe('fading', () => {
  const clean = { runs: 2, lastHintMax: 0, cleanRuns: 2 }
  const used3 = { runs: 1, lastHintMax: 3, cleanRuns: 0 }

  it('starts every participant on the first-miss rule with nothing withdrawn', () => {
    expect(decideHints(['A'], ['s1'], {})).toEqual({ rule: 'first_miss', withdrawnLevel3: [] })
  })

  it('moves to the second-miss rule when nobody needed a Level 3 hint last time', () => {
    const history: AnnexHistory = { A: { s1: { runs: 1, lastHintMax: 1, cleanRuns: 0 } } }
    expect(decideHints(['A'], ['s1'], history).rule).toBe('second_miss')
  })

  it('keeps the first-miss rule when anyone needed Level 3, or has not run the annex', () => {
    expect(decideHints(['A'], ['s1'], { A: { s1: used3 } }).rule).toBe('first_miss')
    const history: AnnexHistory = { A: { s1: clean } }
    expect(decideHints(['A', 'B'], ['s1'], history).rule).toBe('first_miss')
  })

  it('withdraws Level 3 only for a step every participant answered cleanly twice', () => {
    const history: AnnexHistory = { A: { s1: clean, s2: clean }, B: { s1: clean } }
    expect(decideHints(['A', 'B'], ['s1', 's2'], history).withdrawnLevel3).toEqual(['s1'])
  })

  it('records the latest hint use and counts consecutive clean runs', () => {
    const steps = [
      { stepId: 's1', hintsUsed: [] as never[], attempts: miss(1) },
      { stepId: 's2', hintsUsed: [1, 2] as (1 | 2)[], attempts: miss(1) },
      { stepId: 's3', hintsUsed: [], attempts: [] },
    ]
    const first = updateHistory({}, ['A'], steps)
    expect(first.A!.s1).toEqual({ runs: 1, lastHintMax: 0, cleanRuns: 1 })
    expect(first.A!.s2).toEqual({ runs: 1, lastHintMax: 2, cleanRuns: 0 })
    expect(first.A!.s3).toBeUndefined()
    const second = updateHistory(first, ['A'], steps)
    expect(second.A!.s1!.cleanRuns).toBe(2)
  })
})

describe('scoring', () => {
  const step = {
    expectedPoints: ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      text: id,
      citation: { documentId: 'd', documentTitle: 't', headingPath: 'h', chunkId: 1 },
    })),
  }
  const attempt = (covered: string[], partial: string[] = []) => ({
    ...miss(1)[0]!,
    covered,
    partial,
    missing: [],
  })

  it('gives full credit for covered points and half for partly covered ones', () => {
    expect(stepScore(step, [attempt(['a', 'b'], ['c'])], [])).toBe(0.625)
  })

  it('keeps a point covered across attempts and does not count it twice', () => {
    const c = coverageOf(step, [attempt(['a']), attempt(['b'], ['a'])])
    expect(c).toEqual({ covered: ['a', 'b'], partial: [], missing: ['c', 'd'] })
  })

  it('reduces by the highest hint level: none, a quarter, a half', () => {
    const all = [attempt(['a', 'b', 'c', 'd'])]
    expect(stepScore(step, all, [1])).toBe(1)
    expect(stepScore(step, all, [1, 2])).toBe(0.75)
    expect(stepScore(step, all, [1, 2, 3])).toBe(0.5)
  })

  it('averages over all questions, so an unanswered one counts zero', () => {
    expect(runCoverage([{ score: 1 }, { score: 0.5 }], 4)).toBe(0.375)
    expect(runCoverage([], 0)).toBe(0)
  })
})

describe('assessment', () => {
  const step = {
    expectedPoints: ['a', 'b', 'c'].map((id) => ({
      id,
      text: id,
      citation: { documentId: 'd', documentTitle: 't', headingPath: 'h', chunkId: 1 },
    })),
  }

  it('keeps only the step point ids and lets the best verdict win', () => {
    const got = normalizeAssessment(step, {
      covered: ['a', 'zzz'],
      partial: ['a', 'b'],
      missing: ['c'],
      followUp: ' What else? ',
    })
    expect(got).toEqual({ covered: ['a'], partial: ['b'], missing: ['c'], followUp: 'What else?' })
  })

  it('treats a point the model forgot to list as missing, and drops the follow-up if nothing is missing', () => {
    expect(normalizeAssessment(step, { covered: ['a'], partial: [], missing: [] }).missing).toEqual(
      ['b', 'c'],
    )
    const all = normalizeAssessment(step, {
      covered: ['a', 'b', 'c'],
      partial: [],
      missing: [],
      followUp: 'x',
    })
    expect(all.followUp).toBeUndefined()
  })

  it('builds the checklist assessment from the points ticked', () => {
    expect(checklistAssessment(step, ['b', 'nope'])).toEqual({
      covered: ['b'],
      partial: [],
      missing: ['a', 'c'],
    })
  })
})

describe('assessment probes against the mock judge', () => {
  const probeText = (answer: string) => ({
    messages: [
      {
        role: 'user' as const,
        content: `Expected points:\n- [p1] Call the airport operations center immediately\n- [p2] Isolate the affected terminal gates\n- [p3] Log every action with its time\n\n<answer>${answer}</answer>`,
      },
    ],
  })

  it.each(PROBES.map((p) => [p.name, p] as const))('the mock passes the probe: %s', (_n, probe) => {
    const got = mockMicroDrillAssess(probeText(probe.answer) as never)
    expect(probe.ok({ covered: got.covered, partial: got.partial, missing: got.missing })).toBe(
      true,
    )
  })

  it('a model that marks everything covered fails the "nothing" probe', () => {
    const nothing = PROBES[1]!
    expect(nothing.ok({ covered: ['p1', 'p2', 'p3'], partial: [], missing: [] })).toBe(false)
  })
})
