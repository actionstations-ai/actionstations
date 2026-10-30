import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Scenario, type EegOutput } from '@shared/schemas'
import { applyEeg, EEG_ROW } from './mappers-eeg'
import type { RetrievedChunk } from './retrieval'

const base = Scenario.parse(
  JSON.parse(readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
)

const chunk = (key: string, chunkId: number, headingPath: string): RetrievedChunk => ({
  key,
  hit: {
    chunkId,
    documentId: 'tirp',
    documentTitle: 'Terminal Incident Response Plan',
    headingPath,
    text: `Text of ${headingPath}`,
    score: 1,
  },
})
const retrieved = [
  chunk('C1', 11, 'TIRP › Section 13 › 13.7 Checklist: Cybersecurity Incident'),
  chunk('C2', 12, 'TIRP › Section 1 › 1.4 Guidance Applicable for All Incident Plans'),
]

const task = (over: Partial<EegOutput['eegs'][number]['criticalTasks'][number]> = {}) => ({
  task: 'Notify all tenants of the system failure',
  citation: 'C1',
  rowIds: ['I-09'],
  ...over,
})

function output(over: Partial<EegOutput> = {}): EegOutput {
  return {
    objectiveCapabilities: [
      {
        objective: 'Decision Making',
        capabilities: [{ capability: 'operational_coordination', why: 'The Go Dark call.' }],
      },
      {
        objective: 'communication',
        capabilities: [{ capability: 'public_information_and_warning', why: 'Rumor control.' }],
      },
    ],
    eegs: [
      {
        capability: 'operational_coordination',
        target: 'Ops and IT decide together.',
        criticalTasks: [
          task({ expectedBy: 'IC', timing: 'immediately' }),
          task({ task: 'Activate manual workarounds', rowIds: ['i-10', 'I-99'] }),
          task({ task: 'Brief the airlines', citation: 'C2', rowIds: [] }),
        ],
      },
    ],
    ...over,
  }
}

const fresh = (): Scenario => structuredClone(base)

describe('applyEeg', () => {
  it('maps an objective the model wrote back as the whole "name: text" line', () => {
    const s = fresh()
    const line = `${s.objectives[0]!.name}: ${s.objectives[0]!.text}`
    const out = output({
      objectiveCapabilities: [
        {
          objective: line,
          capabilities: [{ capability: 'operational_coordination', why: 'The Go Dark call.' }],
        },
      ],
    })
    const r = applyEeg(s, out, retrieved)
    expect(r.unknownObjectives).toEqual([])
    expect(s.evaluation.objectiveCapabilities.map((p) => p.objectiveId)).toEqual([
      s.objectives[0]!.id,
    ])
  })

  it('maps objective names (exact, then case-insensitive) to ids and keeps the why', () => {
    const s = fresh()
    const r = applyEeg(s, output(), retrieved)
    expect(r.unknownObjectives).toEqual([])
    expect(s.evaluation.objectiveCapabilities).toEqual([
      {
        objectiveId: 'obj-decision',
        capability: 'operational_coordination',
        why: 'The Go Dark call.',
      },
      {
        objectiveId: 'obj-communication',
        capability: 'public_information_and_warning',
        why: 'Rumor control.',
      },
    ])
    expect(s.evaluation.eegs[0]?.objectiveRefs).toEqual(['obj-decision'])
    expect(s.evaluation.eegs[0]?.criticalTasks[0]?.objectiveRefs).toEqual(['obj-decision'])
  })

  it('skips objectives the scenario does not have and reports them', () => {
    const s = fresh()
    const out = output()
    out.objectiveCapabilities.push({
      objective: 'Resilience',
      capabilities: [{ capability: 'planning', why: '' }],
    })
    const r = applyEeg(s, out, retrieved)
    expect(r.unknownObjectives).toEqual(['Resilience'])
    expect(s.evaluation.objectiveCapabilities).toHaveLength(2)
  })

  it('resolves citations, roles, timing and rows; numbers tasks T-01…', () => {
    const s = fresh()
    const r = applyEeg(s, output(), retrieved)
    const tasks = s.evaluation.eegs[0]!.criticalTasks
    expect(tasks.map((t) => t.id)).toEqual(['T-01', 'T-02', 'T-03'])
    expect(tasks[0]).toMatchObject({
      capability: 'operational_coordination',
      expectedBy: 'ops-director',
      timing: 'immediately',
      rowIds: ['I-09'],
      locked: false,
    })
    expect(tasks[0]?.citation).toMatchObject({ documentId: 'tirp', chunkId: 11 })
    expect(tasks[0]?.citation.headingPath).toMatch(/13\.7/)
    // Row ids are matched case-insensitively; unknown ones are dropped and reported.
    expect(tasks[1]?.rowIds).toEqual(['I-10'])
    expect(r.unknownRows).toEqual([{ task: 'Activate manual workarounds', ids: ['I-99'] }])
    expect(tasks[2]?.citation.chunkId).toBe(12)
    expect(tasks[2]?.expectedBy).toBeUndefined()
  })

  it('drops a task whose citation key was never shown and records CITATION_DROPPED input', () => {
    const s = fresh()
    const out = output()
    out.eegs[0]!.criticalTasks[1]!.citation = 'C9'
    const r = applyEeg(s, out, retrieved)
    expect(r.dropped).toEqual([{ rowId: EEG_ROW, keys: ['C9'] }])
    expect(s.evaluation.eegs[0]?.criticalTasks.map((t) => t.task)).toEqual([
      'Notify all tenants of the system failure',
      'Brief the airlines',
    ])
  })

  it('leaves expectedBy empty for a role key that matches nothing and reports it', () => {
    const s = fresh()
    const out = output()
    out.eegs[0]!.criticalTasks[0]!.expectedBy = 'mayor'
    const r = applyEeg(s, out, retrieved)
    expect(s.evaluation.eegs[0]?.criticalTasks[0]?.expectedBy).toBeUndefined()
    expect(r.unknownRoles).toEqual([
      { task: 'Notify all tenants of the system failure', key: 'mayor' },
    ])
  })

  it('keeps locked tasks of the previous run, matched by capability and normalized text', () => {
    const s = fresh()
    applyEeg(s, output(), retrieved)
    const prev = s.evaluation.eegs[0]!.criticalTasks
    prev[0]!.locked = true
    prev[0]!.timing = 'within 15 minutes'
    prev[2]!.locked = true
    const again = output()
    // The model rewrote the first task's wording slightly and dropped the third.
    again.eegs[0]!.criticalTasks = [
      task({ task: '  notify ALL tenants of the system   failure ' }),
      task({ task: 'A brand new task' }),
      task({ task: 'Another new task' }),
    ]
    const r = applyEeg(s, again, retrieved)
    expect(r.keptLocked).toBe(2)
    const tasks = s.evaluation.eegs[0]!.criticalTasks
    expect(tasks.map((t) => t.id)).toEqual(['T-01', 'T-02', 'T-04', 'T-03'])
    expect(tasks[0]).toMatchObject({ locked: true, timing: 'within 15 minutes' })
    expect(tasks[3]).toMatchObject({ id: 'T-03', task: 'Brief the airlines', locked: true })
  })

  it('keeps a locked task even when the model dropped its capability', () => {
    const s = fresh()
    applyEeg(s, output(), retrieved)
    s.evaluation.eegs[0]!.criticalTasks[0]!.locked = true
    const again = output({
      eegs: [
        {
          capability: 'cybersecurity',
          target: 'IT isolates the host.',
          criticalTasks: [task(), task({ task: 'b' }), task({ task: 'c' })],
        },
      ],
    })
    applyEeg(s, again, retrieved)
    expect(s.evaluation.eegs.map((e) => e.capability)).toEqual([
      'cybersecurity',
      'operational_coordination',
    ])
    expect(s.evaluation.eegs[1]).toMatchObject({ target: 'Ops and IT decide together.' })
    expect(s.evaluation.eegs[1]?.criticalTasks).toHaveLength(1)
  })

  it('drops an EEG that lost every task and ignores a repeated capability', () => {
    const s = fresh()
    const out = output()
    for (const t of out.eegs[0]!.criticalTasks) t.citation = 'C7'
    out.eegs.push({ ...out.eegs[0]!, target: 'again' })
    applyEeg(s, out, retrieved)
    expect(s.evaluation.eegs).toEqual([])
    expect(s.evaluation.objectiveCapabilities).toHaveLength(2)
  })
})
