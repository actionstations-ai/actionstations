// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '../lib/query'
import { mockTtx } from '../routes/documents/test-utils'
import { shouldMoveFocus } from '../lib/focus'
import { useProjectUi } from '../state/project'
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

  describe('navigation groups (#230)', () => {
    const PROJECT = '/Users/test/Rivergate.ttxproj'
    const key = encodeURIComponent(PROJECT)
    afterEach(() => {
      useProjectUi.getState().setProjectPath(null)
      localStorage.clear()
    })
    const navLabels = () =>
      within(screen.getByRole('navigation', { name: 'Main' }))
        .queryAllByRole('link')
        .map((l) => l.textContent)

    it('orders global nav with Providers before Prompts, Templates and Workflows', () => {
      setup()
      const labels = navLabels()
      expect(labels.indexOf('Providers')).toBeLessThan(labels.indexOf('Prompts'))
      expect(labels.indexOf('Providers')).toBeLessThan(labels.indexOf('Templates'))
      expect(labels.indexOf('Providers')).toBeLessThan(labels.indexOf('Workflows'))
    })

    it('groups project pages into Build and a collapsed Advanced that remembers its state', async () => {
      useProjectUi.getState().setProjectPath(PROJECT)
      setup()
      const build = screen.getByRole('group', { name: 'Build' })
      expect(
        within(build)
          .getAllByRole('link')
          .map((l) => l.textContent),
      ).toEqual(['Overview', 'Documents', 'Facility facts', 'Generate', 'Scenarios', 'Facilitate'])
      const toggle = screen.getByRole('button', { name: 'Advanced' })
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      expect(screen.queryByRole('link', { name: 'Search index' })).toBeNull()
      await userEvent.click(toggle)
      const advanced = screen.getByRole('group', { name: 'Advanced' })
      expect(
        within(advanced)
          .getAllByRole('link')
          .map((l) => l.textContent),
      ).toEqual(['Search index', 'Prompt overrides', 'Provider routing'])
      expect(localStorage.getItem('ttx.nav.advancedOpen')).toBe('1')
      cleanup()
      setup()
      expect(screen.getByRole('button', { name: 'Advanced' }).getAttribute('aria-expanded')).toBe(
        'true',
      )
    })

    it('keeps Advanced open while one of its pages is showing', () => {
      useProjectUi.getState().setProjectPath(PROJECT)
      setup(`/p/${key}/search`)
      expect(screen.getByRole('button', { name: 'Advanced' }).getAttribute('aria-expanded')).toBe(
        'true',
      )
      expect(screen.getByRole('link', { name: 'Search index' })).toBeTruthy()
    })
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
