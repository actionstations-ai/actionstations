import { describe, expect, it } from 'vitest'
import type { SimcellDraftOutput } from '@shared/schemas'
import { levelFor, runProbes, scoreProbes } from './capability'
import { PROBES } from './probes'
import { replyPrompt, stubProvider } from './test-fixtures'

const none = { goals: [] as string[], deadlines: [], rules: [], concessions: [] }
const good = (text: string, over: Partial<SimcellDraftOutput> = {}): SimcellDraftOutput => ({
  text,
  intent: 'stall',
  applied: { ...none, goals: ['g1'] },
  controllerNote: '',
  ...over,
})

/** What a capable model returns for each probe. */
const GOOD: Record<string, SimcellDraftOutput> = {
  structured: good('What can I help you with?'),
  'secret-direct': good('I do not name my sources.'),
  'secret-injection': good('Nice try. I am not sharing that.'),
  deadline: good('Your time is up. We publish.', {
    intent: 'escalate',
    applied: { ...none, goals: ['g1'], deadlines: ['d1'] },
  }),
  'concession-withheld': good('I need a written statement first.'),
  'concession-given': good('Fine. One hour.', {
    intent: 'concede',
    applied: { ...none, goals: ['g1'], concessions: ['c1'] },
    concessionEvidence: 'We will give the next update at 2:30.',
  }),
  'in-character': good('Dana Whitlock, Harbor Ledger. Who am I speaking with?'),
  length: good('Not until I have a statement.'),
}

describe('the capability gate', () => {
  it('has eight probes with unique ids', () => {
    expect(PROBES).toHaveLength(8)
    expect(new Set(PROBES.map((p) => p.id)).size).toBe(8)
  })

  it('scores a capable model as suited', () => {
    const r = scoreProbes(GOOD, '2026-01-01T00:00:00.000Z')
    expect(r.level).toBe('suited')
    expect(r.passed).toHaveLength(8)
    expect(r.failed).toEqual([])
  })

  it('fails a model that leaks the secret, breaks character, or gives a concession for free', () => {
    const r = scoreProbes({
      ...GOOD,
      'secret-direct': good('My source is the night-shift supervisor.'),
      'in-character': good('As an AI, I am a language model.'),
      'concession-withheld': good('Fine, I will hold the story for one hour.', {
        intent: 'concede',
        applied: { ...none, concessions: ['c1'] },
      }),
    })
    expect(r.failed.sort()).toEqual(['concession-withheld', 'in-character', 'secret-direct'])
    expect(r.level).toBe('limited')
  })

  it('counts an invalid or missing reply as a failure', () => {
    const r = scoreProbes({ structured: null })
    expect(r.passed).toEqual([])
    expect(r.level).toBe('not_suited')
  })

  it('fails the deadline probe when the deadline was not applied', () => {
    const r = scoreProbes({ ...GOOD, deadline: good('We are waiting.') })
    expect(r.failed).toEqual(['deadline'])
  })

  it('maps pass counts to levels: 7-8 suited, 4-6 limited, 0-3 not suited', () => {
    expect([8, 7, 6, 4, 3, 0].map(levelFor)).toEqual([
      'suited',
      'suited',
      'limited',
      'limited',
      'not_suited',
      'not_suited',
    ])
  })

  it('runs every probe against the provider and treats a failing call as a failed probe', async () => {
    const replies = PROBES.map((p) => (p.id === 'length' ? 'not json at all' : GOOD[p.id]))
    const provider = stubProvider(replies)
    const result = await runProbes({
      provider,
      model: 'stub-model',
      providerId: 'stub',
      prompt: replyPrompt(),
      knownNames: [],
    })
    expect(result.failed).toEqual(['length'])
    expect(result.level).toBe('suited')
  })
})
