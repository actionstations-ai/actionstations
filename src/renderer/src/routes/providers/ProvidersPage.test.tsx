// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockTtx, renderAt } from '../documents/test-utils'
import ProvidersPage from './ProvidersPage'
import type { ProviderViewT } from './catalog'
import { AppSettings } from '@shared/schemas'

const KEY = 'sk-ant-api03-VERYSECRET'

function setup(initial: ProviderViewT[] = [], extra: Parameters<typeof mockTtx>[0] = {}) {
  let providers = initial
  const ttx = mockTtx({
    ...extra,
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
  it('asks once for keys that could not be read after the settings-folder move (#277)', async () => {
    let dismissed = false
    const openai = {
      id: 'openai-9f9f',
      kind: 'openai-compatible',
      label: 'Cloud LLM',
      baseUrl: 'https://llm.example.test/v1',
      enabled: true,
      options: {},
      hasKey: false,
    } as ProviderViewT
    const ttx = setup([openai], {
      'settings:get': () =>
        AppSettings.parse({ keyReentry: { providerIds: ['openai-9f9f'], dismissed } }),
      'settings:update': (req: { keyReentryDismissed?: boolean }) => {
        dismissed = req.keyReentryDismissed ?? dismissed
        return AppSettings.parse({ keyReentry: { providerIds: ['openai-9f9f'], dismissed } })
      },
    })
    const user = userEvent.setup()
    const notice = await screen.findByRole('status', { name: 'API keys to enter again' })
    expect(within(notice).getByText(/Enter these API keys again: Cloud LLM\./)).toBeTruthy()
    const card = await screen.findByRole('article', { name: 'Cloud LLM' })
    expect(within(card).getByText('Key needs re-entry')).toBeTruthy()
    await user.click(within(notice).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'API keys to enter again' })).toBeNull(),
    )
    expect(ttx.calls('settings:update')).toEqual([{ keyReentryDismissed: true }])
  })

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

  it('lists the hosted services, each filling the address, model and cloud options', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add provider' })
    const type = within(dialog).getByLabelText('Type') as HTMLSelectElement
    const labels = Array.from(type.options).map((o) => o.text)
    for (const name of [
      'OpenAI',
      'Google Gemini',
      'OpenRouter',
      'Mistral',
      'Groq',
      'DeepSeek',
      'xAI',
      'Together AI',
      'Azure OpenAI',
      'OpenAI-compatible',
    ])
      expect(labels).toContain(name)

    await user.selectOptions(type, 'gemini')
    expect((within(dialog).getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/',
    )
    expect((within(dialog).getByLabelText('Default model') as HTMLInputElement).value).not.toBe('')

    await user.selectOptions(type, 'openai')
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    expect(within(dialog).getByText('This provider needs an API key.')).toBeTruthy()
    await user.type(within(dialog).getByLabelText('API key'), 'sk-test-0000000000')
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    const sent = ttx.calls('providers:upsert')[0] as { config: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(sent.config).toMatchObject({
      kind: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      options: {
        preset: 'openai',
        network: 'remote',
        modelProfile: 'off',
        maxTokensParam: 'max_completion_tokens',
      },
    })
  })

  it('saves prices, the Azure api-version and the JSON mode from Advanced', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add provider' })
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'azure-openai')
    expect(within(dialog).getByLabelText('Default model')).toHaveProperty(
      'placeholder',
      'Your deployment name',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Advanced' }))
    await user.type(within(dialog).getByLabelText(/Input price/), '1.25')
    await user.type(within(dialog).getByLabelText(/Output price/), '10')
    await user.type(within(dialog).getByLabelText(/Price per image/), '0.04')
    await user.type(within(dialog).getByLabelText('API version'), '2024-10-21')
    await user.selectOptions(within(dialog).getByLabelText('JSON mode'), 'json_object')
    await user.type(within(dialog).getByLabelText('API key'), 'azure-key-0000')
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    expect(ttx.calls('providers:upsert')[0]).toMatchObject({
      config: {
        options: {
          preset: 'azure-openai',
          auth: 'api-key',
          network: 'remote',
          inputUsdPerMTok: 1.25,
          outputUsdPerMTok: 10,
          mediaUsdPerCall: 0.04,
          apiVersion: '2024-10-21',
          jsonMode: 'json_object',
        },
      },
    })
  })

  it('saves the image and speech models, and warns about OpenAI speech models only for OpenAI', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add provider' })
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'gemini')
    expect(within(dialog).queryByText(/January 6, 2027/)).toBeNull()
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'openai')
    await user.click(within(dialog).getByRole('button', { name: 'Advanced' }))
    expect(within(dialog).getByText(/shut down on January 6, 2027/)).toBeTruthy()
    await user.type(within(dialog).getByLabelText('Image model'), 'gpt-image-1')
    await user.type(within(dialog).getByLabelText('Speech model'), 'my-speech')
    await user.type(within(dialog).getByLabelText('API key'), 'sk-test-0000000000')
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    expect(ttx.calls('providers:upsert')[0]).toMatchObject({
      config: { options: { preset: 'openai', imageModel: 'gpt-image-1', ttsModel: 'my-speech' } },
    })
  })

  it('adds fal.ai with a key, per-call prices and a saved video model mapping', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add provider' })
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'fal')
    expect(within(dialog).getByLabelText('Base URL')).toHaveProperty('readOnly', true)
    await user.click(within(dialog).getByRole('button', { name: 'Video model inputs' }))
    await user.type(within(dialog).getByLabelText('Model'), 'acme/new-video')
    await user.clear(within(dialog).getByLabelText('Prompt input'))
    await user.type(within(dialog).getByLabelText('Prompt input'), 'text')
    await user.type(within(dialog).getByLabelText('Starting image input'), 'first_frame')
    await user.type(within(dialog).getByLabelText(/Lengths the model accepts/), '4, 8')
    await user.type(within(dialog).getByLabelText('Duration input'), 'seconds')
    await user.click(within(dialog).getByRole('button', { name: 'Advanced' }))
    expect(within(dialog).queryByLabelText(/Input price/)).toBeNull()
    await user.type(within(dialog).getByLabelText(/Video call price/), '0.35')
    await user.type(within(dialog).getByLabelText('API key'), 'fal-key-0000:abcdef')
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    expect(ttx.calls('providers:upsert')[0]).toMatchObject({
      apiKey: 'fal-key-0000:abcdef',
      config: {
        kind: 'fal',
        baseUrl: 'https://queue.fal.run',
        options: {
          videoUsdPerCall: 0.35,
          inputMap: {
            'acme/new-video': {
              prompt: 'text',
              image: 'first_frame',
              duration: 'seconds',
              durationAllowed: [4, 8],
            },
          },
        },
      },
    })
  })

  it('adds Replicate with a token and prefills a known Replicate model', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add provider' })
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'replicate')
    expect(within(dialog).getByLabelText('Base URL')).toHaveProperty('readOnly', true)
    await user.type(within(dialog).getByLabelText('API key'), 'r8_token-0000:abcdef')
    await user.click(within(dialog).getByRole('button', { name: 'Video model inputs' }))
    await user.type(within(dialog).getByLabelText('Model'), 'kwaivgi/kling-v2.5-turbo-pro')
    expect(within(dialog).getByLabelText('Starting image input')).toHaveProperty(
      'value',
      'start_image',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    await waitFor(() => expect(ttx.calls('providers:upsert')).toHaveLength(1))
    expect(ttx.calls('providers:upsert')[0]).toMatchObject({
      apiKey: 'r8_token-0000:abcdef',
      config: { kind: 'replicate', baseUrl: 'https://api.replicate.com' },
    })
  })

  it('prefills a known fal.ai model and refuses an input name that is not a plain name', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add provider' })
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'fal')
    await user.type(within(dialog).getByLabelText('API key'), 'fal-key-0000:abcdef')
    await user.click(within(dialog).getByRole('button', { name: 'Video model inputs' }))
    await user.type(
      within(dialog).getByLabelText('Model'),
      'fal-ai/kling-video/v3/pro/image-to-video',
    )
    expect(within(dialog).getByLabelText('Starting image input')).toHaveProperty(
      'value',
      'start_image_url',
    )
    expect(within(dialog).getByLabelText(/Lengths the model accepts/)).toHaveProperty(
      'value',
      '3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15',
    )
    await user.clear(within(dialog).getByLabelText('Starting image input'))
    await user.type(within(dialog).getByLabelText('Starting image input'), 'a b')
    expect(
      within(dialog).getByText('Use the input name only: letters, digits and underscores.'),
    ).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    expect(within(dialog).getByText('Fix the video model inputs before saving.')).toBeTruthy()
    expect(ttx.calls('providers:upsert')).toHaveLength(0)
  })

  it('refuses a price that is not a number, or only one of the two token prices', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add provider' })
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'openai')
    await user.type(within(dialog).getByLabelText('API key'), 'sk-test-0000000000')
    await user.click(within(dialog).getByRole('button', { name: 'Advanced' }))
    await user.type(within(dialog).getByLabelText(/Input price/), 'cheap')
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    expect(within(dialog).getByText('Enter a price in US dollars, such as 1.25.')).toBeTruthy()
    await user.clear(within(dialog).getByLabelText(/Input price/))
    await user.type(within(dialog).getByLabelText(/Input price/), '2')
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }))
    expect(within(dialog).getByText('Enter both prices, or leave both empty.')).toBeTruthy()
    expect(ttx.calls('providers:upsert')).toHaveLength(0)
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
