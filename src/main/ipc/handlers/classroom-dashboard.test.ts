// Integration: gradebook CSV, dashboard and accommodations (#733, #736, #739).
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))

const { dispatch } = await import('../registry')
const handlers = {
  ...(await import('./classroom')).default,
  ...(await import('./classroom-curriculum')).default,
  ...(await import('./classroom-scoring')).default,
  ...(await import('./classroom-dashboard')).default,
}
const { createProject } = await import('../../project/store')

const call = (channel: string, req: object) => dispatch(handlers as never, channel as never, req)
const data = <T>(r: unknown): T => {
  const x = r as { ok: boolean; data: T; error?: unknown }
  if (!x.ok) throw new Error(JSON.stringify(x.error))
  return x.data
}

async function ready() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-dash-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'Course' })
  await call('classroom:set-enabled', { projectPath, enabled: true })
  await call('classroom:set-course', {
    projectPath,
    name: 'EM',
    term: '',
    sections: [{ name: 'A' }],
  })
  const get = () =>
    data<{ course: { sections: { id: string }[]; students: { id: string; name: string }[] } }>(
      call('classroom:get', { projectPath }) as never,
    )
  const sectionId = data<{ course: { sections: { id: string }[] } }>(
    await call('classroom:get', { projectPath }),
  ).course.sections[0]!.id
  await call('classroom:set-outcomes', {
    projectPath,
    outcomes: [{ code: 'LO1', text: 'Communicate incident information to partners' }],
  })
  await call('classroom:add-starter-rubrics', { projectPath })
  // Link the player rubric's communication criterion to LO1.
  const course = data<{ course: { outcomes: { id: string }[]; rubrics: { id: string }[] } }>(
    await call('classroom:get', { projectPath }),
  ).course
  const player = course.rubrics.find((r) => r.id === 'starter-player-role') as never as {
    id: string
    criteria: { id: string; outcomeIds: string[] }[]
  }
  player.criteria.find((c) => c.id === 'communication')!.outcomeIds = [course.outcomes[0]!.id]
  await call('classroom:save-rubric', { projectPath, rubric: player })
  void get
  return { projectPath, sectionId }
}

async function roster(projectPath: string, sectionId: string, csv: string) {
  await call('classroom:roster-import', { projectPath, sectionId, csv })
  const c = data<{ course: { students: { id: string; name: string }[] } }>(
    await call('classroom:get', { projectPath }),
  ).course
  return Object.fromEntries(c.students.map((s) => [s.name, s.id])) as Record<string, string>
}

const score = (projectPath: string, scenarioId: string, studentId: string, levelIndex: number) =>
  call('classroom:set-score', {
    projectPath,
    scenarioId,
    studentId,
    rubricId: 'starter-player-role',
    criterionId: 'communication',
    levelIndex,
    comment: levelIndex === 3 ? '=cmd|bad' : 'ok',
  })

describe('gradebook export', () => {
  it('writes one row per student with escaped cells, warnings and no practice runs', async () => {
    const { projectPath, sectionId } = await ready()
    const id = await roster(projectPath, sectionId, 'name,id\n"=Ada",1\nBo,\nCy,3\n')
    const session = (scenarioId: string, practice: boolean) =>
      call('classroom:set-session', {
        projectPath,
        session: { scenarioId, sectionId, practice, seats: {}, rubricIds: ['starter-player-role'] },
      })
    await session('run1', false)
    await session('warmup', true)
    await score(projectPath, 'run1', id['=Ada']!, 3)
    await score(projectPath, 'run1', id.Bo!, 2)
    await score(projectPath, 'warmup', id.Cy!, 1)
    const out = data<{
      csv: string
      header: string[]
      rows: string[][]
      warnings: { kind: string; student?: string; scenario?: string }[]
    }>(
      await call('classroom:gradebook', {
        projectPath,
        sectionId,
        includeOutcomes: true,
        includeCriteria: false,
        includeComments: true,
      }),
    )
    expect(out.header).toEqual([
      'Student ID',
      'Student',
      'Email',
      'run1 (points)',
      'run1 comment',
      'Total points',
      'Outcome LO1 (%)',
    ])
    expect(out.rows).toEqual([
      ['1', '=Ada', '', '3', '=cmd|bad', '3', '100'],
      ['', 'Bo', '', '2', 'ok', '2', '66.7'],
      ['3', 'Cy', '', '', '', '', ''],
    ])
    // Spreadsheet formulas are neutralized in the file itself.
    expect(out.csv).toContain("'=Ada")
    expect(out.csv).toContain("'=cmd|bad")
    expect(out.warnings).toEqual(
      expect.arrayContaining([
        { kind: 'practice-excluded', scenario: 'warmup' },
        { kind: 'missing-id', student: 'Bo' },
        { kind: 'no-score', student: 'Cy', scenario: 'run1' },
      ]),
    )
    expect(out.csv.startsWith('﻿')).toBe(true)
  })

  it('adds a column per criterion when asked', async () => {
    const { projectPath, sectionId } = await ready()
    const id = await roster(projectPath, sectionId, 'name,id\nAda,1\n')
    await call('classroom:set-session', {
      projectPath,
      session: {
        scenarioId: 'run1',
        sectionId,
        practice: false,
        seats: {},
        rubricIds: ['starter-player-role'],
      },
    })
    await score(projectPath, 'run1', id.Ada!, 2)
    const out = data<{ header: string[]; rows: string[][] }>(
      await call('classroom:gradebook', { projectPath, sectionId, includeCriteria: true }),
    )
    expect(out.header).toContain('Player role - Communication (points) [run1]')
    expect(out.rows[0]).toContain('2')
  })
})

describe('dashboard', () => {
  it('reports attainment, distribution, practice runs, no-score students and participation', async () => {
    const { projectPath, sectionId } = await ready()
    const id = await roster(projectPath, sectionId, 'name,id\nAda,1\nBo,2\nCy,3\nDee,4\n')
    await call('classroom:set-session', {
      projectPath,
      session: {
        scenarioId: 'run1',
        sectionId,
        practice: false,
        seats: {},
        rubricIds: ['starter-player-role'],
      },
    })
    await call('classroom:set-session', {
      projectPath,
      session: {
        scenarioId: 'warmup',
        sectionId,
        practice: true,
        seats: {},
        rubricIds: ['starter-player-role'],
      },
    })
    await score(projectPath, 'run1', id.Ada!, 3) // 100% of the linked outcome
    await score(projectPath, 'run1', id.Bo!, 1) // 33%
    // Ada's rubric is scored on every criterion, so she is in the distribution; Bo's is not.
    for (const criterionId of [
      'decision-quality',
      'role-clarity',
      'use-of-plans',
      'situational-awareness',
    ])
      await call('classroom:set-score', {
        projectPath,
        scenarioId: 'run1',
        studentId: id.Ada,
        rubricId: 'starter-player-role',
        criterionId,
        levelIndex: 3,
        comment: '',
      })
    await score(projectPath, 'warmup', id.Cy!, 3) // practice: must not count
    for (let i = 0; i < 6; i++)
      await call('classroom:hotwash-tally', { projectPath, scenarioId: 'run1', studentId: id.Ada })
    await call('classroom:hotwash-tally', { projectPath, scenarioId: 'run1', studentId: id.Bo })
    await call('classroom:set-accommodation', {
      projectPath,
      accommodation: {
        studentId: id.Dee,
        timeMultiplier: 1.5,
        responseMethod: 'default',
        packet: 'standard',
        breaks: false,
        quieterRole: false,
        note: 'private note',
      },
    })
    const dash = data<{
      sections: {
        gradedRuns: number
        practiceRuns: number
        accommodations: number
        noScore: string[]
        participation: { belowHalfCount: number; rows: { name: string; count: number }[] }
        tables: { id: string; rows: string[][]; csv: string }[]
      }[]
    }>(await call('classroom:dashboard', { projectPath }))
    const s = dash.sections[0]!
    expect(s).toMatchObject({ gradedRuns: 1, practiceRuns: 1, accommodations: 1 })
    expect(s.noScore.sort()).toEqual(['Cy', 'Dee'])
    const attain = s.tables.find((t) => t.id.startsWith('attainment'))!
    // Threshold 60%: Ada (100%) attains, Bo (33%) does not; two students assessed.
    expect(attain.rows).toEqual([['LO1', '2', '1', '50%']])
    const dist = s.tables.find((t) => t.id.startsWith('distribution'))!
    expect(dist.rows.map((r) => r[1])).toEqual(['0', '0', '0', '0', '1'])
    expect(s.participation.rows.find((r) => r.name === 'Ada')!.count).toBe(6)
    // Even share is 25% of 7 contributions; Bo has 1 of 7 (ratio 0.57), Cy and Dee have none.
    expect(s.participation.belowHalfCount).toBe(2)
    // The dashboard never carries the accommodation note.
    expect(JSON.stringify(dash)).not.toContain('private note')
  })

  it('reports agreement when two evaluators rated the same student and criterion', async () => {
    const { projectPath, sectionId } = await ready()
    const id = await roster(projectPath, sectionId, 'name,id\nAda,1\nBo,2\nCy,3\n')
    await call('classroom:set-session', {
      projectPath,
      session: {
        scenarioId: 'run1',
        sectionId,
        practice: false,
        seats: {},
        rubricIds: ['starter-player-role'],
      },
    })
    const rate = (studentId: string, evaluator: string, levelIndex: number) =>
      call('classroom:evidence-add', {
        projectPath,
        evidence: {
          kind: 'observation',
          scenarioId: 'run1',
          studentId,
          criterionId: 'communication',
          rubricId: 'starter-player-role',
          levelIndex,
          evaluator,
          note: '',
          count: 1,
        },
      })
    for (const [who, a, b] of [
      [id.Ada!, 3, 3],
      [id.Bo!, 2, 3],
      [id.Cy!, 0, 2],
    ] as const) {
      await rate(who, 'Evaluator 1', a)
      await rate(who, 'Evaluator 2', b)
    }
    const dash = data<{
      reliability: {
        raters: number
        pairs: number
        exact: number
        withinOne: number
        kappa: number | null
        caveat: string | null
        lowest: { criterion: string }[]
      }
    }>(await call('classroom:dashboard', { projectPath }))
    expect(dash.reliability).toMatchObject({
      raters: 2,
      pairs: 3,
      caveat: expect.stringMatching(/unstable/),
    })
    expect(dash.reliability.exact).toBeCloseTo(1 / 3)
    expect(dash.reliability.withinOne).toBeCloseTo(2 / 3)
    expect(dash.reliability.lowest[0]!.criterion).toBe('Communication')
  })
})

describe('accommodations', () => {
  it('lists the adjustments of seated students for set-up and drops an empty record', async () => {
    const { projectPath, sectionId } = await ready()
    const id = await roster(projectPath, sectionId, 'name,id\nAda,1\nBo,2\n')
    await call('classroom:set-session', {
      projectPath,
      session: {
        scenarioId: 'run1',
        sectionId,
        practice: false,
        seats: { chair: id.Ada! },
        rubricIds: [],
      },
    })
    const acc = (studentId: string, over: object) => ({
      studentId,
      timeMultiplier: 1,
      responseMethod: 'default',
      packet: 'standard',
      breaks: false,
      quieterRole: false,
      note: '',
      ...over,
    })
    await call('classroom:set-accommodation', {
      projectPath,
      accommodation: acc(id.Ada!, { timeMultiplier: 1.5, packet: 'large_print' }),
    })
    await call('classroom:set-accommodation', {
      projectPath,
      accommodation: acc(id.Bo!, { breaks: true }),
    })
    const list = data<{ name: string; lines: string[] }[]>(
      await call('classroom:session-accommodations', { projectPath, scenarioId: 'run1' }),
    )
    expect(list).toHaveLength(1) // only the seated student
    expect(list[0]!.lines.join(' ')).toMatch(/1.5 times.*shared clock is unchanged/)
    expect(list[0]!.lines).toContain('Large-print packet')
    const cleared = data<unknown[]>(
      await call('classroom:set-accommodation', { projectPath, accommodation: acc(id.Bo!, {}) }),
    )
    expect(cleared).toHaveLength(1)
  })

  it('removes a deleted student’s accommodation', async () => {
    const { projectPath, sectionId } = await ready()
    const id = await roster(projectPath, sectionId, 'name,id\nAda,1\n')
    await call('classroom:set-accommodation', {
      projectPath,
      accommodation: {
        studentId: id.Ada,
        timeMultiplier: 2,
        responseMethod: 'written',
        packet: 'standard',
        breaks: false,
        quieterRole: false,
        note: '',
      },
    })
    await call('classroom:delete-students', { projectPath, studentIds: [id.Ada] })
    expect(data<unknown[]>(await call('classroom:accommodations', { projectPath }))).toEqual([])
  })
})
