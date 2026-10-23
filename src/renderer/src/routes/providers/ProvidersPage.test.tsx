// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockTtx, renderAt } from '../documents/test-utils'
import ProvidersPage from './ProvidersPage'
import type { ProviderViewT } from './catalog'

const KEY = 'sk-ant-api03-VERYSECRET'

function setup(initial: ProviderViewT[] = []) {
  let providers = initial
  const ttx = mockTtx({
    'providers:list': () => providers,
    'routing:get': () => ({ global: {}, effective: {} }),
    'providers:health': () => ({ ok: true, latencyMs: 42 }),
    'providers:models': () => [],
    'providers:upsert': (req: { config: Partial<ProviderViewT>; apiKey?: string | null }) => {
      const view = {
        options: {},
        enabled: true,
        ...req.config,
        id: req.config.id ?? 'anthropic-0001',
        hasKey: typeof req.apiKey === 'string',
      } as ProviderViewT
      providers = [...providers.filter((p) => p.id !== view.id), view]
      return view
    },
    'providers:test': () => ({ ok: true, sample: 'OK', latencyMs: 318 }),
    'providers:pull-model': () => ({ jobId: 'job1' }),
    'jobs:get': () => ({
      id: 'job1',
      kind: 'model-pull' as const,
      status: 'queued' as const,
      progress: 0,
      message: 'Queued',
      createdAt: '2026-10-21T12:00:00.000Z',
      updatedAt: '2026-10-21T12:00:00.000Z',
      resumable: false,
    }),
    'jobs:cancel': () => undefined,
    'providers:detect-local': () => [
      {
        kind: 'openai-compatible',
        label: 'LM Studio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        reachable: true,
        models: ['text-embedding-nomic-embed-text-v1.5', 'qwen3-30b-a3b-2507'],
        loadedModels: [],
        chatModels: ['qwen3-30b-a3b-2507'],
      },
      {
        kind: 'ollama',
        label: 'Ollama',
        baseUrl: 'http://127.0.0.1:11434',
        reachable: false,
        models: [],
        loadedModels: [],
        chatModels: [],
      },
      {
        kind: 'comfyui',
        label: 'ComfyUI',
        baseUrl: 'http://127.0.0.1:8188',
        reachable: false,
        models: [],
        loadedModels: [],
        chatModels: [],
      },
      {
        kind: 'system-tts',
        label: 'System voice (macOS say)',
        baseUrl: '',
        reachable: true,
        models: ['Samantha', 'Daniel'],
        loadedModels: [],
        chatModels: [],
      },
    ],
  })
  renderAt('/providers', '/providers', ProvidersPage)
  return ttx
}

afterEach(() => cleanup())

describe('ProvidersPage', () => {
  it('adds Anthropic with a key that is sent once and never shown again', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add provider' })
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'anthropic')
    expect((within(dialog).getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://api.anthropic.com',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    expect(within(dialog).getByText('This provider needs an API key.')).toBeTruthy()
    expect(ttx.calls('providers:upsert')).toHaveLength(0)

    await user.type(within(dialog).getByLabelText('API key'), KEY)
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    expect(ttx.calls('providers:upsert')[0]).toMatchObject({
      config: { kind: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com' },
      apiKey: KEY,
    })
    const card = await screen.findByRole('article', { name: 'Anthropic' })
    expect(within(card).getByText('Key stored')).toBeTruthy()
    expect(document.body.innerHTML).not.toContain(KEY)
  })

  it('detects local services and adds LM Studio with a chat model as default', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Detect local services' }))
    const list = await screen.findByRole('list', { name: 'Detected services' })
    expect(within(list).getAllByText('Not found')).toHaveLength(2)
    await user.click(within(list).getByRole('button', { name: 'Add LM Studio' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    expect(ttx.calls('providers:upsert')[0]).toMatchObject({
      config: {
        kind: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:1234/v1',
        defaultModel: 'qwen3-30b-a3b-2507',
      },
    })
    expect(await within(list).findByText('Added')).toBeTruthy()
  })

  it('adds a detected system voice without a base URL', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Detect local services' }))
    const list = await screen.findByRole('list', { name: 'Detected services' })
    expect(within(list).getByText('Installed. Voices: Samantha, Daniel')).toBeTruthy()
    await user.click(within(list).getByRole('button', { name: 'Add System voice (macOS say)' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    const sent = ttx.calls('providers:upsert')[0] as { config: Record<string, unknown> }
    expect(sent.config).toMatchObject({ kind: 'system-tts', label: 'System voice (macOS say)' })
    expect(sent.config).not.toHaveProperty('baseUrl')
  })

  it('adds a system voice from the dialog with no server address', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add provider' })
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'system-tts')
    expect(within(dialog).queryByLabelText('Base URL')).toBeNull()
    await user.type(within(dialog).getByLabelText('Default voice'), 'Samantha')
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    expect(ttx.calls('providers:upsert')[0]).toMatchObject({
      config: { kind: 'system-tts', label: 'System voice', defaultModel: 'Samantha' },
    })
  })

  it('shows health latency and runs a test', async () => {
    setup([
      {
        id: 'lm',
        kind: 'openai-compatible',
        label: 'LM Studio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        defaultModel: 'qwen3-30b-a3b-2507',
        options: {},
        enabled: true,
        hasKey: false,
      },
    ])
    const card = await screen.findByRole('article', { name: 'LM Studio' })
    expect(await within(card).findByText('Reachable · 42 ms')).toBeTruthy()
    await userEvent.click(within(card).getByRole('button', { name: 'Test' }))
    expect((await within(card).findByRole('status')).textContent).toBe('Replied “OK” in 318 ms')
  })

  it('pulls an Ollama model with live progress and cancel', async () => {
    const ttx = setup([
      {
        id: 'ollama',
        kind: 'ollama',
        label: 'Ollama',
        baseUrl: 'http://127.0.0.1:11434',
        options: {},
        enabled: true,
        hasKey: false,
      },
    ])
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'Ollama' })
    const input = within(card).getByLabelText('Pull a model')
    await user.type(input, 'bad name!')
    expect(within(card).getByText('Use an Ollama model name such as qwen3:4b')).toBeTruthy()
    await user.clear(input)
    await user.type(input, 'qwen3:4b{Enter}')
    await waitFor(() =>
      expect(ttx.calls('providers:pull-model')).toEqual([{ id: 'ollama', model: 'qwen3:4b' }]),
    )
    const bar = await within(card).findByRole('progressbar', { name: 'Pulling qwen3:4b' })
    ttx.emit('job:progress', {
      jobId: 'job1',
      kind: 'model-pull',
      status: 'running',
      progress: 0.5,
      message: 'qwen3:4b: pulling 3f9a 1.25 / 2.50 GB',
    })
    await waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('50'))
    expect(within(card).getByText('qwen3:4b: pulling 3f9a 1.25 / 2.50 GB')).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: 'Cancel' }))
    expect(ttx.calls('jobs:cancel')).toEqual([{ jobId: 'job1' }])
    ttx.emit('job:done', { jobId: 'job1', kind: 'model-pull', status: 'cancelled' })
    expect(await within(card).findByLabelText('Pull a model')).toBeTruthy()
  })
})
