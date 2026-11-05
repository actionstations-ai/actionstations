import { describe, expect, it } from 'vitest'
import { Observation } from './evaluation'
import {
  ClassroomRubric,
  ClassroomRubricCriterion,
  ClassroomCourseFile,
  Student,
} from './classroom'
import { Project } from './project'

const level = (points: number) => ({ label: `L${points}`, descriptor: '', points })

describe('classroom schemas', () => {
  it('keeps Classroom off when the project does not say otherwise', () => {
    const project = Project.parse({
      id: 'p1',
      name: 'Course',
      appVersion: '0.7.1',
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T00:00:00.000Z',
    })
    expect(project.classroom).toBeUndefined()
  })

  it('accepts an optional student id on an observation but defaults to none', () => {
    const base = { id: 'O-1', at: '2026-11-04T00:00:00.000Z', rating: 'met' }
    expect(Observation.parse(base).studentId).toBeUndefined()
    expect(Observation.parse({ ...base, studentId: 'S1' }).studentId).toBe('S1')
  })

  it('needs three to six levels per criterion', () => {
    const criterion = (levels: unknown[]) =>
      ClassroomRubricCriterion.safeParse({ id: 'c1', name: 'Communication', levels })
    expect(criterion([level(0), level(1)]).success).toBe(false)
    expect(criterion([level(0), level(1), level(2)]).success).toBe(true)
    expect(criterion([0, 1, 2, 3, 4, 5, 6].map(level)).success).toBe(false)
  })

  it('needs at least one criterion in a rubric', () => {
    expect(
      ClassroomRubric.safeParse({ id: 'r', name: 'R', role: 'team', criteria: [] }).success,
    ).toBe(false)
  })

  it('keeps only the roster fields a student may have', () => {
    const parsed = Student.parse({ id: 's', sectionId: 'a', name: 'Ada', gpa: 4 })
    expect(parsed).not.toHaveProperty('gpa')
  })

  it('keeps unknown keys of a newer build in the course file', () => {
    const file = ClassroomCourseFile.parse({ updatedAt: '2026-11-04T00:00:00.000Z', future: 1 })
    expect((file as Record<string, unknown>).future).toBe(1)
  })
})
