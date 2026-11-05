// Seats, students, reflections and time multipliers on the controller (#724, #739).
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Survey } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))

const { createProject } = await import('../project/store')
const store = await import('./store')
const { setAccommodation } = await import('./accommodations')
const live = await import('./live')

async function ready() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const { path: root } = await createProject({
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-live-')),
    name: 'Course',
  })
  await store.setClassroomEnabled(root, true)
  await store.updateClassroomFile(root, 'course', (f) => {
    f.sections = [{ id: 'a', name: 'A' }]
  })
  await store.addStudents(root, 'a', [{ name: 'Ada Lovelace' }, { name: 'Bo Peep' }])
  const [ada, bo] = (await store.readCourse(root)).students
  await store.updateClassroomFile(root, 'course', (f) => {
    f.sessions = [
      { scenarioId: 'scn', sectionId: 'a', practice: false, seats: { ic: ada!.id }, rubricIds: [] },
    ]
  })
  return { root, ada: ada!, bo: bo! }
}

describe('seats and students', () => {
  it('maps a seat by the session seat table, then by an exact display name', async () => {
    const { root, ada, bo } = await ready()
    expect(await live.studentForSeat(root, 'scn', { roleId: 'ic' })).toBe(ada.id)
    expect(await live.studentForSeat(root, 'scn', { roleId: 'x', displayName: ' bo peep ' })).toBe(
      bo.id,
    )
    expect(
      await live.studentForSeat(root, 'scn', { roleId: 'x', displayName: 'Bo' }),
    ).toBeUndefined()
  })

  it('offers no roster and no attribution when Classroom is off', async () => {
    const { root } = await ready()
    await store.setClassroomEnabled(root, false)
    expect(await live.classroomStudentsFor(root, 'scn')).toEqual([])
    expect(await live.studentForSeat(root, 'scn', { roleId: 'ic' })).toBeUndefined()
  })

  it('lists the seated students for the evaluator picker', async () => {
    const { root, ada } = await ready()
    expect(await live.classroomStudentsFor(root, 'scn')).toEqual([
      { id: ada.id, name: 'Ada Lovelace' },
    ])
  })
})

describe('time multiplier', () => {
  it('applies only to the seat of the student with the accommodation', async () => {
    const { root, ada } = await ready()
    await setAccommodation(root, {
      studentId: ada.id,
      timeMultiplier: 1.5,
      responseMethod: 'default',
      packet: 'standard',
      breaks: false,
      quieterRole: false,
      note: '',
    })
    expect(await live.timeMultiplierForSeat(root, 'scn', { roleId: 'ic' })).toBe(1.5)
    expect(
      await live.timeMultiplierForSeat(root, 'scn', { roleId: 'other', displayName: 'Bo Peep' }),
    ).toBe(1)
  })
})

describe('reflection', () => {
  const survey = Survey.parse({
    id: 'REFLECT',
    title: 'Reflection',
    classroomReflection: true,
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    sections: [
      { id: 's', questions: [{ id: 't1', type: 'text', text: 'What would you change?' }] },
    ],
  })
  const response = (text: string) =>
    ({
      id: 'r1',
      surveyId: 'REFLECT',
      channel: 'live',
      at: '2026-11-05T00:00:00.000Z',
      answers: { t1: text },
      otherText: {},
    }) as never

  it('is stored for the seat’s student and replaced by a changed answer', async () => {
    const { root, ada } = await ready()
    expect(
      await live.recordReflection(root, 'scn', { roleId: 'ic' }, survey, response('Ask earlier')),
    ).toBe(true)
    await live.recordReflection(
      root,
      'scn',
      { roleId: 'ic' },
      survey,
      response('Call the county first'),
    )
    const { evidence } = await store.readClassroomFile(root, 'evidence')
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ kind: 'reflection', studentId: ada.id })
    expect(evidence[0]!.note).toContain('Call the county first')
  })

  it('is not stored when the seat matches nobody', async () => {
    const { root } = await ready()
    expect(await live.recordReflection(root, 'scn', { roleId: 'zz' }, survey, response('x'))).toBe(
      false,
    )
    expect((await store.readClassroomFile(root, 'evidence')).evidence).toEqual([])
  })
})
