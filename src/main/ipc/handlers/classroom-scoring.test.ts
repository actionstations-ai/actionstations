// Integration: evidence, scoring and rotation through the IPC dispatcher (#724, #727, #730).
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))

const { dispatch } = await import('../registry')
const scoring = (await import('./classroom-scoring')).default
const curriculum = (await import('./classroom-curriculum')).default
const classroom = (await import('./classroom')).default
const { createProject } = await import('../../project/store')

const call = (channel: string, req: object) =>
  dispatch({ ...classroom, ...curriculum, ...scoring } as never, channel as never, req)
const data = <T>(r: unknown) => (r as { data: T }).data

type View = {
  students: {
    studentId: string
    cells: {
      rubricId: string
      criterionId: string
      level: number | null
      fromTeam: boolean
      suggestedLevel: number | null
      basis: string
    }[]
    totals: { rubricId: string; points: number; maxPoints: number; fraction: number | null }[]
    unlinked: { id: string; kind: string; count: number }[]
  }[]
  team: { criterionId: string; level: number | null }[]
}

async function ready() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-score-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'Course' })
  await call('classroom:set-enabled', { projectPath, enabled: true })
  await call('classroom:set-course', {
    projectPath,
    name: 'EM',
    term: '',
    sections: [{ name: 'A' }],
  })
  const sectionId = data<{ course: { sections: { id: string }[] } }>(
    await call('classroom:get', { projectPath }),
  ).course.sections[0]!.id
  await call('classroom:roster-import', {
    projectPath,
    sectionId,
    csv: 'name,id\nAda,1\nBo,2\nCy,3\nDee,4\n',
  })
  await call('classroom:add-starter-rubrics', { projectPath })
  const students = data<{ course: { students: { id: string; name: string }[] } }>(
    await call('classroom:get', { projectPath }),
  ).course.students
  const id = Object.fromEntries(students.map((s) => [s.name, s.id])) as Record<string, string>
  return { projectPath, sectionId, id, scenarioId: 'scn1' }
}

const evidence = (scenarioId: string, studentId: string, levelIndex: number) => ({
  kind: 'observation',
  scenarioId,
  studentId,
  rubricId: 'starter-player-role',
  criterionId: 'communication',
  levelIndex,
  note: `level ${levelIndex}`,
  count: 1,
})

describe('scoring', () => {
  it('suggests a level from evidence, keeps the instructor choice and totals it', async () => {
    const { projectPath, id, scenarioId } = await ready()
    for (const level of [3, 2, 0])
      await call('classroom:evidence-add', {
        projectPath,
        evidence: evidence(scenarioId, id.Ada!, level),
      })
    const view = data<View>(await call('classroom:scoring-view', { projectPath, scenarioId }))
    const cell = view.students
      .find((s) => s.studentId === id.Ada)!
      .cells.find((c) => c.rubricId === 'starter-player-role' && c.criterionId === 'communication')!
    expect(cell.suggestedLevel).toBe(2)
    expect(cell.basis).toMatch(/2 of 3/)
    expect(cell.level).toBeNull() // a suggestion is not a score
    const set = data<View>(
      await call('classroom:set-score', {
        projectPath,
        scenarioId,
        studentId: id.Ada,
        rubricId: 'starter-player-role',
        criterionId: 'communication',
        levelIndex: 3,
        comment: 'Clear and confirmed.',
      }),
    )
    const total = set.students
      .find((s) => s.studentId === id.Ada)!
      .totals.find((t) => t.rubricId === 'starter-player-role')!
    expect(total.points).toBe(3) // weight 1 x 3 points
    const cleared = data<View>(
      await call('classroom:clear-score', {
        projectPath,
        scenarioId,
        studentId: id.Ada,
        rubricId: 'starter-player-role',
        criterionId: 'communication',
      }),
    )
    expect(cleared.students.find((s) => s.studentId === id.Ada)!.totals[0]!.fraction).toBeNull()
  })

  it('gives every member the team score unless the instructor sets one apart', async () => {
    const { projectPath, id, scenarioId } = await ready()
    const base = {
      projectPath,
      scenarioId,
      rubricId: 'starter-team',
      criterionId: 'coordination',
      comment: '',
    }
    await call('classroom:set-score', { ...base, studentId: 'team', levelIndex: 2 })
    const view = data<View>(
      await call('classroom:set-score', { ...base, studentId: id.Bo, levelIndex: 0 }),
    )
    const level = (name: string) =>
      view.students
        .find((s) => s.studentId === id[name])!
        .cells.find((c) => c.rubricId === 'starter-team' && c.criterionId === 'coordination')!
    expect(level('Ada')).toMatchObject({ level: 2, fromTeam: true })
    expect(level('Bo')).toMatchObject({ level: 0, fromTeam: false })
    expect(view.team.find((c) => c.criterionId === 'coordination')!.level).toBe(2)
  })

  it('counts hot wash contributions with one tap each and offers them for linking', async () => {
    const { projectPath, id, scenarioId } = await ready()
    await call('classroom:hotwash-tally', {
      projectPath,
      scenarioId,
      studentId: id.Cy,
      note: 'asked about the plan',
    })
    const tally = data<{ id: string; count: number }>(
      await call('classroom:hotwash-tally', { projectPath, scenarioId, studentId: id.Cy }),
    )
    expect(tally.count).toBe(2)
    const view = data<View>(await call('classroom:scoring-view', { projectPath, scenarioId }))
    expect(view.students.find((s) => s.studentId === id.Cy)!.unlinked).toHaveLength(1)
    await call('classroom:evidence-link', {
      projectPath,
      evidenceId: tally.id,
      rubricId: 'starter-player-role',
      criterionId: 'communication',
    })
    const after = data<View>(await call('classroom:scoring-view', { projectPath, scenarioId }))
    expect(after.students.find((s) => s.studentId === id.Cy)!.unlinked).toHaveLength(0)
  })

  it('refuses an unknown student, an out-of-range level and an unknown criterion', async () => {
    const { projectPath, id, scenarioId } = await ready()
    const bad = await call('classroom:evidence-add', {
      projectPath,
      evidence: evidence(scenarioId, 'ghost', 1),
    })
    expect(bad).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    const level = await call('classroom:set-score', {
      projectPath,
      scenarioId,
      studentId: id.Ada,
      rubricId: 'starter-team',
      criterionId: 'coordination',
      levelIndex: 5,
      comment: '',
    })
    expect(level).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    const crit = await call('classroom:set-score', {
      projectPath,
      scenarioId,
      studentId: id.Ada,
      rubricId: 'starter-team',
      criterionId: 'nope',
      levelIndex: 1,
      comment: '',
    })
    expect(crit).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('removes a student’s evidence and scores when the student is deleted', async () => {
    const { projectPath, id, scenarioId } = await ready()
    await call('classroom:evidence-add', {
      projectPath,
      evidence: evidence(scenarioId, id.Dee!, 2),
    })
    await call('classroom:set-score', {
      projectPath,
      scenarioId,
      studentId: id.Dee,
      rubricId: 'starter-player-role',
      criterionId: 'communication',
      levelIndex: 2,
      comment: '',
    })
    await call('classroom:delete-students', { projectPath, studentIds: [id.Dee] })
    expect(
      data<unknown[]>(await call('classroom:evidence-list', { projectPath, scenarioId })),
    ).toEqual([])
  })
})

describe('rotation', () => {
  it('plans roles for a section and saves the plan', async () => {
    const { projectPath, sectionId } = await ready()
    const roles = ['IC', 'PIO', 'Analyst', 'Evaluator']
    const r = data<{
      plan: { sessions: { assignments: Record<string, string> }[] }
      problems: string[]
    }>(await call('classroom:rotation-plan', { projectPath, sectionId, roles, sessions: 4 }))
    expect(r.problems).toEqual([])
    expect(r.plan.sessions).toHaveLength(4)
    const saved = data<{ course: { rotations: unknown[] } }>(
      await call('classroom:get', { projectPath }),
    )
    expect(saved.course.rotations).toHaveLength(1)
    const few = data<{ problems: string[] }>(
      await call('classroom:rotation-plan', {
        projectPath,
        sectionId,
        roles: [...roles, 'Scribe', 'Liaison'],
        sessions: 1,
      }),
    )
    expect(few.problems[0]).toMatch(/at least 6 students/)
  })

  it('keeps editable reflection prompts between two and five', async () => {
    const { projectPath } = await ready()
    const ok = await call('classroom:set-reflection-prompts', {
      projectPath,
      prompts: ['One?', 'Two?'],
    })
    expect(ok).toMatchObject({
      ok: true,
      data: { course: { reflectionPrompts: ['One?', 'Two?'] } },
    })
    const bad = await call('classroom:set-reflection-prompts', { projectPath, prompts: ['One?'] })
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })
})

describe('reflection survey', () => {
  it('is built from the prompts and marked as not anonymous', async () => {
    const { projectPath } = await ready()
    const { createScenario } = await import('../../scenario/store')
    const { ScenarioBrief } = await import('@shared/schemas')
    const { readSurvey } = await import('../../surveys/store')
    const scn = await createScenario(projectPath, { title: 'Run', brief: ScenarioBrief.parse({}) })
    await call('classroom:set-reflection-prompts', { projectPath, prompts: ['One?', 'Two?'] })
    const r = data<{ surveyId: string }>(
      await call('classroom:reflection-survey', { projectPath, scenarioId: scn.id }),
    )
    const survey = await readSurvey(projectPath, scn.id, r.surveyId)
    expect(survey.classroomReflection).toBe(true)
    expect(survey.sections[0]!.questions.map((q) => q.text)).toEqual(['One?', 'Two?'])
    expect(survey.introMd).toMatch(/with your name/)
  })
})
