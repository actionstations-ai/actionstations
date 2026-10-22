// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '../lib/query'
import { mockTtx } from '../routes/documents/test-utils'
import { shouldMoveFocus } from '../lib/focus'
import { RouteFocus, Sidebar, SkipLink } from './shell'

afterEach(() => cleanup())

function Page({ title, next }: { title: string; next?: string }) {
  const navigate = useNavigate()
  return (
    <div>
      <h1>{title}</h1>
      {next && (
        <button type="button" onClick={() => void navigate(next)}>
          Go
        </button>
      )}
      <input aria-label="Field" />
    </div>
  )
}

function setup(initial = '/a') {
  mockTtx({})
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <RouteFocus />
        <SkipLink />
        <Sidebar />
        <main id="main">
          <Routes>
            <Route path="/a" element={<Page title="Alpha" next="/b" />} />
            <Route path="/b" element={<Page title="Beta" />} />
          </Routes>
        </main>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 120)))

describe('app shell', () => {
  it('titles the window after the page heading and moves focus there on navigation', async () => {
    setup()
    await settle()
    expect(document.title).toBe('Alpha · Action Stations')
    expect(document.activeElement).toBe(document.body)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    await settle()
    expect(document.title).toBe('Beta · Action Stations')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Beta' }))
  })

  it('skip link moves focus to the main heading', async () => {
    setup()
    await settle()
    await userEvent.click(screen.getByRole('link', { name: 'Skip to main content' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Alpha' }))
  })

  it('Menu button reports and toggles the navigation state', async () => {
    setup()
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu.getAttribute('aria-expanded')).toBe('false')
    expect(menu.getAttribute('aria-controls')).toBe('main-nav')
    await userEvent.click(menu)
    expect(menu.getAttribute('aria-expanded')).toBe('true')
    await userEvent.keyboard('{Escape}')
    expect(menu.getAttribute('aria-expanded')).toBe('true')
    screen.getByRole('navigation', { name: 'Main' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(menu.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(menu)
  })

  it('never pulls focus out of a text field or an open dialog', () => {
    const input = document.createElement('input')
    const button = document.createElement('button')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const inDialog = document.createElement('button')
    dialog.append(inDialog)
    document.body.append(input, button, dialog)
    expect(shouldMoveFocus(null)).toBe(true)
    expect(shouldMoveFocus(document.body)).toBe(true)
    expect(shouldMoveFocus(button)).toBe(true)
    expect(shouldMoveFocus(input)).toBe(false)
    expect(shouldMoveFocus(inDialog)).toBe(false)
    input.remove()
    button.remove()
    dialog.remove()
  })
})
