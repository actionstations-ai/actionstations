// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { AppSettings } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { makeDoc, mockTtx, type Handlers } from '../documents/test-utils'
import { FirstRunRedirect } from './FirstRunRedirect'
import WelcomePage from './WelcomePage'
import { saveProgress, type ProviderViewT, type StepId } from './wizard-state'

const KEY = 'sk-ant-api03-WIZARDSECRET'
const LM = { kind: 'openai-compatible', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1' }
const COMFY = { kind: 'comfyui', label: 'ComfyUI', baseUrl: 'http://127.0.0.1:8188' }

function detected() {
  return [
    {
      ...LM,
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
    { ...COMFY, reachable: true, models: [], loadedModels: [], chatModels: [] },
  ] as const
}

const copyService = (s: ReturnType<typeof detected>[number]) => ({
  ...s,
  models: [...s.models],
  loadedModels: [...s.loadedModels],
  chatModels: [...s.chatModels],
})

/** A stateful fake main process: providers, routing and settings persist across calls. */
function setup(extra: Handlers = {}, initial: Partial<AppSettings> = {}) {
  let settings = AppSettings.parse(initial)
  let providers: ProviderViewT[] = []
  let routing: AppSettings['defaultRouting'] = { image: { providerId: 'mock' } }
  let seq = 0
  const ttx = mockTtx({
    'settings:get': () => settings,
    'settings:update': (patch: Partial<AppSettings>) => {
      settings = AppSettings.parse({
        ...settings,
        ...patch,
        embeddings: { ...settings.embeddings, ...patch.embeddings },
      })
      return settings
    },
    'providers:detect-local': () => detected().map(copyService),
    'providers:list': () => providers,
    'providers:upsert': (req: { config: Partial<ProviderViewT>; apiKey?: string | null }) => {
      const v = {
        options: {},
        enabled: true,
        ...req.config,
        id: req.config.id ?? `p${++seq}`,
        hasKey: typeof req.apiKey === 'string',
      } as ProviderViewT
      providers = [...providers.filter((p) => p.id !== v.id), v]
      return v
    },
    'providers:remove': (req: { id: string }) => {
      providers = providers.filter((p) => p.id !== req.id)
    },
    'providers:models': () => [{ id: 'qwen3-30b-a3b-2507', kind: 'chat' }],
    'providers:test': () => ({ ok: true, sample: 'OK', latencyMs: 412 }),
    'providers:health': () => ({ ok: true, latencyMs: 38 }),
    'providers:test-speech': () => ({
      ok: true,
      dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZF',
      durationSec: 1.2,
      latencyMs: 900,
    }),
    'routing:get': () => ({ global: routing, effective: routing }),
    'routing:set': (req: { routing: AppSettings['defaultRouting'] }) => {
      routing = req.routing
      return { global: routing, effective: routing }
    },
    'comfy:status': () => ({
      ok: true,
      workflows: [
        { id: 'image-sdxl', missingNodes: [] },
        { id: 'video-ltx', missingNodes: ['LTXVLoader'] },
      ],
    }),
    'embeddings:status': () => ({
      mode: settings.embeddings.mode,
      model: settings.embeddings.model,
      dims: 256,
      ready: true,
      downloaded: false,
    }),
    'embeddings:download-model': () => ({ jobId: 'JOB1' }),
    'project:create': (req: { parentDir: string; name: string }) => ({
      path: `${req.parentDir}/${req.name}.asproj`,
    }),
    ...extra,
  } as Handlers)
  return { ttx, routing: () => routing, providers: () => providers, settings: () => settings }
}

function renderWizard(start: StepId | null = null, path = '/welcome') {
  if (start) saveProgress({ step: start })
  queryClient.clear()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<FirstRunRedirect />} />
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/projects" element={<p>Projects page</p>} />
            <Route path="/p/:projectKey/documents" element={<p>Documents page</p>} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 2, name })

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('first-run redirect', () => {
  it('sends a fresh install to the wizard', async () => {
    setup()
    renderWizard(null, '/')
    expect(await heading('Welcome to Action Stations')).toBeTruthy()
  })
  it('sends a finished setup to Projects', async () => {
    setup({}, { onboardingComplete: true })
    renderWizard(null, '/')
    expect(await screen.findByText('Projects page')).toBeTruthy()
  })
})

describe('welcome step', () => {
  it('states the privacy promise, focuses the heading and moves on', async () => {
    setup()
    renderWizard()
    const h = await heading('Welcome to Action Stations')
    await waitFor(() => expect(document.activeElement).toBe(h))
    expect(
      screen.getByText(/Nothing leaves this machine except requests to the model providers/),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /Welcome/ }).getAttribute('aria-current')).toBe(
      'step',
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Get started' }))
    expect(await heading('Choose a text model')).toBeTruthy()
  })
  it('Skip setup marks onboarding complete and opens Projects', async () => {
    const fake = setup()
    renderWizard('media')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Skip setup' }))
    expect(await screen.findByText('Projects page')).toBeTruthy()
    expect(fake.settings().onboardingComplete).toBe(true)
  })
})

describe('text model step', () => {
  it('adds LM Studio with the chat model preselected, tests it and routes the text tasks', async () => {
    const fake = setup()
    renderWizard('text')
    const user = userEvent.setup()
    const list = await screen.findByRole('list', { name: 'Local text services' })
    const select = (await within(list).findByLabelText('LM Studio model')) as HTMLSelectElement
    expect(select.value).toBe('qwen3-30b-a3b-2507')
    expect(within(list).getByText(/Run "ollama serve"/)).toBeTruthy()
    await user.click(within(list).getByRole('button', { name: 'Add LM Studio' }))
    await waitFor(() => expect(fake.providers()).toHaveLength(1))
    expect(fake.providers()[0]).toMatchObject({ ...LM, defaultModel: 'qwen3-30b-a3b-2507' })

    await user.click(await screen.findByRole('button', { name: 'Test' }))
    expect(await screen.findByText('Replied “OK” in 412 ms')).toBeTruthy()
    expect(fake.ttx.calls('providers:test')[0]).toEqual({ id: 'p1', model: 'qwen3-30b-a3b-2507' })

    await user.click(screen.getByRole('button', { name: 'Use this model' }))
    expect(await heading('Media (optional)')).toBeTruthy()
    const ref = { providerId: 'p1', model: 'qwen3-30b-a3b-2507' }
    expect(fake.routing()).toEqual({
      image: { providerId: 'mock' },
      ideate: ref,
      draft: ref,
      critique: ref,
    })
  })

  it('preselects the chat model LM Studio has loaded', async () => {
    setup({
      'providers:detect-local': () =>
        detected().map((s) =>
          s.label === 'LM Studio'
            ? {
                ...s,
                models: ['gpt-oss-20b', ...s.models],
                loadedModels: ['qwen3-30b-a3b-2507', 'text-embedding-nomic-embed-text-v1.5'],
                chatModels: ['gpt-oss-20b', 'qwen3-30b-a3b-2507'],
              }
            : copyService(s),
        ),
    } as Handlers)
    renderWizard('text')
    const list = await screen.findByRole('list', { name: 'Local text services' })
    const select = (await within(list).findByLabelText('LM Studio model')) as HTMLSelectElement
    expect(select.value).toBe('qwen3-30b-a3b-2507')
    expect(within(select).getByText('qwen3-30b-a3b-2507 (loaded)')).toBeTruthy()
    expect(within(list).getByText(/qwen3-30b-a3b-2507 loaded/)).toBeTruthy()
  })

  it('never defaults Ollama to an embedding model and counts only chat models (#225)', async () => {
    const ollama = {
      kind: 'ollama',
      label: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434',
      reachable: true,
      models: ['all-minilm:22m', 'nomic-embed-text:latest', 'qwen2.5:3b', 'smollm:135m'],
      loadedModels: [],
      // Main lists chat models largest first, from Ollama's capabilities.
      chatModels: ['qwen2.5:3b', 'smollm:135m'],
    }
    setup({
      'providers:detect-local': () =>
        detected().map((s) => (s.label === 'Ollama' ? ollama : copyService(s))),
    } as Handlers)
    renderWizard('text')
    const list = await screen.findByRole('list', { name: 'Local text services' })
    const select = (await within(list).findByLabelText('Ollama model')) as HTMLSelectElement
    expect(select.value).toBe('qwen2.5:3b')
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['qwen2.5:3b', 'smollm:135m'])
    expect(within(list).getByText('2 chat models available')).toBeTruthy()
  })

  it('adds Anthropic with a key that is sent once and cleared from the form', async () => {
    const fake = setup()
    renderWizard('text')
    const user = userEvent.setup()
    const form = await screen.findByRole('form', { name: 'Anthropic' })
    expect(within(form).getByText(/billed to your Anthropic account per token/)).toBeTruthy()
    await user.click(within(form).getByRole('button', { name: 'Add Anthropic' }))
    expect(within(form).getByText(/Paste an API key/)).toBeTruthy()
    await user.type(within(form).getByLabelText('Anthropic API key'), KEY)
    await user.click(within(form).getByRole('button', { name: 'Add Anthropic' }))
    await waitFor(() => expect(fake.ttx.calls('providers:upsert')).toHaveLength(1))
    expect(fake.ttx.calls('providers:upsert')[0]).toMatchObject({
      config: { kind: 'anthropic' },
      apiKey: KEY,
    })
    expect(await within(form).findByText('Added')).toBeTruthy()
    expect(document.body.innerHTML).not.toContain(KEY)
  })
})

describe('media step', () => {
  it('adds ComfyUI, lists missing nodes, connects the voice server and routes media', async () => {
    const fake = setup({
      'providers:models': () => [
        { id: 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16', kind: 'unknown' },
        { id: 'mlx-community/VoxCPM2-8bit', kind: 'unknown' },
      ],
    } as Handlers)
    renderWizard('media')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add ComfyUI' }))
    const missing = await screen.findByRole('list', { name: 'Workflows missing nodes' })
    expect(within(missing).getByText(/LTXVLoader/)).toBeTruthy()

    expect((screen.getByLabelText('Voice server URL') as HTMLInputElement).value).toBe(
      'http://127.0.0.1:8765/v1',
    )
    await user.click(screen.getByRole('button', { name: 'Connect voice server' }))
    expect(await screen.findByLabelText('Voice model')).toBeTruthy()
    const tts = fake.providers().find((p) => p.label === 'Local voice (TTS)')!
    expect(tts.options).toEqual({ ttsModel: 'mlx-community/VoxCPM2-8bit' })
    await user.click(screen.getByRole('button', { name: 'Check voice server' }))
    expect(await screen.findByText('Reachable in 38 ms')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Speak a test line' }))
    expect(await screen.findByText('Spoke 1.2 s of audio in 900 ms')).toBeTruthy()
    const audio = screen.getByLabelText('Test line') as HTMLAudioElement
    expect(audio.getAttribute('src')).toMatch(/^blob:/)
    expect(fake.ttx.calls('providers:test-speech')).toEqual([{ id: tts.id }])

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await heading('Search quality')).toBeTruthy()
    const comfy = fake.providers().find((p) => p.kind === 'comfyui')!
    expect(fake.routing()).toEqual({
      image: { providerId: comfy.id },
      video: { providerId: comfy.id },
      audio: { providerId: tts.id, model: 'mlx-community/VoxCPM2-8bit' },
    })
  })

  it('removes the voice provider again when no server answers', async () => {
    const fake = setup({
      'providers:models': () => {
        throw new Error('connect ECONNREFUSED')
      },
    } as Handlers)
    renderWizard('media')
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Connect voice server' }))
    expect(
      await screen.findByText(/No voice server answered at http:\/\/127.0.0.1:8765\/v1/),
    ).toBeTruthy()
    expect(fake.providers()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Skip media' })).toBeTruthy()
  })
})

describe('search quality step', () => {
  it('downloads the local model only after explicit consent and then switches to it', async () => {
    const fake = setup()
    renderWizard('search')
    const user = userEvent.setup()
    await heading('Search quality')
    await user.click(
      screen.getByRole('radio', { name: /Better search: local model \(133 MB download\)/ }),
    )
    expect(fake.ttx.calls('embeddings:download-model')).toHaveLength(0)
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    await user.click(screen.getByRole('button', { name: 'Download 133 MB model' }))
    await waitFor(() => expect(fake.ttx.calls('embeddings:download-model')).toHaveLength(1))
    fake.ttx.emit('job:progress', {
      jobId: 'JOB1',
      kind: 'embed-model-download',
      status: 'running',
      progress: 0.5,
      message: 'model.onnx: 66.0 / 133.0 MB',
    })
    expect(await screen.findByText('model.onnx: 66.0 / 133.0 MB')).toBeTruthy()
    expect(
      screen.getByRole('progressbar', { name: 'Model download' }).getAttribute('aria-valuenow'),
    ).toBe('50')

    fake.ttx.emit('job:done', { jobId: 'JOB1', kind: 'embed-model-download', status: 'done' })
    expect(await screen.findByText('Downloaded')).toBeTruthy()
    await waitFor(() => expect(fake.settings().embeddings.mode).toBe('local-onnx'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await heading('Create your first project')).toBeTruthy()
  })

  it('keeps the fast offline default', async () => {
    const fake = setup()
    renderWizard('search')
    await heading('Search quality')
    expect(
      (screen.getByRole('radio', { name: /Fast and offline/ }) as HTMLInputElement).checked,
    ).toBe(true)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue' }))
    expect(await heading('Create your first project')).toBeTruthy()
    expect(fake.settings().embeddings.mode).toBe('hash')
  })
})

describe('first project and done', () => {
  it('validates, creates the project, completes setup and imports documents', async () => {
    const fake = setup(
      {
        'dialog:open-files': () => ['/src/TIRP.pdf'],
        'documents:import': () => ({ jobId: 'J2', documents: [makeDoc()] }),
      } as Handlers,
      { defaultProjectsDir: '/Users/test/Exercises' },
    )
    renderWizard('project')
    const user = userEvent.setup()
    await heading('Create your first project')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(screen.getByText('Give the project a name.')).toBeTruthy()
    expect(fake.ttx.calls('project:create')).toHaveLength(0)

    await user.type(screen.getByLabelText('Project name'), 'Rivergate Airport')
    await user.type(screen.getByLabelText('Organization'), 'Rivergate Airport Authority')
    await user.type(screen.getByRole('combobox', { name: 'Domain' }), 'airport')
    await user.click(screen.getByRole('option', { name: /^Airport/ }))
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await heading('You’re set up')).toBeTruthy()
    expect(fake.ttx.calls('project:create')[0]).toEqual({
      parentDir: '/Users/test/Exercises',
      name: 'Rivergate Airport',
      orgName: 'Rivergate Airport Authority',
      orgType: 'airport',
    })
    await waitFor(() => expect(fake.settings().onboardingComplete).toBe(true))
    expect(
      screen.getByRole('link', { name: 'Generate an exercise' }).getAttribute('href'),
    ).toContain('/generate')
    expect(screen.getByRole('link', { name: 'Browse inject templates' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review providers and routing' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Import documents…' }))
    expect(await screen.findByText('Documents page')).toBeTruthy()
    expect(fake.ttx.calls('documents:import')[0]).toEqual({
      projectPath: '/Users/test/Exercises/Rivergate Airport.asproj',
      filePaths: ['/src/TIRP.pdf'],
    })
  })

  it('resumes at the step where the user left', async () => {
    setup()
    renderWizard('search')
    expect(await heading('Search quality')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Search quality/ }).getAttribute('aria-current'),
    ).toBe('step')
  })
})
