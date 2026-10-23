// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppSettings } from '@shared/schemas/settings'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import { queryClient } from '../../lib/query'
import { FakeIpcError, mockTtx } from '../documents/test-utils'
import SettingsPage from './SettingsPage'

function setup(handlers: Parameters<typeof mockTtx>[0]) {
  const ttx = mockTtx(handlers)
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return ttx
}

afterEach(() => cleanup())

describe('SettingsPage', () => {
  it('explains that "Configured provider" uses the Embeddings routing row, with a link', async () => {
    setup({
      'settings:get': () =>
        ({
          ui: { theme: 'system' },
          embeddings: { mode: 'provider', model: 'nomic-embed-text' },
        }) as never,
    })
    const select = await screen.findByLabelText('Embedding mode')
    const hintId = select.getAttribute('aria-describedby')!
    const hint = document.getElementById(hintId)!
    expect(hint.textContent).toMatch(/Embeddings row in Providers → Routing/)
    expect(
      within(hint)
        .getByRole('link', { name: /Providers → Routing/ })
        .getAttribute('href'),
    ).toBe('/providers')
  })

  it('shows a readable error when settings cannot be read', async () => {
    setup({
      'settings:get': () => {
        throw new FakeIpcError('INTERNAL', "EACCES: permission denied, open '/u/settings.json'")
      },
    })
    expect((await screen.findByRole('alert')).textContent).toMatch(/permissions/)
  })

  it('offers automatic injects and media after generation, off by default (#227)', async () => {
    const ttx = setup({
      'settings:get': () => AppSettings.parse({}),
      'settings:update': () => AppSettings.parse({ generation: { autoInjectsAndMedia: true } }),
    })
    const box = (await screen.findByRole('checkbox', {
      name: 'Write injects and render media automatically after generation',
    })) as HTMLInputElement
    expect(box.checked).toBe(false)
    await userEvent.setup().click(box)
    await waitFor(() =>
      expect(ttx.calls('settings:update')[0]).toEqual({
        generation: { autoInjectsAndMedia: true },
      }),
    )
  })
})
