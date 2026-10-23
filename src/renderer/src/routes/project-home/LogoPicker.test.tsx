// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Project } from '@shared/schemas'
import { mockTtx } from '../documents/test-utils'
import { LogoPicker } from './LogoPicker'

const now = '2026-10-21T12:00:00.000Z'
const project = (logoPath?: string) =>
  Project.parse({
    id: 'p1',
    name: 'Northfield Regional',
    createdAt: now,
    updatedAt: now,
    appVersion: '0.0.1',
    brand: { aliases: {}, ...(logoPath ? { logoPath } : {}) },
  })
const PATH = '/projects/Northfield.asproj'

afterEach(() => cleanup())

describe('LogoPicker (#217)', () => {
  it('copies the chosen image into the project through project:set-logo', async () => {
    const ttx = mockTtx({
      'dialog:open-files': () => ['/Users/me/Pictures/logo.png'],
      'project:set-logo': () => ({ path: PATH, project: project('brand/logo-1.png') }),
    })
    render(<LogoPicker path={PATH} project={project()} />)
    expect(screen.getByText('No logo')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Choose logo…' }))
    await waitFor(() => expect(ttx.calls('project:set-logo')).toHaveLength(1))
    expect(ttx.calls('project:set-logo')[0]).toEqual({
      path: PATH,
      sourcePath: '/Users/me/Pictures/logo.png',
    })
    expect(ttx.calls('dialog:open-files')[0]).toMatchObject({
      multi: false,
      filters: [{ extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
  })

  it('does nothing when the file dialog is cancelled', async () => {
    const ttx = mockTtx({ 'dialog:open-files': () => [] })
    render(<LogoPicker path={PATH} project={project()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Choose logo…' }))
    await waitFor(() => expect(ttx.calls('dialog:open-files')).toHaveLength(1))
    expect(ttx.calls('project:set-logo')).toHaveLength(0)
  })

  it('shows the current logo through ttx-media and removes it', async () => {
    const ttx = mockTtx({
      'project:clear-logo': () => ({ path: PATH, project: project() }),
    })
    render(<LogoPicker path={PATH} project={project('brand/logo-1.png')} />)
    const img = screen.getByRole('img', { name: 'Current project logo' }) as HTMLImageElement
    expect(img.getAttribute('src')).toMatch(/^ttx-media:\/\/project\/.+\/brand\/logo-1\.png$/)
    await userEvent.click(screen.getByRole('button', { name: 'Remove logo' }))
    await waitFor(() => expect(ttx.calls('project:clear-logo')).toEqual([{ path: PATH }]))
  })
})
