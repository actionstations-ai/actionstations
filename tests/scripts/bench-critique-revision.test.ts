// Critique scoring on the revised scenario (#592): fixed defects count as found, a revision that
// rewrites correct rows is damage, and `bench:rescore` re-scores saved runs without a model.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadDefects,
  loadExample,
  loadSuite,
  scenarioIdFor,
  shippedScenario,
} from '../../scripts/bench/corpus.mjs'
import { applyDefects, isFixed, similarity } from '../../scripts/bench/defects.mjs'
import { rescoreRun } from '../../scripts/bench/rescore.mjs'
import { summarizeRepeats } from '../../scripts/bench/score/composite.mjs'
import { critiqueScore } from '../../scripts/bench/score/critique.mjs'
import { damageScore } from '../../scripts/bench/score/damage.mjs'
import type { Planted } from '../../scripts/bench/defects.d.mts'

type Row = {
  id: string
  phaseId: string
  purposeTag: string
  from: string
  event: string
  expectedAction: string
  time: string
}
const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  phaseId: 'p1',
  purposeTag: 'CORE_NARRATIVE',
  from: 'Facilitator',
  event: `Event ${id}: the tank level alarm sounds at the east plant`,
  expectedAction: `Operators check the tank level and report to the supervisor for ${id}`,
  time: '0:10',
  ...over,
})

const planted = (over: Partial<Planted> & { probe: unknown }): Planted => ({
  id: 'p',
  kind: 'x',
  words: ['x'],
  rows: [],
  anyRow: false,
  ...over,
})

describe('isFixed', () => {
  const dup = planted({
    probe: { type: 'duplicate', row: 'I-01', copyId: 'I-01x', event: 'Same text here' },
  })
  const same = { event: 'Same text here' }

  it('sees a duplicate fixed when either row is removed', () => {
    expect(isFixed(dup, [row('I-01', same), row('I-01x', same)])).toBe(false)
    expect(isFixed(dup, [row('I-01', same)])).toBe(true)
    expect(isFixed(dup, [row('I-01x', same)])).toBe(true)
  })

  it('counts a rewritten copy only when it is unlike the original and every other row', () => {
    const other = { event: 'A different inject about the pump failing at the north site' }
    const echo = [row('I-01', same), row('I-01x', other), row('I-07', other)]
    expect(isFixed(dup, echo)).toBe(false) // now a copy of I-07
    expect(isFixed(dup, [row('I-01', same), row('I-01x', other)])).toBe(true)
  })

  const text =
    'The county health agency decides whether the plant stays open and when to reopen it.'
  const clean =
    'The plant manager decides whether the plant stays open and when to reopen it, with the county.'
  const sentence = planted({
    probe: {
      type: 'fields',
      row: 'I-03',
      checks: [{ field: 'expectedAction', planted: text, clean }],
    },
  })

  it('counts a field fixed when it is closer to the clean value than to the planted one', () => {
    expect(isFixed(sentence, [row('I-03', { expectedAction: clean })])).toBe(true)
    expect(isFixed(sentence, [row('I-03', { expectedAction: text })])).toBe(false)
  })

  it('does not count an unrelated rewrite, or a light rewording of the planted text', () => {
    const unrelated = 'Crews photograph the damaged fence and file the insurance claim.'
    expect(isFixed(sentence, [row('I-03', { expectedAction: unrelated })])).toBe(false)
    expect(isFixed(sentence, [row('I-03', { expectedAction: `${text} Now.` })])).toBe(false)
  })

  it('needs a replaced identifier gone and the text still about the clean row', () => {
    const id = planted({
      probe: {
        type: 'fields',
        row: 'I-02',
        checks: [
          {
            field: 'event',
            contains: 'TANK-09',
            planted: 'Alarm on TANK-09 at the east plant',
            clean: 'Alarm on TANK-01 at the east plant',
          },
        ],
      },
    })
    expect(isFixed(id, [row('I-02', { event: 'Alarm on TANK-09 at the east plant' })])).toBe(false)
    expect(isFixed(id, [row('I-02', { event: 'Alarm on TANK-01 at the east plant' })])).toBe(true)
    expect(isFixed(id, [row('I-02', { event: 'Crews photograph the fence' })])).toBe(false)
  })

  it('does not count a deleted row as a fix for a field defect', () => {
    const d = planted({
      probe: {
        type: 'fields',
        row: 'I-09',
        checks: [{ field: 'from', planted: 'Operator', clean: 'Facilitator' }],
      },
    })
    expect(isFixed(d, [row('I-01')])).toBe(false)
    expect(isFixed(d, [row('I-09', { from: 'Facilitator' })])).toBe(true)
  })

  it('counts a time fixed when clean or in sequence again, not when still out of order', () => {
    const d = planted({
      probe: {
        type: 'fields',
        row: 'I-02',
        checks: [{ field: 'time', planted: '9:00', clean: '0:20' }],
      },
    })
    const at = (t: string) => [
      row('I-01', { time: '0:10' }),
      row('I-02', { time: t }),
      row('I-03', { time: '0:30' }),
    ]
    expect(isFixed(d, at('9:00'))).toBe(false)
    expect(isFixed(d, at('1:50'))).toBe(false)
    expect(isFixed(d, at('0:25'))).toBe(true)
  })

  it('needs the removed decision point back, not just any decision point', () => {
    const none = planted({ probe: { type: 'decision_point', count: 2, phases: ['p2', 'p3'] } })
    const dp = (id: string, phaseId: string) => row(id, { purposeTag: 'DECISION_POINT', phaseId })
    expect(isFixed(none, [row('I-01'), dp('I-05', 'p1')])).toBe(false)
    expect(isFixed(none, [dp('I-05', 'p1'), dp('I-06', 'p1')])).toBe(true)
    expect(isFixed(none, [dp('I-05', 'p1'), dp('I-07', 'p3')])).toBe(true)
  })

  it('measures word overlap', () => {
    expect(similarity('red fox', 'red fox')).toBe(1)
    expect(similarity('red fox', 'blue cat')).toBe(0)
  })
})

describe('damageScore', () => {
  const before = [
    row('START', { purposeTag: 'STARTEX' }),
    row('I-01'),
    row('I-02', { purposeTag: 'PRESSURE' }),
    row('I-03'),
    row('I-04'),
  ]

  it('is zero when the revision only touches the planted rows', () => {
    const after = before.map((r) =>
      r.id === 'I-04' ? { ...r, event: 'Rewritten completely, nothing shared' } : r,
    )
    const d = damageScore({
      before,
      after,
      planted: [planted({ rows: ['I-04'], probe: {} })],
      penalty: 2,
    })
    expect(d).toMatchObject({ damage: 0, intact: 100, damaged: [] })
  })

  it('weighs a rewritten pressure row triple, and counts removed rows', () => {
    const after = before
      .filter((r) => r.id !== 'I-03')
      .map((r) =>
        r.id === 'I-02' ? { ...r, expectedAction: 'Ignore it, nothing else shared at all' } : r,
      )
    const d = damageScore({ before, after, planted: [], penalty: 2 })
    expect(d.damaged.map((x) => [x.id, x.fields])).toEqual([
      ['I-02', ['expectedAction']],
      ['I-03', ['removed']],
    ])
    // weights: I-01 1, I-02 3, I-03 1, I-04 1 = 6; lost 3 + 1 = 4
    expect(d.damage).toBe(66.7)
    expect(d.intact).toBe(0)
  })

  it('counts a deleted planted row as damage but not a removed duplicate', () => {
    const plantedRow = planted({
      rows: ['I-03'],
      probe: { type: 'fields', row: 'I-03', checks: [] },
    })
    const after = before.filter((r) => r.id !== 'I-03')
    const hurt = damageScore({ before, after, planted: [plantedRow], penalty: 2 })
    expect(hurt.damaged[0]).toMatchObject({ id: 'I-03', fields: ['removed'] })
    const dup = planted({ rows: ['I-03', 'I-04'], probe: { type: 'duplicate' } })
    expect(damageScore({ before, after, planted: [dup], penalty: 2 }).damage).toBe(0)
  })

  it('does not count a qualifier added to a sender or a light rewording', () => {
    const after = before.map((r) =>
      r.id === 'I-01' ? { ...r, from: 'Facilitator (Plant A)', event: `${r.event} at 09:00` } : r,
    )
    expect(damageScore({ before, after, planted: [], penalty: 2 }).damage).toBe(0)
  })
})

describe('critiqueScore on the revised scenario', () => {
  const dup = planted({
    id: 'dup',
    words: ['duplicate'],
    rows: ['I-01', 'I-01x'],
    probe: { type: 'duplicate', row: 'I-01', copyId: 'I-01x', event: 'copy' },
  })
  const order = planted({
    id: 'order',
    words: ['order'],
    rows: ['I-02'],
    probe: { type: 'fields', row: 'I-02', checks: [{ field: 'time', planted: '9:00' }] },
  })
  const base = { lints: [], rowCount: 4, noisePenalty: 20 }

  it('counts a defect the revision removed as found and reports it apart from the notes', () => {
    const before = [
      row('I-01', { event: 'copy' }),
      row('I-01x', { event: 'copy' }),
      row('I-02', { time: '9:00' }),
    ]
    const after = [row('I-01', { event: 'copy' }), row('I-02', { time: '9:00' })]
    const notes = [
      { code: 'CRITIQUE', rowId: 'I-02', message: 'Out of order', source: 'critique' as const },
    ]
    const r = critiqueScore({ ...base, notes, planted: [dup, order], before, after })
    expect(r).toMatchObject({
      recall: 100,
      noted: 50,
      fixed: 50,
      fixedIds: ['dup'],
      notedIds: ['order'],
    })
    expect(r.missed).toEqual([])
  })

  it('still scores notes alone when no revised rows are given', () => {
    const r = critiqueScore({ ...base, notes: [], planted: [dup, order] })
    expect(r).toMatchObject({ recall: 0, fixed: 0, damage: 0, intact: 100 })
  })
})

describe('summarizeRepeats and critique', () => {
  it('reports the median recall, fixed and damage of the critique task', () => {
    const rep = (recall: number, fixed: number, damage: number) => ({
      overall: 50,
      tasks: [{ task: 'critique', score: 50, parts: { recall, fixed, damage } }],
    })
    const s = summarizeRepeats([rep(40, 10, 5), rep(80, 30, 25), rep(60, 20, 15)], [1, 1, 1], 15)
    expect(s.median.critique).toEqual({ recall: 60, fixed: 20, damage: 15 })
  })
})

describe('bench:rescore', () => {
  const suite = loadSuite('quick')
  const c = suite.critique.find((x: { id: string }) => x.id === 'county-911-storm-tdos')!

  function savedRun() {
    const dir = mkdtempSync(join(tmpdir(), 'rescore-'))
    const defects = loadDefects(c.defects!)
    const example = loadExample(c.example)
    const shipped = shippedScenario(example, defects.scenario!)
    const { scenario: planted } = applyDefects(shipped, defects)
    const id = scenarioIdFor(example, defects.scenario!)
    const folder = join(dir, 'work', 'lmstudio-test', 'r1', c.example, 'P.asproj', 'scenarios', id)
    mkdirSync(join(folder, 'history'), { recursive: true })
    const entry = { note: `Benchmark ${c.id}: planted defects`, snapshot: planted }
    writeFileSync(join(folder, 'history', 'scenario.jsonl'), `${JSON.stringify(entry)}\n`)
    // The revision drops the planted duplicate and rewrites one pressure row; no note names the duplicate.
    const copy = defects.defects.find((d) => d.kind === 'duplicate_row')!.copyId
    const pressure = planted.msel.find((r: { purposeTag: string }) => r.purposeTag === 'PRESSURE')!
    const msel = planted.msel
      .filter((r: { id: string }) => r.id !== copy)
      .map((r: { id: string }) =>
        r.id === pressure.id
          ? {
              ...r,
              event: 'Replaced with unrelated words entirely',
              expectedAction: 'Nothing shared',
            }
          : r,
      )
    writeFileSync(join(folder, 'scenario.json'), JSON.stringify({ ...planted, msel, warnings: [] }))
    const task = (task: string, score: number) => ({
      task,
      score,
      parts: {},
      details: {},
      wallSeconds: 1,
    })
    const run = {
      suite: 'quick',
      median: {
        overall: 50,
        tasks: { drafting: 60, ideation: 60, critique: 10 },
        draftingReliability: 1,
      },
      repeats: [
        {
          seed: 1,
          overall: 50,
          tasks: [task('drafting', 60), task('ideation', 60), task('critique', 10)],
        },
      ],
    }
    return { dir, run, pressure: pressure.id }
  }

  it('scores the saved revised scenario, with no model call', () => {
    const { dir, run, pressure } = savedRun()
    const quickCounty = { ...suite, critique: [c] }
    const re = rescoreRun(run, join(dir, 'work'), quickCounty)
    expect(re.missing).toEqual([])
    const scored = re.repeats[0]!.cases[0]!
    expect(scored.details.fixedIds).toContain(
      loadDefects(c.defects!).defects.find((d: { kind: string }) => d.kind === 'duplicate_row')!.id,
    )
    expect(scored.details.damaged.map((d: { id: string }) => d.id)).toContain(pressure)
    expect(re.summary.median.tasks.critique).toBeGreaterThan(10)
    expect(re.summary.median.critique!.damage).toBeGreaterThan(0)
  })

  it('names the cases whose saved scenario is missing', () => {
    const { run } = savedRun()
    const re = rescoreRun(run, join(tmpdir(), 'no-such-work-folder'), { ...suite, critique: [c] })
    expect(re.missing).toEqual(['repeat 1 county-911-storm-tdos'])
  })

  it('judges the floor on drafting and ideation only', () => {
    const { dir, run } = savedRun()
    const re = rescoreRun(run, join(dir, 'work'), { ...suite, critique: [c] })
    expect(re.floor).toEqual({ before: false, after: true })
  })
})
