// @vitest-environment happy-dom
// Local tools setup (#334): the run-mode choice, the three tool states, Skip, and the rule that
// nothing is detected, downloaded or installed without the user's click. Cloud APIs only
// installs nothing.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { AppSettings } from '@shared/schemas/settings'
import type { SetupMode, SetupStatus, ToolId } from '@shared/schemas/setup'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../../routes/documents/test-utils'
import { RuntimeStep } from '../../routes/welcome/steps/RuntimeStep'
import SettingsPage from '../../routes/settings/SettingsPage'

const tool = (id: ToolId, name: string, over: Partial<SetupStatus['tools'][number]> = {}) => ({
  id,
  name,
  purpose: `${name} does things.`,
  license: 'MIT',
  licenseUrl: `https://example.org/${id}/license`,
  downloadPage: `https://example.org/${id}`,
  sizeLabel: '200 MB download',
  state: 'missing' as const,
  method: 'install' as const,
  canStart: false,
  ...over,
})

const STATUS: SetupStatus = {
  hardware: {
    platform: 'darwin',
    arch: 'arm64',
    appleSilicon: true,
    ramBytes: 32 * 2 ** 30,
    budgetBytes: 22 * 2 ** 30,
    gpu: true,
  },
  tools: [
    tool('lmstudio', 'LM Studio', { state: 'running', baseUrl: 'http://127.0.0.1:1234/v1' }),
    tool('ollama', 'Ollama', {
      state: 'installed',
      canStart: true,
      foundAt: '/Applications/Ollama.app',
    }),
    tool('comfyui', 'ComfyUI', { verification: 'Checks the publisher signature.' }),
    tool('voice', 'Local voice (mlx-audio)', {
      method: 'guided',
      command: 'uv tool install mlx-audio',
    }),
  ],
  models: [
    {
      id: 'lmstudio:qwen/qwen3.5-9b',
      tool: 'lmstudio',
      role: 'text',
      name: 'qwen/qwen3.5-9b',
      sizeBytes: 6.55e9,
      approximate: true,
      license: 'Apache-2.0',
      installed: false,
      needsRunning: false,
    },
    {
      id: 'ollama:nomic-embed-text',
      tool: 'ollama',
      role: 'embedding',
      name: 'nomic-embed-text',
      sizeBytes: 274e6,
      approximate: false,
      license: 'Apache-2.0',
      installed: false,
      needsRunning: true,
    },
  ],
}

function mount(
  mode: SetupMode | undefined,
  ui: 'wizard' | 'settings' = 'wizard',
  skipped: ToolId[] = [],
) {
  let setup = { ...(mode ? { mode } : {}), skipped }
  const ttx = mockTtx({
    'settings:get': () => AppSettings.parse({ setup }),
    'settings:update': (patch: { setup?: typeof setup }) => {
      setup = { ...setup, ...patch.setup }
      return AppSettings.parse({ setup })
    },
    'setup:status': () => STATUS,
    'setup:install': () => ({ jobId: '01JOBINSTALL0000000000000A' }),
    'setup:pull-model': () => ({ jobId: '01JOBPULL00000000000000000' }),
    'jobs:list': () => [],
    'jobs:get': () => {
      throw new Error('n/a')
    },
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui === 'wizard' ? <RuntimeStep onNext={() => undefined} /> : <SettingsPage />}
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return ttx
}

const NETWORK_CHANNELS = [
  'setup:status',
  'setup:install',
  'setup:pull-model',
  'setup:start',
] as const

afterEach(() => cleanup())

describe('Where should models run?', () => {
  it('Cloud APIs only saves the choice and detects, downloads and installs nothing', async () => {
    const ttx = mount(undefined)
    await userEvent.setup().click(await screen.findByRole('radio', { name: /Cloud APIs only/ }))
    await waitFor(() =>
      expect(ttx.calls('settings:update')).toEqual([{ setup: { mode: 'cloud' } }]),
    )
    expect(await screen.findByText(/Nothing will be installed/)).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Local tools' })).toBeNull()
    for (const c of NETWORK_CHANNELS) expect(ttx.calls(c)).toEqual([])
  })

  it('offers three choices as one labelled radio group and continues without one', async () => {
    mount(undefined)
    const group = await screen.findByRole('group', { name: 'How do you want to run models?' })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Decide later' })).toBeTruthy()
  })

  it('Local tools shows each tool with its state, size and license, and starts nothing', async () => {
    const ttx = mount('local')
    const list = await screen.findByRole('list', { name: 'Local tools' })
    const row = (name: string) => within(list).getByRole('listitem', { name })
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(4))
    expect(within(row('LM Studio')).getByText('Detected')).toBeTruthy()
    expect(within(row('Ollama')).getByText('Installed, not running')).toBeTruthy()
    expect(within(row('Ollama')).getByRole('button', { name: 'Start Ollama' })).toBeTruthy()
    const comfy = row('ComfyUI')
    expect(within(comfy).getByText('Not installed')).toBeTruthy()
    expect(within(comfy).getByText('200 MB download')).toBeTruthy()
    expect(within(comfy).getByRole('link', { name: 'MIT' }).getAttribute('href')).toBe(
      'https://example.org/comfyui/license',
    )
    for (const name of ['Download and install', 'Open the download page', 'Skip'])
      expect(within(comfy).getByRole('button', { name })).toBeTruthy()
    const voice = row('Local voice (mlx-audio)')
    expect(within(voice).queryByRole('button', { name: 'Download and install' })).toBeNull()
    expect(within(voice).getByText('uv tool install mlx-audio')).toBeTruthy()
    expect(ttx.calls('setup:install')).toEqual([])
    expect(ttx.calls('setup:pull-model')).toEqual([])
    expect(ttx.calls('setup:start')).toEqual([])
  })

  it('downloads and installs only on the click, for that tool only', async () => {
    const ttx = mount('mix')
    const list = await screen.findByRole('list', { name: 'Local tools' })
    const comfy = await within(list).findByRole('listitem', { name: 'ComfyUI' })
    await userEvent
      .setup()
      .click(within(comfy).getByRole('button', { name: 'Download and install' }))
    await waitFor(() => expect(ttx.calls('setup:install')).toEqual([{ tool: 'comfyui' }]))
  })

  it('Skip hides a tool and remembers it; it can be shown again', async () => {
    const ttx = mount('local')
    const list = await screen.findByRole('list', { name: 'Local tools' })
    const comfy = await within(list).findByRole('listitem', { name: 'ComfyUI' })
    await userEvent.setup().click(within(comfy).getByRole('button', { name: 'Skip' }))
    await waitFor(() =>
      expect(ttx.calls('settings:update')).toEqual([{ setup: { skipped: ['comfyui'] } }]),
    )
    await waitFor(() =>
      expect(within(list).queryByRole('listitem', { name: 'ComfyUI' })).toBeNull(),
    )
    expect(screen.getByText('Skipped: ComfyUI')).toBeTruthy()
    expect(ttx.calls('setup:install')).toEqual([])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show skipped tools' }))
    await waitFor(() =>
      expect(ttx.calls('settings:update').at(-1)).toEqual({ setup: { skipped: [] } }),
    )
  })

  it('offers each recommended model as its own download with its size, on click only', async () => {
    const ttx = mount('local')
    const models = await screen.findByRole('list', { name: 'Recommended models' })
    const lms = within(models).getByRole('button', {
      name: 'Download qwen/qwen3.5-9b (about 6.5 GB)',
    })
    const embed = within(models).getByRole('button', {
      name: /Download nomic-embed-text \(274 MB\)/,
    })
    expect((embed as HTMLButtonElement).disabled).toBe(true)
    expect(within(models).getByText('Start Ollama to download this model.')).toBeTruthy()
    expect(ttx.calls('setup:pull-model')).toEqual([])
    await userEvent.setup().click(lms)
    await waitFor(() =>
      expect(ttx.calls('setup:pull-model')).toEqual([{ modelId: 'lmstudio:qwen/qwen3.5-9b' }]),
    )
  })
})

describe('Settings → Local tools', () => {
  it('shows the same choice and no tool rows for Cloud APIs only', async () => {
    const ttx = mount('cloud', 'settings')
    const section = await screen.findByRole('region', { name: 'Local tools' })
    const cloud = within(section).getByRole('radio', {
      name: /Cloud APIs only/,
    }) as HTMLInputElement
    expect(cloud.checked).toBe(true)
    expect(within(section).queryByRole('list', { name: 'Local tools' })).toBeNull()
    for (const c of NETWORK_CHANNELS) expect(ttx.calls(c)).toEqual([])
    await userEvent.setup().click(within(section).getByRole('radio', { name: /A mix/ }))
    await waitFor(() => expect(ttx.calls('settings:update')).toEqual([{ setup: { mode: 'mix' } }]))
    expect(await within(section).findByRole('list', { name: 'Local tools' })).toBeTruthy()
  })
})
