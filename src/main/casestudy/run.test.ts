// Case study scoring on worked answer sets, and the run engine (spec 0452 FR-10, FR-11):
// partial credit, the per-step profile, branching, the draft gate and a view without keys.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaseStudy, CaseStudyAnswer, CaseStudyPrompt } from '@shared/schemas'
import {
  nextStageId,
  overallPercent,
  responseProblem,
  scorePrompt,
  stepProfile,
  strongestAndWeakest,
} from '../evaluate/casestudy'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { draftFromTrajectory } = await import('./from-trajectory')
const store = await import('./store')
const run = await import('./run')

const opts = (n: number, p = 'o') =>
  Array.from({ length: n }, (_, i) => ({ id: `${p}${i + 1}`, text: `Option ${i + 1}` }))
const base = { step: 'recognize_cues' as const, text: 'q', rationale: 'because' }

const cues: CaseStudyPrompt = {
  ...base,
  id: 'c',
  type: 'select_cues',
  options: opts(6),
  key: { relevant: ['o1', 'o2', 'o3'] },
}
const rank: CaseStudyPrompt = {
  ...base,
  id: 'r',
  type: 'rank_hypotheses',
  options: opts(4),
  key: { order: ['o1', 'o2', 'o3', 'o4'] },
}
const acts: CaseStudyPrompt = {
  ...base,
  id: 'a',
  type: 'choose_actions',
  options: opts(5),
  key: { credit: { o1: 1, o2: 1, o3: 0.5, o4: 0, o5: -1 } },
}
const why: CaseStudyPrompt = {
  ...base,
  id: 'w',
  type: 'rationale',
  key: {
    points: [
      { label: 'trend', anyOf: ['trend', 'worsening'] },
      { label: 'infection', anyOf: ['infection', 'sepsis'] },
    ],
  },
}
const evalp: CaseStudyPrompt = {
  ...base,
  id: 'e',
  type: 'evaluate_outcome',
  options: opts(3),
  key: { credit: { o1: 1, o2: 0.4, o3: 0 } },
}

describe('scorePrompt', () => {
  it('select cues: right picks over wrong picks, never below zero', () => {
    expect(scorePrompt(cues, ['o1', 'o2', 'o3'])).toBe(1)
    expect(scorePrompt(cues, ['o1', 'o2'])).toBe(0.667)
    expect(scorePrompt(cues, ['o1', 'o2', 'o3', 'o4'])).toBe(0.667)
    expect(scorePrompt(cues, ['o4', 'o5'])).toBe(0)
    expect(scorePrompt(cues, [])).toBe(0)
  })

  it('rank hypotheses: exact order is 1 and a reversal is 0', () => {
    expect(scorePrompt(rank, ['o1', 'o2', 'o3', 'o4'])).toBe(1)
    expect(scorePrompt(rank, ['o2', 'o1', 'o3', 'o4'])).toBe(0.75)
    expect(scorePrompt(rank, ['o4', 'o3', 'o2', 'o1'])).toBe(0)
  })

  it('choose actions: credit over the best possible, harm subtracts', () => {
    expect(scorePrompt(acts, ['o1', 'o2'])).toBe(0.8)
    expect(scorePrompt(acts, ['o1', 'o2', 'o3'])).toBe(1)
    expect(scorePrompt(acts, ['o1', 'o2', 'o5'])).toBe(0.4)
    expect(scorePrompt(acts, ['o5'])).toBe(0)
    expect(scorePrompt(acts, [])).toBe(0)
  })

  it('rationale: the share of key points a phrase of which appears', () => {
    expect(scorePrompt(why, 'The trend is worsening and I suspect sepsis')).toBe(1)
    expect(scorePrompt(why, 'It is a TREND')).toBe(0.5)
    expect(scorePrompt(why, 'not sure')).toBe(0)
    expect(scorePrompt(why, '   ')).toBe(0)
  })

  it('evaluate outcome: the credit of the chosen option', () => {
    expect(scorePrompt(evalp, ['o1'])).toBe(1)
    expect(scorePrompt(evalp, ['o2'])).toBe(0.4)
    expect(scorePrompt(evalp, [])).toBe(0)
  })
})

describe('responseProblem', () => {
  it('names the problem with a response', () => {
    expect(responseProblem(cues, ['zz'])).toMatch(/does not exist/)
    expect(responseProblem(cues, ['o1', 'o1'])).toMatch(/twice/)
    expect(responseProblem(rank, ['o1', 'o2'])).toMatch(/every option/)
    expect(responseProblem(evalp, ['o1', 'o2'])).toMatch(/one option/)
    expect(responseProblem(why, ['o1'])).toMatch(/written/)
    expect(responseProblem(cues, 'text')).toMatch(/options/)
    expect(responseProblem(cues, ['o1', 'o2'])).toBeUndefined()
  })
})

describe('profile and branching', () => {
  const answer = (
    step: CaseStudyAnswer['step'],
    score: number,
    promptId = `${step}${score}`,
  ): CaseStudyAnswer => ({
    stageId: 's1',
    promptId,
    step,
    response: [],
    score,
    answeredAt: '2026-11-04T10:00:00.000Z',
  })

  it('averages the prompts of each step and says n/a for a step with none', () => {
    const profile = stepProfile([
      answer('recognize_cues', 1, 'a'),
      answer('recognize_cues', 0.5, 'b'),
      answer('take_action', 0.25, 'c'),
    ])
    expect(profile).toHaveLength(6)
    expect(profile.find((p) => p.step === 'recognize_cues')).toMatchObject({
      prompts: 2,
      percent: 75,
    })
    expect(profile.find((p) => p.step === 'take_action')).toMatchObject({ prompts: 1, percent: 25 })
    expect(profile.find((p) => p.step === 'analyze_cues')).toMatchObject({
      prompts: 0,
      percent: null,
    })
    expect(overallPercent([answer('take_action', 1, 'a'), answer('take_action', 0, 'b')])).toBe(50)
    expect(overallPercent([])).toBeNull()
  })

  it('counts only the latest answer to a prompt', () => {
    expect(
      stepProfile([answer('take_action', 0, 'x'), answer('take_action', 1, 'x')]).find(
        (p) => p.step === 'take_action',
      )!.percent,
    ).toBe(100)
  })

  it('names the strongest and weakest step', () => {
    const p = stepProfile([
      answer('recognize_cues', 1, 'a'),
      answer('take_action', 0.2, 'b'),
      answer('evaluate_outcomes', 0.6, 'c'),
    ])
    const { strong, weak } = strongestAndWeakest(p)
    expect(strong?.step).toBe('recognize_cues')
    expect(weak?.step).toBe('take_action')
    expect(strongestAndWeakest(stepProfile([answer('take_action', 1, 'a')]))).toEqual({})
  })

  it('branches on the score of the deciding prompt', () => {
    const stage = {
      id: 's',
      title: 't',
      time: '',
      narrative: 'n',
      data: { figures: {}, tables: [], statements: [] },
      next: 'default',
      prompts: [
        {
          ...acts,
          id: 'a',
          branch: { threshold: 0.7, passTo: 'good', failTo: 'poor' },
        } as CaseStudyPrompt,
      ],
    }
    expect(nextStageId(stage, [{ promptId: 'a', score: 0.8 }])).toBe('good')
    expect(nextStageId(stage, [{ promptId: 'a', score: 0.7 }])).toBe('good')
    expect(nextStageId(stage, [{ promptId: 'a', score: 0.69 }])).toBe('poor')
    expect(nextStageId(stage, [])).toBe('default')
  })
})

describe('the run engine', () => {
  let root: string
  let study: CaseStudy
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'casestudy-run-'))
    study = await store.saveCaseStudy(
      root,
      draftFromTrajectory({ id: 'sep', kind: 'sepsis', seed: 3 }),
    )
  })
  afterEach(() => rm(root, { recursive: true, force: true }))

  const best = (p: CaseStudyPrompt): string[] | string => {
    switch (p.type) {
      case 'select_cues':
        return p.key.relevant
      case 'rank_hypotheses':
        return p.key.order
      case 'choose_actions':
        return Object.entries(p.key.credit)
          .filter(([, c]) => c > 0)
          .map(([id]) => id)
      case 'evaluate_outcome':
        return [Object.entries(p.key.credit).sort((a, b) => b[1] - a[1])[0]![0]]
      case 'rationale':
        return p.key.points.map((k) => k.anyOf[0]).join(' ')
    }
  }
  const poor = (p: CaseStudyPrompt): string[] | string => {
    switch (p.type) {
      case 'select_cues':
      case 'rank_hypotheses':
        return p.type === 'rank_hypotheses' ? [...p.key.order].reverse() : []
      case 'choose_actions':
        return Object.entries(p.key.credit)
          .filter(([, c]) => c < 0)
          .map(([id]) => id)
      case 'evaluate_outcome':
        return [Object.entries(p.key.credit).sort((a, b) => a[1] - b[1])[0]![0]]
      case 'rationale':
        return 'no idea'
    }
  }

  async function play(pick: (p: CaseStudyPrompt) => string[] | string) {
    await store.reviewCaseStudy(root, study.id, { by: 'Reviewer', note: '' })
    const { id } = await run.startRun(root, {
      caseId: study.id,
      mode: 'individual',
      acknowledged: true,
    })
    for (;;) {
      const view = await run.playView(root, id)
      if (view.finished) return view
      const stage = (await store.getCaseStudy(root, study.id)).stages.find(
        (s) => s.id === view.stage.id,
      )!
      for (const p of stage.prompts)
        await run.submitAnswer(root, { runId: id, promptId: p.id, response: pick(p) })
      await run.advance(root, id)
    }
  }

  it('refuses a draft to a learner but lets the author preview it', async () => {
    await expect(
      run.startRun(root, { caseId: study.id, mode: 'individual', acknowledged: true }),
    ).rejects.toThrow(/draft/)
    const r = await run.startRun(root, {
      caseId: study.id,
      mode: 'individual',
      acknowledged: true,
      preview: true,
    })
    expect(r.preview).toBe(true)
  })

  it('needs the notice to be acknowledged', async () => {
    await store.reviewCaseStudy(root, study.id, { by: 'R', note: '' })
    await expect(
      run.startRun(root, { caseId: study.id, mode: 'individual', acknowledged: false }),
    ).rejects.toThrow(/notice/)
  })

  it('takes the good path for the best answers and scores near the top', async () => {
    const view = await play(best)
    expect(view.run.path).toEqual(['s1', 's2', 's3', 's4', 's5_good', 's6'])
    expect(view.overall).toBeGreaterThanOrEqual(95)
    expect(view.profile.every((p) => p.percent !== null && p.percent >= 90)).toBe(true)
  })

  it('takes the poor path for weak answers and scores low', async () => {
    const view = await play(poor)
    expect(view.run.path).toContain('s5_poor')
    expect(view.overall).toBeLessThan(40)
  })

  it('does not let a stage end before every prompt is answered, or a prompt be answered twice', async () => {
    await store.reviewCaseStudy(root, study.id, { by: 'R', note: '' })
    const { id } = await run.startRun(root, {
      caseId: study.id,
      mode: 'individual',
      acknowledged: true,
    })
    await expect(run.advance(root, id)).rejects.toThrow(/every question/)
    await run.submitAnswer(root, { runId: id, promptId: 'p1', response: [] })
    await expect(
      run.submitAnswer(root, { runId: id, promptId: 'p1', response: [] }),
    ).rejects.toThrow(/already/)
    await expect(
      run.submitAnswer(root, { runId: id, promptId: 'p2', response: [] }),
    ).rejects.toThrow(/not in this stage/)
  })

  it('shows no key, and a rationale only after the prompt is answered', async () => {
    await store.reviewCaseStudy(root, study.id, { by: 'R', note: '' })
    const { id } = await run.startRun(root, {
      caseId: study.id,
      mode: 'individual',
      acknowledged: true,
    })
    const before = await run.playView(root, id)
    const text = JSON.stringify(before)
    expect(text).not.toContain('"key"')
    expect(text).not.toContain('"credit"')
    expect(text).not.toContain('"relevant"')
    expect(before.feedback).toEqual([])
    expect(text).not.toContain(study.stages[0]!.prompts[0]!.rationale)
    await run.submitAnswer(root, { runId: id, promptId: 'p1', response: [] })
    const after = await run.playView(root, id)
    expect(after.feedback[0]!.rationale).toBe(study.stages[0]!.prompts[0]!.rationale)
    expect(after.feedback[0]!.bestAnswer.length).toBeGreaterThan(5)
    expect(after.canAdvance).toBe(true)
    expect(after.notes.score).toMatch(/not NCLEX/)
  })

  it('records each member’s vote on a group run and refuses votes on an individual run', async () => {
    await store.reviewCaseStudy(root, study.id, { by: 'R', note: '' })
    const group = await run.startRun(root, { caseId: study.id, mode: 'group', acknowledged: true })
    const first = study.stages[0]!.prompts[0]!
    if (first.type !== 'select_cues') throw new Error('expected select_cues')
    const votes = [
      { member: 'Ana', response: [first.key.relevant[0]!] },
      { member: 'Ben', response: first.key.relevant },
    ]
    const saved = await run.submitAnswer(root, {
      runId: group.id,
      promptId: first.id,
      response: first.key.relevant,
      preVotes: votes,
    })
    expect(saved.answers[0]!.preVotes).toHaveLength(2)
    const solo = await run.startRun(root, {
      caseId: study.id,
      mode: 'individual',
      acknowledged: true,
    })
    await expect(
      run.submitAnswer(root, { runId: solo.id, promptId: first.id, response: [], preVotes: votes }),
    ).rejects.toThrow(/group/)
  })

  it('shows the stage figures as drawings with a text summary', async () => {
    await store.reviewCaseStudy(root, study.id, { by: 'R', note: '' })
    const { id } = await run.startRun(root, {
      caseId: study.id,
      mode: 'individual',
      acknowledged: true,
    })
    await run.submitAnswer(root, { runId: id, promptId: 'p1', response: [] })
    await run.advance(root, id)
    const view = await run.playView(root, id)
    expect(view.stage.figures[0]!.svg.startsWith('<svg')).toBe(true)
    expect(view.stage.figures[0]!.summary).toMatch(/Simulated data/)
    expect(view.stage.figures[0]!.table!.rows.length).toBeGreaterThan(0)
  })
})
