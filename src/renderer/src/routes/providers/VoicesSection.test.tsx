// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockTtx, renderAt } from '../documents/test-utils'
import { useProjectUi } from '../../state/project'
import ProvidersPage from './ProvidersPage'
import type { ProviderViewT } from './catalog'

afterEach(() => {
  cleanup()
  useProjectUi.setState({ projectPath: null })
})

const eleven = (options: Record<string, unknown> = {}): ProviderViewT => ({
  id: 'eleven-1',
  kind: 'elevenlabs',
  label: 'ElevenLabs',
  baseUrl: 'https://api.elevenlabs.io',
  options,
  enabled: true,
  hasKey: true,
})

function setup(provider: ProviderViewT, extra: Parameters<typeof mockTtx>[0] = {}) {
  const ttx = mockTtx({
    'providers:list': () => [provider],
    'routing:get': () => ({ global: {}, effective: {} }),
    'providers:health': () => ({ ok: true, latencyMs: 40, message: '2 voices' }),
    'providers:models': () => [],
    'providers:list-voices': () => [
      { id: 'v-rachel', label: 'Rachel', description: 'Calm, American' },
      { id: 'v-adam', label: 'Adam' },
    ],
    'providers:upsert': (req: { config: Partial<ProviderViewT> }) => ({
      ...provider,
      ...req.config,
    }),
    ...extra,
  })
  renderAt('/providers', '/providers', ProvidersPage)
  return ttx
}

async function openEditor() {
  const user = userEvent.setup()
  const card = await screen.findByRole('article', { name: 'ElevenLabs' })
  await user.click(within(card).getByRole('button', { name: 'Edit' }))
  const dialog = await screen.findByRole('dialog', { name: 'Edit ElevenLabs' })
  return { user, dialog }
}

describe('Voices section', () => {
  it('lists the provider voices for each project role and the default speaker', async () => {
    useProjectUi.setState({ projectPath: '/p' })
    setup(eleven(), {
      'scenarios:list': () => [
        { id: 's1', title: 'S', status: 'draft', updatedAt: '2026-11-01T00:00:00.000Z' },
      ],
      'scenarios:get': () =>
        ({
          roles: [
            { id: 'r1', name: 'Airport Director' },
            { id: 'r2', name: 'PIO' },
          ],
        }) as never,
    })
    const { dialog } = await openEditor()
    const table = await within(dialog).findByRole('table')
    expect(within(table).getByRole('rowheader', { name: 'Airport Director' })).toBeTruthy()
    expect(within(table).getByRole('rowheader', { name: 'PIO' })).toBeTruthy()
    expect(within(table).getByRole('rowheader', { name: 'Any other speaker' })).toBeTruthy()
    const select = await within(table).findByLabelText('Voice for PIO')
    await waitFor(() => expect(within(select).getByText('Rachel - Calm, American')).toBeTruthy())
  })

  it('saves the chosen voices into the provider options, by keyboard-reachable selects', async () => {
    useProjectUi.setState({ projectPath: '/p' })
    const ttx = setup(eleven({ voice: 'v-adam' }), {
      'scenarios:list': () => [
        { id: 's1', title: 'S', status: 'draft', updatedAt: '2026-11-01T00:00:00.000Z' },
      ],
      'scenarios:get': () => ({ roles: [{ id: 'r2', name: 'PIO' }] }) as never,
    })
    const { user, dialog } = await openEditor()
    const pio = await within(dialog).findByLabelText('Voice for PIO')
    await waitFor(() => expect(within(pio).getByText('Rachel - Calm, American')).toBeTruthy())
    await user.selectOptions(pio, 'v-rachel')
    expect(
      (within(dialog).getByLabelText('Voice for any other speaker') as HTMLSelectElement).value,
    ).toBe('v-adam')
    await user.click(within(dialog).getByRole('button', { name: 'Save provider' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    expect(ttx.calls('providers:upsert')[0]).toMatchObject({
      config: { kind: 'elevenlabs', options: { voices: { PIO: 'v-rachel' }, voice: 'v-adam' } },
    })
  })

  it('shows only the default row without a project, and says why', async () => {
    setup(eleven())
    const { dialog } = await openEditor()
    const table = await within(dialog).findByRole('table')
    expect(within(table).getAllByRole('rowheader')).toHaveLength(1)
    expect(within(table).getByText(/Open a project to see its roles/)).toBeTruthy()
  })

  it('announces a failed voice list', async () => {
    setup(eleven(), {
      'providers:list-voices': () => {
        throw new Error('ElevenLabs rejected the API key. Check the key in Providers.')
      },
    })
    const { dialog } = await openEditor()
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/rejected the API key/)
  })

  it('has no base URL field and keeps sound effects off by default', async () => {
    const ttx = setup(eleven())
    const { user, dialog } = await openEditor()
    expect(within(dialog).queryByLabelText('Base URL')).toBeNull()
    const fx = within(dialog).getByLabelText(/Add sound effects/) as HTMLInputElement
    expect(fx.checked).toBe(false)
    await user.click(fx)
    await user.click(within(dialog).getByRole('button', { name: 'Save provider' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    expect(ttx.calls('providers:upsert')[0]).toMatchObject({
      config: { options: { soundEffects: true } },
    })
  })
})
