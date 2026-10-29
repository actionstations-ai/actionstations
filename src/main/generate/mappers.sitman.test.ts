import { describe, expect, it } from 'vitest'
import { Scenario, type SitManOutput } from '@shared/schemas'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applySitMan } from './mappers'
import type { RetrievedChunk } from './retrieval'

const scenario = (): Scenario =>
  Scenario.parse(
    JSON.parse(readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
  )

const chunk: RetrievedChunk = {
  key: 'C1',
  hit: {
    documentId: 'tirp',
    documentTitle: 'TIRP',
    headingPath: 'TIRP › 13.6 FIDS / BHS System Failure',
    text: 'When FIDS fails, deploy whiteboard teams.',
    chunkId: 7,
    score: 1,
  } as RetrievedChunk['hit'],
}

const question = (
  over: Partial<SitManOutput['modules'][number]['discussionQuestions'][number]>,
) => ({
  text: 'Ops: when do the screens go dark?',
  roleKeys: ['ops-director'],
  objectiveRef: 'Decision Making',
  citations: ['C1'],
  ...over,
})

const output = (modules: SitManOutput['modules']): SitManOutput => ({
  assumptions: ['No-fault environment.', 'Plausible scenario.', 'Players follow the plans.'],
  artificialities: ['Time jumps.', 'SimCell plays the outside world.'],
  modules,
})

const mod = (phase: number, qs = [question({})]) => ({
  phase,
  narrativeMd: ` It is ${8 + phase}:00. `,
  keyIssues: ['One', ' Two '],
  discussionQuestions: qs,
})

describe('applySitMan (#420)', () => {
  it('maps phase numbers, role keys and citation keys', () => {
    const s = scenario()
    const r = applySitMan(s, output([mod(1), mod(2)]), [chunk])
    expect(s.sitman?.modules.map((m) => m.phaseId)).toEqual(['p1', 'p2'])
    const m = s.sitman!.modules[0]!
    expect(m.narrativeMd).toBe('It is 9:00.')
    expect(m.keyIssues).toEqual(['One', 'Two'])
    expect(m.discussionQuestions[0]).toMatchObject({
      roleIds: ['ops-director'],
      objectiveRef: 'Decision Making',
      citations: [{ headingPath: 'TIRP › 13.6 FIDS / BHS System Failure', chunkId: 7 }],
    })
    expect(r).toEqual({ dropped: [], unknownPhases: [], unknownRoles: [] })
    expect(s.sitman?.assumptions).toHaveLength(3)
  })

  it('drops unknown phases, reports unknown roles and unshown citation keys', () => {
    const s = scenario()
    const r = applySitMan(
      s,
      output([mod(9), mod(1, [question({ roleKeys: ['nobody'], citations: ['C42'] })])]),
      [chunk],
    )
    expect(s.sitman?.modules).toHaveLength(1)
    expect(r.unknownPhases).toEqual([9])
    expect(r.unknownRoles).toEqual(['nobody'])
    expect(r.dropped).toEqual([{ keys: ['C42'] }])
    expect(s.sitman!.modules[0]!.discussionQuestions[0]!.citations).toEqual([])
  })

  it('keeps modules in phase order and the first module per phase', () => {
    const s = scenario()
    applySitMan(s, output([mod(3), mod(1), { ...mod(1), narrativeMd: 'second' }]), [])
    expect(s.sitman?.modules.map((m) => m.phaseId)).toEqual(['p1', 'p3'])
    expect(s.sitman!.modules[0]!.narrativeMd).not.toBe('second')
  })

  it('addressing "all" leaves the role list empty', () => {
    const s = scenario()
    applySitMan(s, output([mod(1, [question({ roleKeys: ['all'] })])]), [])
    expect(s.sitman!.modules[0]!.discussionQuestions[0]!.roleIds).toEqual([])
  })
})
