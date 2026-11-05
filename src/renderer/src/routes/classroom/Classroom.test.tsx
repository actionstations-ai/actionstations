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
})
