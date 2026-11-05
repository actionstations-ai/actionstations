// @vitest-environment happy-dom
// Classroom (#718): off by default, the notice must be read before it turns on, and the roster
// screens have no axe violations.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import type { ClassroomState } from '@shared/ipc/classroom'
import { mockTtx, projectUrl, renderAt } from '../documents/test-utils'
import ClassroomPage from './ClassroomPage'

afterEach(cleanup)

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const violations = async () => (await axe.run(document.body, AXE)).violations.map((v) => v.id)

const state = (over: Partial<ClassroomState> = {}): ClassroomState => ({
  enabled: false,
  notice: 'Scores name students.',
  course: {
    formatVersion: 1,
    sections: [],
    students: [],
    outcomes: [],
    mappings: [],
    rubrics: [],
    sessions: [],
    rotations: [],
    reflectionPrompts: ['One', 'Two'],
    attainmentThreshold: 0.6,
    updatedAt: '2026-11-04T00:00:00.000Z',
  },
  ...over,
})

const open = () => renderAt(projectUrl('classroom'), '/p/:projectKey/classroom', ClassroomPage)

describe('ClassroomPage', () => {
  it('stays off until the notice is read, then turns on', async () => {
    const api = mockTtx({
      'classroom:get': () => state(),
      'classroom:set-enabled': () => state({ enabled: true }),
    })
    open()
    const turnOn = (await screen.findByRole('button', {
      name: 'Turn on Classroom mode',
    })) as HTMLButtonElement
    expect(turnOn.disabled).toBe(true)
    expect(screen.queryByText('Roster')).toBeNull()
    fireEvent.click(screen.getByLabelText('I have read this notice'))
    expect(turnOn.disabled).toBe(false)
    expect(await violations()).toEqual([])
    fireEvent.click(turnOn)
    await waitFor(() => expect(api.calls('classroom:set-enabled')).toHaveLength(1))
  })

  it('shows the course and roster when on, without violations', async () => {
    mockTtx({
      'classroom:get': () =>
        state({
          enabled: true,
          course: {
            ...state().course,
            course: { id: 'c1', name: 'EM 301', term: 'Fall' },
            sections: [{ id: 'a', name: 'Section A' }],
            students: [{ id: 's1', sectionId: 'a', name: 'Ada Lovelace', institutionId: '1001' }],
          },
        }),
    })
    open()
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Delete Ada Lovelace and all their records' }),
    ).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('lists rubrics and outcomes without violations and offers the starter rubrics', async () => {
    const level = (n: number) => ({ label: `L${n}`, descriptor: `Level ${n}`, points: n })
    mockTtx({
      'classroom:get': () =>
        state({
          enabled: true,
          course: {
            ...state().course,
            outcomes: [{ id: 'o1', code: 'LO1', text: 'Communicate', bloom: 'apply' }],
            rubrics: [
              {
                formatVersion: 1,
                id: 'r1',
                name: 'Team',
                role: 'team',
                source: '',
                criteria: [
                  {
                    id: 'c1',
                    name: 'Coordination',
                    description: '',
                    weight: 1,
                    levels: [level(0), level(1), level(2)],
                    outcomeIds: [],
                    taskIds: [],
                  },
                ],
              },
            ],
          },
        }),
      'scenarios:list': () => [],
    })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Team' }))
    expect(await screen.findByLabelText('Coordination level 1 label')).toBeTruthy()
    expect(await violations()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Add the starter rubrics' })).toBeTruthy()
    expect(screen.getByLabelText('Outcome 1 code')).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('shows a suggestion with its basis beside the score selector, without violations', async () => {
    const level = (n: number) => ({ label: `L${n}`, descriptor: '', points: n })
    const course = {
      ...state().course,
      sections: [{ id: 'a', name: 'A' }],
      students: [{ id: 's1', sectionId: 'a', name: 'Ada' }],
      rubrics: [
        {
          formatVersion: 1 as const,
          id: 'r1',
          name: 'Player',
          role: 'player',
          source: '',
          criteria: [
            {
              id: 'c1',
              name: 'Communication',
              description: '',
              weight: 1,
              levels: [level(0), level(1), level(2)],
              outcomeIds: [],
              taskIds: [],
            },
          ],
        },
      ],
    }
    const cell = {
      rubricId: 'r1',
      criterionId: 'c1',
      evidence: [],
      suggestedLevel: 1,
      basis: '2 of 3 pieces of evidence are at this level or higher.',
      level: null,
      fromTeam: false,
      overridden: false,
      comment: '',
    }
    mockTtx({
      'classroom:get': () => state({ enabled: true, course }),
      'scenarios:list': () => [
        { id: 'sc', title: 'Run', status: 'draft', updatedAt: '2026-11-04T00:00:00.000Z' },
      ],
      'classroom:scoring-view': () => ({
        scenarioId: 'sc',
        sectionId: 'a',
        practice: false,
        rubricIds: ['r1'],
        students: [
          {
            studentId: 's1',
            name: 'Ada',
            cells: [cell],
            totals: [{ rubricId: 'r1', points: 0, maxPoints: 2, fraction: null, complete: false }],
            outcomes: [],
            unlinked: [],
          },
        ],
        team: [],
      }),
    })
    open()
    expect(await screen.findByText(/Suggested: L1/)).toBeTruthy()
    expect(screen.getByText(/2 of 3 pieces/)).toBeTruthy()
    expect(screen.getByLabelText('Level for Ada, Communication')).toBeTruthy()
    expect(await violations()).toEqual([])
  })
})
