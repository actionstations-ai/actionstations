// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRouting } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { RoutingTable } from './RoutingTable'
import type { ProviderViewT, RoutingView } from './catalog'

const provider = (over: Partial<ProviderViewT>): ProviderViewT => ({
  id: 'lmstudio-1a2b',
  kind: 'openai-compatible',
  label: 'LM Studio',
  baseUrl: 'http://127.0.0.1:1234/v1',
  defaultModel: 'qwen3-30b-a3b-2507',
  options: {},
  enabled: true,
  hasKey: false,
  ...over,
})

const LM = provider({})
const COMFY = provider({
  id: 'comfy',
  kind: 'comfyui',
  label: 'ComfyUI',
  baseUrl: 'http://127.0.0.1:8188',
})
const OFF = provider({ id: 'off', label: 'Old server', enabled: false })
const TTS = provider({
  id: 'mlx-audio',
  label: 'mlx-audio',
  baseUrl: 'http://127.0.0.1:8765/v1',
  defaultModel: 'mlx-community/VoxCPM2-8bit',
})
const PROVIDERS = [LM, COMFY, OFF, TTS]

/** What main's providers:task-support reports for PROVIDERS (from adapter capabilities). */
const OPENAI = [LM.id, OFF.id, TTS.id]
const TASK_SUPPORT = {
  ideate: { kinds: ['openai-compatible'], providerIds: OPENAI },
  draft: { kinds: ['openai-compatible'], providerIds: OPENAI },
  critique: { kinds: ['openai-compatible'], providerIds: OPENAI },
  embed: { kinds: ['openai-compatible'], providerIds: OPENAI },
  image: { kinds: ['comfyui'], providerIds: [COMFY.id] },
  video: { kinds: ['comfyui'], providerIds: [COMFY.id] },
  audio: {
    kinds: ['openai-compatible', 'comfyui'],
    providerIds: [LM.id, COMFY.id, OFF.id, TTS.id],
  },
}

/** Option labels of a task's provider select once task support has loaded. */
async function optionsOf(label: string): Promise<(string | null)[]> {
  const select = screen.getByLabelText(label) as HTMLSelectElement
  await waitFor(() => expect(select.options.length).toBeGreaterThan(1))
  return [...select.options].map((o) => o.textContent)
}

function setup(
  scope: 'global' | 'project',
  view: RoutingView,
  embeddingMode: 'hash' | 'provider' = 'hash',
) {
  mockTtx({
    'settings:get': () => ({ embeddings: { mode: embeddingMode, model: 'm' } }) as never,
    'providers:task-support': () => TASK_SUPPORT as never,
    'providers:models': () => [
      { id: 'qwen3-30b-a3b-2507', kind: 'chat' },
      { id: 'gpt-oss-20b', kind: 'chat' },
    ],
  })
  queryClient.clear()
  const onSave = vi.fn<(r: ProviderRouting) => void>()
  render(
    <QueryClientProvider client={queryClient}>
      <RoutingTable
        scope={scope}
        providers={PROVIDERS}
        view={view}
        saving={false}
        onSave={onSave}
      />
    </QueryClientProvider>,
  )
  return onSave
}

afterEach(() => cleanup())

describe('RoutingTable — global', () => {
  it('lists every task with a one-line purpose', () => {
    setup('global', { global: {}, effective: {} })
    for (const label of [
      'Ideation',
      'Drafting',
      'Critique',
      'Embeddings',
      'Image',
      'Video',
      'Audio',
    ])
      expect(screen.getByRole('rowheader', { name: new RegExp(label) })).toBeTruthy()
    expect(screen.getByText(/Writes the MSEL/)).toBeTruthy()
  })

  it('offers only the enabled providers main says can serve each task', async () => {
    setup('global', { global: {}, effective: {} })
    expect(await optionsOf('Drafting provider')).toEqual(['Not assigned', 'LM Studio', 'mlx-audio'])
    expect(await optionsOf('Image provider')).toEqual(['Not assigned', 'ComfyUI'])
  })

  it('offers OpenAI-compatible (local TTS) providers for Audio (#113)', async () => {
    const onSave = setup('global', { global: {}, effective: {} })
    expect(await optionsOf('Audio provider')).toEqual([
      'Not assigned',
      'LM Studio',
      'ComfyUI',
      'mlx-audio',
    ])
    await userEvent.selectOptions(screen.getByLabelText('Audio provider'), 'mlx-audio')
    await userEvent.click(screen.getByRole('button', { name: 'Save routing' }))
    expect(onSave).toHaveBeenCalledWith({ audio: { providerId: 'mlx-audio' } })
  })

  it('explains when the Embeddings row is used and links to Settings (#114)', async () => {
    setup('global', { global: {}, effective: {} })
    expect(
      await screen.findByText(/Not in use: Settings → Embeddings is set to "Keyword hashing"/),
    ).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Open Settings → Embeddings' })
    expect(link.getAttribute('href')).toBe('#/settings')
    cleanup()
    setup('global', { global: {}, effective: {} }, 'provider')
    expect(await screen.findByText(/In use: Settings → Embeddings/)).toBeTruthy()
  })

  it('saves provider + model choices and drops blank models', async () => {
    const onSave = setup('global', { global: {}, effective: {} })
    const save = screen.getByRole('button', { name: 'Save routing' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    await optionsOf('Drafting provider')
    await userEvent.selectOptions(screen.getByLabelText('Drafting provider'), 'lmstudio-1a2b')
    await userEvent.type(screen.getByLabelText('Drafting model'), 'gpt-oss-20b')
    await userEvent.selectOptions(screen.getByLabelText('Critique provider'), 'lmstudio-1a2b')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    await userEvent.click(save)
    expect(onSave).toHaveBeenCalledWith({
      draft: { providerId: 'lmstudio-1a2b', model: 'gpt-oss-20b' },
      critique: { providerId: 'lmstudio-1a2b' },
    })
  })

  it('suggests models from the provider and shows its default as placeholder', async () => {
    setup('global', { global: { draft: { providerId: LM.id } }, effective: {} })
    const model = screen.getByLabelText('Drafting model') as HTMLInputElement
    expect(model.placeholder).toBe('Default (qwen3-30b-a3b-2507)')
    const list = document.getElementById(model.getAttribute('list')!)!
    await vi.waitFor(() => expect(list.querySelectorAll('option')).toHaveLength(2))
  })

  it('keeps a disabled provider visible when it is the current choice', () => {
    setup('global', { global: { ideate: { providerId: 'off' } }, effective: {} })
    const ideate = screen.getByLabelText('Ideation provider') as HTMLSelectElement
    expect(ideate.value).toBe('off')
    expect(ideate.selectedOptions[0]!.textContent).toBe('Old server (disabled)')
  })
})

describe('RoutingTable — project', () => {
  const view: RoutingView = {
    global: { draft: { providerId: LM.id }, image: { providerId: COMFY.id } },
    project: { image: { providerId: COMFY.id, model: 'sdxl' } },
    effective: {},
  }

  it('shows inherited values and existing overrides', () => {
    setup('project', view)
    const draftRow = screen.getByRole('rowheader', { name: /Drafting/ }).closest('tr')!
    expect(within(draftRow).getByText('Inherits LM Studio · qwen3-30b-a3b-2507')).toBeTruthy()
    expect((within(draftRow).getByLabelText('Override Drafting') as HTMLInputElement).checked).toBe(
      false,
    )
    expect((screen.getByLabelText('Override Image') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Image model') as HTMLInputElement).value).toBe('sdxl')
  })

  it('override starts from the global value; unticking drops it', async () => {
    const onSave = setup('project', view)
    await userEvent.click(screen.getByLabelText('Override Drafting'))
    expect((screen.getByLabelText('Drafting provider') as HTMLSelectElement).value).toBe(LM.id)
    await userEvent.type(screen.getByLabelText('Drafting model'), 'gpt-oss-20b')
    await userEvent.click(screen.getByLabelText('Override Image'))
    await userEvent.click(screen.getByRole('button', { name: 'Save routing' }))
    expect(onSave).toHaveBeenCalledWith({ draft: { providerId: LM.id, model: 'gpt-oss-20b' } })
  })
})
