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

  it('turns the tip of the day on and off under General, on by default (#443)', async () => {
    const ttx = setup({
      'settings:get': () => AppSettings.parse({}),
      'settings:update': () => AppSettings.parse({ ui: { tips: { enabled: false } } }),
    })
    const box = (await screen.findByRole('checkbox', {
      name: 'Show a tip on the Projects screen',
    })) as HTMLInputElement
    expect(box.checked).toBe(true)
    await userEvent.setup().click(box)
    await waitFor(() =>
      expect(ttx.calls('settings:update')[0]).toEqual({ ui: { tips: { enabled: false } } }),
    )
  })

  it('sets the survey results threshold, 3 by default (#422)', async () => {
    const ttx = setup({
      'settings:get': () => AppSettings.parse({}),
      'settings:update': () => AppSettings.parse({ surveys: { minResponses: 5 } }),
    })
    const select = (await screen.findByRole('combobox', {
      name: 'Show survey results from',
    })) as HTMLSelectElement
    expect(select.value).toBe('3')
    await userEvent.setup().selectOptions(select, '5')
    await waitFor(() =>
      expect(ttx.calls('settings:update')[0]).toEqual({ surveys: { minResponses: 5 } }),
    )
  })

  it('adds the official catalog with one click and lists catalogs with their status (#267)', async () => {
    const official = 'https://actionstations.ai/packs/index.json'
    let catalogs: AppSettings['packs']['catalogs'] = []
    const ttx = setup({
      'settings:get': () => AppSettings.parse({ packs: { catalogs } }),
      'packs:catalogAdd': (req: { url: string }) => {
        catalogs = [...catalogs, { url: req.url, addedAt: '2026-10-24T00:00:00Z' }]
        return catalogs
      },
    })
    expect(await screen.findByText('No catalogs added.')).toBeTruthy()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Add the official catalog (actionstations.ai)' }))
    await waitFor(() => expect(ttx.calls('packs:catalogAdd')).toEqual([{ url: official }]))
    expect(await screen.findByText(official)).toBeTruthy()
    expect(screen.getByText('Not fetched yet')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Add the official catalog (actionstations.ai)' }),
    ).toBeNull()
  })

  it('refuses plain http off this computer and removes a catalog (#267)', async () => {
    const url = 'https://packs.example.org/index.json'
    const ttx = setup({
      'settings:get': () =>
        AppSettings.parse({
          packs: {
            catalogs: [
              {
                url,
                name: 'Example Packs',
                addedAt: '2026-10-24T00:00:00Z',
                lastError: 'HTTP 404',
              },
            ],
          },
        }),
      'packs:catalogRemove': () => [],
    })
    const user = userEvent.setup()
    expect(await screen.findByText('Last refresh failed: HTTP 404')).toBeTruthy()
    const input = screen.getByLabelText('Catalog URL')
    await user.type(input, 'http://packs.example.org/index.json')
    expect(screen.getByRole('alert').textContent).toMatch(/https/)
    expect(
      (screen.getByRole('button', { name: 'Add catalog' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Remove Example Packs' }))
    await waitFor(() => expect(ttx.calls('packs:catalogRemove')).toEqual([{ url }]))
  })
})
