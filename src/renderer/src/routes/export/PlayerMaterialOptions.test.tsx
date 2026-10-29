// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExportOptions, TranslationStatusView } from '@shared/ipc'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { PlayerMaterialOptions } from './PlayerMaterialOptions'
import { usePlayerMaterial } from './use-player-material'

afterEach(() => cleanup())

const ref: { options: () => ExportOptions } = { options: () => ({}) }
const latest = () => ref.options()

function Harness() {
  const form = usePlayerMaterial('/tmp/p.asproj', 'S1')
  useEffect(() => {
    ref.options = form.options
  })
  return (
    <PlayerMaterialOptions
      form={form}
      disabled={false}
      projectPath="/tmp/p.asproj"
      scenarioId="S1"
    />
  )
}

function setup(status: Partial<TranslationStatusView> = {}) {
  mockTtx({
    'translate:status': () => ({
      languages: { player: ['es'], controller: true },
      items: [
        {
          kind: 'doc',
          id: 'briefing',
          label: 'Player Briefing Packet',
          status: 'machine',
          flags: [],
        },
        { kind: 'inject', id: 'i1', label: 'I-04: Post', status: 'reviewed', flags: [] },
      ],
      route: null,
      glossary: [],
      ...status,
    }),
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('player material export options (spec 0435 FR-10, FR-11)', () => {
  it('exports English only until another language is chosen', async () => {
    setup()
    await screen.findByRole('radio', { name: 'Spanish' })
    expect(latest()).toEqual({})
    expect((screen.getByRole('radio', { name: 'English' }) as HTMLInputElement).checked).toBe(true)
  })

  it('Spanish asks for the Spanish set; Both asks for both; large print is its own choice', async () => {
    setup()
    const spanish = (await screen.findByRole('radio', { name: 'Spanish' })) as HTMLInputElement
    await waitFor(() => expect(spanish.disabled).toBe(false))
    await userEvent.click(spanish)
    expect(latest()).toEqual({ playerLanguages: ['es'] })
    await userEvent.click(screen.getByRole('radio', { name: 'English and Spanish' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /large-print copy/ }))
    expect(latest()).toEqual({ playerLanguages: ['en', 'es'], largePrint: true })
  })

  it('warns that unreviewed items block the export and offers the stamped override', async () => {
    setup()
    const spanish = await screen.findByRole('radio', { name: 'Spanish' })
    await waitFor(() => expect((spanish as HTMLInputElement).disabled).toBe(false))
    await userEvent.click(spanish)
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /1 translated item is not reviewed/,
    )
    await userEvent.click(screen.getByRole('checkbox', { name: /Export unreviewed translation/ }))
    expect(latest()).toEqual({ playerLanguages: ['es'], allowUnreviewed: true })
  })

  it('controller material in Spanish is offered only when the scenario translates it', async () => {
    setup()
    const spanish = await screen.findByRole('radio', { name: 'Spanish' })
    await waitFor(() => expect((spanish as HTMLInputElement).disabled).toBe(false))
    await userEvent.click(spanish)
    await userEvent.click(screen.getByRole('checkbox', { name: /controller material in Spanish/ }))
    expect(latest()).toMatchObject({ controllerLanguages: ['es'] })
  })

  it('Spanish is unavailable while it is switched off for the scenario', async () => {
    setup({ languages: { player: [], controller: false } })
    expect(
      ((await screen.findByRole('radio', { name: 'Spanish' })) as HTMLInputElement).disabled,
    ).toBe(true)
    expect(await screen.findByText(/Spanish is off for this scenario/)).toBeTruthy()
  })
})
