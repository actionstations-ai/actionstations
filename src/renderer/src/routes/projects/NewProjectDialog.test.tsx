// @vitest-environment happy-dom
// The new-project dialog can turn Classroom mode on, showing the notice first (spec 0453 FR-1, FR-15).
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockTtx, renderAt } from '../documents/test-utils'
import { NewProjectDialog } from './NewProjectDialog'

afterEach(cleanup)

const project = {
  path: '/p/course.asproj',
  project: { id: 'p1', name: 'Course', orgName: '', orgType: 'generic' },
}

function open(handlers: Parameters<typeof mockTtx>[0] = {}) {
  const api = mockTtx({
    'settings:get': () => ({ defaultProjectsDir: '/p' }) as never,
    'settings:update': () => ({}) as never,
    'project:create': () => project as never,
    'classroom:set-enabled': () => ({}) as never,
    ...handlers,
  })
  renderAt('/x', '/x', () => <NewProjectDialog open onOpenChange={() => {}} onCreated={() => {}} />)
  return api
}

describe('NewProjectDialog', () => {
  it('leaves Classroom mode off unless asked', async () => {
    const api = open()
    fireEvent.change(await screen.findByLabelText('Project name'), { target: { value: 'Course' } })
    await waitFor(() =>
      expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('/p'),
    )
    expect(screen.queryByText(/Scores name students/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(api.calls('project:create')).toHaveLength(1))
    expect(api.calls('classroom:set-enabled')).toHaveLength(0)
  })

  it('shows the notice and turns Classroom mode on after the project is created', async () => {
    const api = open()
    fireEvent.change(await screen.findByLabelText('Project name'), { target: { value: 'Course' } })
    await waitFor(() =>
      expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('/p'),
    )
    fireEvent.click(screen.getByLabelText('Use this project for a course (Classroom mode)'))
    expect(screen.getByText(/Scores name students/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(api.calls('classroom:set-enabled')).toHaveLength(1))
    expect(api.calls('classroom:set-enabled')[0]).toMatchObject({
      projectPath: '/p/course.asproj',
      enabled: true,
    })
  })
})
