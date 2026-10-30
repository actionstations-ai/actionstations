// scripts/bench/judge.mjs and determinism.mjs (#503): the optional local judge and the
// repeat-determinism check.
import { describe, expect, it } from 'vitest'
import { BenchRun } from '@shared/schemas/bench'
import { determinismOf, differingTasks } from '../../scripts/bench/determinism.mjs'
import {
  judgeItems,
  judgeRowsOf,
  parseJudgeRef,
  parseJudgeReply,
  quotesHold,
  runJudge,
  weightedKappa,
  type JudgeItem,
} from '../../scripts/bench/judge.mjs'
import { parseArgs } from '../../scripts/bench/run.mjs'

const item: JudgeItem = {
  id: 'I-01',
  row: 'The FIDS board shows wrong gates.\nExpected action: Switch to manual boards.',
  passage: 'Operations staff switch to manual gate boards when the FIDS feed is wrong.',
}
const reply = (over = {}) =>
  JSON.stringify({
    score: 4,
    rowQuote: 'wrong gates',
    passageQuote: 'manual gate boards',
    ...over,
  })

describe('judge replies', () => {
  it('parses a JSON reply with a 1-5 score and both quotes', () => {
    expect(parseJudgeReply(`Sure.\n${reply()}`)).toEqual({
      score: 4,
      rowQuote: 'wrong gates',
      passageQuote: 'manual gate boards',
    })
  })

  it('rejects malformed replies and scores outside the scale', () => {
    expect(parseJudgeReply('no json')).toBeNull()
    expect(parseJudgeReply(reply({ score: 7 }))).toBeNull()
    expect(parseJudgeReply(reply({ rowQuote: 3 }))).toBeNull()
  })

  it('keeps a score only when both quotes are in the row and the passage', () => {
    const ok = parseJudgeReply(reply())!
    expect(quotesHold(ok, item)).toBe(true)
    expect(quotesHold({ ...ok, passageQuote: 'invented words' }, item)).toBe(false)
    expect(quotesHold({ ...ok, rowQuote: '' }, item)).toBe(false)
  })
})

describe('judgeItems', () => {
  it('counts replies with bad quotes or errors as discarded', async () => {
    const replies = [reply(), reply({ passageQuote: 'made up' }), 'garbage']
    let i = 0
    const out = await judgeItems([item, item, item], async () => replies[i++]!, 'p')
    expect(out.scored).toEqual([{ id: 'I-01', score: 4 }])
    expect(out.discarded).toBe(2)
  })
})

describe('weightedKappa', () => {
  it('is 1 for identical scores and lower for disagreement', () => {
    expect(weightedKappa([1, 3, 5, 2], [1, 3, 5, 2])).toBe(1)
    expect(weightedKappa([1, 5, 1, 5], [5, 1, 5, 1])!).toBeLessThan(0)
    expect(weightedKappa([], [])).toBeNull()
  })
})

describe('runJudge', () => {
  const calibration = Array.from({ length: 60 }, (_, i) => ({
    ...item,
    id: `cal-${i}`,
    score: (i % 5) + 1,
  }))
  it('publishes only with enough calibration rows and agreement', async () => {
    const cal = calibration.map((c, i) => ({ ...c, row: `${c.row} CAL${(i % 5) + 1}` }))
    const calItem = cal.map((c) => ({ ...c, passage: c.passage }))
    const block = await runJudge({
      model: 'lmstudio:judge',
      items: [item],
      calibration: calItem,
      call: async (m) => {
        const score = Number(/CAL(\d)/.exec(m[1]!.content)?.[1] ?? 4)
        return reply({ score })
      },
      prompt: 'p',
    })
    expect(block.kappa).toBe(1)
    expect(block.published).toBe(true)
    expect(block.scores).toMatchObject({ rowsJudged: 1, rowsDiscarded: 0 })
  })

  it('keeps scores unpublished without a calibration set', async () => {
    const block = await runJudge({
      model: 'lmstudio:judge',
      items: [item],
      calibration: [],
      call: async () => reply(),
      prompt: 'p',
    })
    expect(block).toMatchObject({ kappa: null, calibrationRows: 0, published: false })
    expect(block.scores.plausibility).toBe(75)
  })
})

describe('judge setup', () => {
  it('takes rows with a cited passage, capped', () => {
    const msel = Array.from({ length: 40 }, (_, i) => ({
      id: `I-${i}`,
      event: 'e',
      expectedAction: 'a',
      citations: i % 2 ? [{ quote: 'q' }] : [],
    }))
    expect(judgeRowsOf({ msel }, 5)).toHaveLength(5)
    expect(judgeRowsOf({ msel }).every((r) => r.passage === 'q')).toBe(true)
  })

  it('refuses a remote judge and the mock model', () => {
    expect(() => parseJudgeRef('lmstudio:m', 'https://api.example.com/v1')).toThrow(
      /not on this machine/,
    )
    expect(() => parseJudgeRef('mock', undefined, { TTX_MOCK_PROVIDERS: '1' })).toThrow(
      /real local/,
    )
    expect(() => parseArgs(['--models', 'ollama:a', '--judge', 'openai:gpt'])).toThrow()
    expect(parseArgs(['--models', 'ollama:a', '--judge', 'lmstudio:j']).judge).toBe('lmstudio:j')
  })
})

describe('determinism', () => {
  const rep = (score: number, lint: number) => ({
    tasks: [{ task: 'drafting', score, details: { lint } }],
  })

  it('is identical when scores and lint counts match', () => {
    expect(determinismOf([rep(80, 3), rep(80, 3)], 11)).toEqual({
      seed: 11,
      identical: true,
      differing: [],
    })
  })

  it('names the tasks that differ', () => {
    expect(differingTasks(rep(80, 3), rep(80, 4))).toEqual(['drafting'])
    expect(determinismOf([rep(80, 3), rep(81, 3)], 11).identical).toBe(false)
  })

  it('--determinism excludes --repeats', () => {
    expect(parseArgs(['--models', 'ollama:a', '--determinism']).determinism).toBe(true)
    expect(() => parseArgs(['--models', 'ollama:a', '--determinism', '--repeats', '2'])).toThrow(
      /--repeats/,
    )
  })

  it('the run file accepts judge and determinism blocks', () => {
    expect(BenchRun.shape.judge.isOptional()).toBe(true)
    expect(BenchRun.shape.determinism.isOptional()).toBe(true)
  })
})
