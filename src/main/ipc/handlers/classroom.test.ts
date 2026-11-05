// Integration: Classroom mode through the IPC dispatcher against a real project folder
// (ADR-0090): the setting, the roster, student-linked observations and what never leaves.
import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))

const { dispatch } = await import('../registry')
const classroom = (await import('./classroom')).default
const evaluation = (await import('./evaluation')).default
const { createProject } = await import('../../project/store')
const { createScenario } = await import('../../scenario/store')
const { duplicateProject, isDerivedPath } = await import('../../project/duplicate')
const { ScenarioBrief } = await import('@shared/schemas')

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-class-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'Course' })
  const created = await createScenario(projectPath, {
    title: 'Run',
    brief: ScenarioBrief.parse({}),
  })
  return { projectPath, scenarioId: created.id, parent }
}

const call = (channel: string, req: object) =>
  dispatch({ ...classroom, ...evaluation } as never, channel as never, req)

async function ready() {
  const ctx = await setup()
  await call('classroom:set-enabled', { projectPath: ctx.projectPath, enabled: true })
  await call('classroom:set-course', {
    projectPath: ctx.projectPath,
    name: 'EM 301',
    term: 'Fall',
    sections: [{ name: 'Section A' }],
  })
  const got = await call('classroom:get', { projectPath: ctx.projectPath })
  const course = (got as { data: { course: { sections: { id: string }[] } } }).data.course
  return { ...ctx, sectionId: course.sections[0]!.id }
}

const observation = (studentId?: string) => ({
  id: 'O-1',
  at: '2026-10-28T14:00:00.000Z',
  criterionId: 'T-01',
  rating: 'met',
  note: 'Called the county.',
  source: 'facilitate',
  ...(studentId ? { studentId } : {}),
})

describe('classroom mode', () => {
  it('is off by default and refuses roster work until it is turned on', async () => {
    const { projectPath } = await setup()
    const got = await call('classroom:get', { projectPath })
    expect(got).toMatchObject({ ok: true, data: { enabled: false } })
    const add = await call('classroom:add-student', { projectPath, sectionId: 'x', name: 'Ada' })
    expect(add).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('records the notice when turned on and keeps the first acceptance time', async () => {
    const { projectPath } = await setup()
    const on = await call('classroom:set-enabled', { projectPath, enabled: true })
    const first = (on as { data: { noticeAcceptedAt: string } }).data.noticeAcceptedAt
    expect(first).toBeTruthy()
    await call('classroom:set-enabled', { projectPath, enabled: false })
    const again = await call('classroom:set-enabled', { projectPath, enabled: true })
    expect(again).toMatchObject({ data: { enabled: true, noticeAcceptedAt: first } })
  })

  it('imports a roster, discards unknown columns and skips duplicate identifiers', async () => {
    const { projectPath, sectionId } = await ready()
    const csv =
      'Name,Student ID,Email,GPA\nAda Lovelace,1001,ada@example.edu,3.9\nGrace Hopper,1002,,4\nAda Again,1001,,\n,1003,,\n'
    const preview = await call('classroom:roster-preview', { projectPath, sectionId, csv })
    expect(preview).toMatchObject({
      ok: true,
      data: {
        rows: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }],
        ignoredColumns: ['gpa'],
        skipped: [
          { line: 4, reason: 'Already on the roster' },
          { line: 5, reason: 'No name' },
        ],
      },
    })
    const done = await call('classroom:roster-import', { projectPath, sectionId, csv })
    const students = (done as { data: { course: { students: object[] } } }).data.course.students
    expect(students).toHaveLength(2)
    expect(JSON.stringify(students)).not.toContain('3.9')
  })

  it('refuses a roster file with no name column', async () => {
    const { projectPath, sectionId } = await ready()
    const r = await call('classroom:roster-preview', { projectPath, sectionId, csv: 'id\n1\n' })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })
})

describe('student-linked observations', () => {
  it('rejects a student id while Classroom mode is off', async () => {
    const { projectPath, scenarioId } = await setup()
    const r = await call('evaluation:observe', {
      projectPath,
      scenarioId,
      observation: observation('S1'),
    })
    expect(r).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('stores the link in classroom/ and never writes the id to evaluation.json', async () => {
    const { projectPath, scenarioId, sectionId } = await ready()
    const added = await call('classroom:add-student', { projectPath, sectionId, name: 'Ada' })
    const studentId = (added as { data: { course: { students: { id: string }[] } } }).data.course
      .students[0]!.id
    const saved = await call('evaluation:observe', {
      projectPath,
      scenarioId,
      observation: observation(studentId),
    })
    expect(saved).toMatchObject({ ok: true, data: { observations: [{ id: 'O-1' }] } })
    const evalFile = readFileSync(
      join(projectPath, 'scenarios', scenarioId, 'evaluation.json'),
      'utf8',
    )
    expect(evalFile).not.toContain(studentId)
    const evidence = readFileSync(join(projectPath, 'classroom', 'evidence.json'), 'utf8')
    expect(evidence).toContain(studentId)
    expect(evidence).toContain('"observationId": "O-1"')
    await call('evaluation:remove', { projectPath, scenarioId, observationId: 'O-1' })
    expect(readFileSync(join(projectPath, 'classroom', 'evidence.json'), 'utf8')).not.toContain(
      studentId,
    )
  })

  it('refuses a student who is not on the roster', async () => {
    const { projectPath, scenarioId } = await ready()
    const r = await call('evaluation:observe', {
      projectPath,
      scenarioId,
      observation: observation('Nobody'),
    })
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('keeps an anonymous observation anonymous when Classroom is on', async () => {
    const { projectPath, scenarioId } = await ready()
    const r = await call('evaluation:observe', {
      projectPath,
      scenarioId,
      observation: observation(),
    })
    expect(r).toMatchObject({ ok: true })
    expect(existsSync(join(projectPath, 'classroom', 'evidence.json'))).toBe(false)
  })
})

describe('deleting and sharing', () => {
  it('removes every record about a student in one call', async () => {
    const { projectPath, scenarioId, sectionId } = await ready()
    const added = await call('classroom:add-student', { projectPath, sectionId, name: 'Ada' })
    const studentId = (added as { data: { course: { students: { id: string }[] } } }).data.course
      .students[0]!.id
    await call('evaluation:observe', {
      projectPath,
      scenarioId,
      observation: observation(studentId),
    })
    await call('classroom:set-session', {
      projectPath,
      session: {
        scenarioId,
        sectionId,
        practice: false,
        seats: { 'seat-1': studentId },
        rubricIds: [],
      },
    })
    const gone = await call('classroom:delete-students', { projectPath, studentIds: [studentId] })
    expect(gone).toMatchObject({ ok: true, data: { course: { students: [] } } })
    for (const file of ['course', 'evidence', 'scores', 'accommodations']) {
      const path = join(projectPath, 'classroom', `${file}.json`)
      if (existsSync(path)) expect(readFileSync(path, 'utf8')).not.toContain(studentId)
    }
  })

  it('leaves the classroom folder out of a duplicated project and a pack export', async () => {
    const { projectPath, parent, sectionId } = await ready()
    await call('classroom:add-student', { projectPath, sectionId, name: 'Ada' })
    expect(existsSync(join(projectPath, 'classroom', 'course.json'))).toBe(true)
    const copy = await duplicateProject(projectPath, { newName: 'Shared copy', parentDir: parent })
    expect(existsSync(join(copy.path, 'classroom'))).toBe(false)
    expect(isDerivedPath('classroom/course.json')).toBe(true)
    expect(readFileSync(join(projectPath, '.gitignore'), 'utf8')).toContain('classroom/')
  })

  it('cannot remove a section that still has students', async () => {
    const { projectPath, sectionId } = await ready()
    await call('classroom:add-student', { projectPath, sectionId, name: 'Ada' })
    const r = await call('classroom:set-course', {
      projectPath,
      name: 'EM 301',
      term: '',
      sections: [],
    })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })
})
