// The AAR/IP shipped with the airport example (#559): the recorded run of Flight to Nowhere,
// the draft the app made from it, and the ratings a person confirmed. The website's outputs row
// exports its page from this, so it must load and agree with the record it was drafted from.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Aar } from '@shared/schemas/aar'
import { EvaluationRecord } from '@shared/schemas/evaluation'
import { Scenario } from '@shared/schemas/scenario'
import { FacilitatorState } from '@shared/ipc/facilitator'
import {
  reviewDraft,
  recordedRun,
  recordTime,
  type RecordedRun,
} from '../../scripts/make-example.mjs'

const EXAMPLE = resolve(__dirname, '../../examples/airport-ncia')
const SCENARIO = join(EXAMPLE, 'project/scenarios/01M5HX52XAMK7TGTH69SFTTJRG')
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))
const record = readJson(join(EXAMPLE, 'record/flight-to-nowhere.json')) as RecordedRun

describe('recorded run of Flight to Nowhere', () => {
  const run = recordedRun(record)

  it('turns exercise clock times into times on the exercise day', () => {
    expect(recordTime('2026-03-12', '1:30')).toBe('2026-03-12T10:30:00.000Z')
  })

  it('delivers every MSEL row of the scenario', () => {
    const scenario = Scenario.parse(readJson(join(SCENARIO, 'scenario.json')))
    expect(Object.keys(run.state.delivered)).toEqual(scenario.msel.map((r) => r.id))
  })

  it('rates only critical tasks that exist in the scenario EEGs', () => {
    const scenario = Scenario.parse(readJson(join(SCENARIO, 'scenario.json')))
    const tasks = new Set(
      scenario.evaluation!.eegs.flatMap((e) => e.criticalTasks.map((t) => t.id)),
    )
    for (const o of run.observations) if (o.taskId) expect(tasks.has(o.taskId)).toBe(true)
  })

  it('names roles by id and never a person', () => {
    const scenario = Scenario.parse(readJson(join(SCENARIO, 'scenario.json')))
    const roles = new Set(scenario.roles.map((r) => r.id))
    for (const d of run.state.decisions) expect(roles.has(d.byRole ?? '')).toBe(true)
  })
})

describe('reviewDraft', () => {
  const finding = (title: string, evidence: string[]) => ({ title, evidence })
  const draft = {
    capabilities: [
      {
        capability: 'cybersecurity',
        proposedRating: 'P',
        strengths: [finding('Fast', ['obs:a', 'hw:b'])],
        areasForImprovement: [],
      },
      { capability: 'other', strengths: [], areasForImprovement: [] },
    ],
  }

  it('confirms ratings, sets the date and drops only the named evidence refs', () => {
    const reviewed = reviewDraft(draft, {
      date: '2026-03-12',
      ratings: { cybersecurity: 'S' },
      dropEvidence: [{ capability: 'cybersecurity', title: 'Fast', ref: 'hw:b' }],
    })
    expect(reviewed.exerciseDate).toBe('2026-03-12')
    expect(reviewed.capabilities[0]!.rating).toBe('S')
    expect(reviewed.capabilities[0]!.proposedRating).toBe('P')
    expect(reviewed.capabilities[0]!.strengths[0]!.evidence).toEqual(['obs:a'])
    expect(reviewed.capabilities[1]!).not.toHaveProperty('rating')
  })
})

describe('shipped AAR/IP', () => {
  const aar = Aar.parse(readJson(join(SCENARIO, 'aar.json')))
  const facilitator = FacilitatorState.parse(readJson(join(SCENARIO, 'facilitator.json')))
  const evaluation = EvaluationRecord.parse(readJson(join(SCENARIO, 'evaluation.json')))

  it('is registered as the scenario document and the file is there', () => {
    const scenario = Scenario.parse(readJson(join(SCENARIO, 'scenario.json')))
    expect(scenario.documents.aar).toBeTruthy()
    expect(existsSync(join(EXAMPLE, 'project', scenario.documents.aar!))).toBe(true)
  })

  it('has a confirmed rating for every Core Capability exercised', () => {
    expect(aar.capabilities).toHaveLength(6)
    for (const c of aar.capabilities) expect(c.rating, c.capability).toBeDefined()
    expect(aar.exerciseDate).toBe(record.date)
  })

  it('keeps ratings that match the evidence: a not-met observation is never rated P', () => {
    for (const c of aar.capabilities) {
      if (c.observationCounts.not_met > 0) expect(c.rating, c.capability).not.toBe('P')
    }
  })

  it('rests every finding on evidence that exists in the recorded run', () => {
    const known = new Set([
      ...evaluation.observations.map((o) => `obs:${o.id}`),
      ...facilitator.hotwash.map((h) => `hw:${h.id}`),
      ...facilitator.decisions.map((d) => `dec:${d.id}`),
      ...Object.keys(facilitator.notes).map((r) => `note:${r}`),
      'note:general',
    ])
    for (const c of aar.capabilities)
      for (const f of [...c.strengths, ...c.areasForImprovement]) {
        expect(f.evidence.length, f.title).toBeGreaterThan(0)
        for (const e of f.evidence) expect(known.has(e) || e.startsWith('log:'), e).toBe(true)
      }
  })

  it('gives each area for improvement a corrective action with no invented owner or date', () => {
    for (const c of aar.capabilities)
      for (const f of c.areasForImprovement) {
        expect(f.correctiveActions.length, f.title).toBeGreaterThan(0)
        for (const a of f.correctiveActions) {
          expect(a.dueDate).toBeUndefined()
          expect(a.poc).toBe('')
        }
      }
  })

  it('renders the document without the evacuation-checklist citation or a date placeholder', () => {
    const md = readFileSync(join(SCENARIO, 'documents/aar.md'), 'utf8')
    expect(md).not.toContain('TIRP 3.5')
    expect(md).not.toContain('[Date]')
    expect(md).toContain('Appendix A: Improvement Plan')
  })
})
