// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkflowEntry } from '@shared/ipc'
import WorkflowsPage from './WorkflowsPage'
import { FakeIpcError, mockTtx, renderAt } from '../documents/test-utils'

const photo: WorkflowEntry = {
  id: 'sdxl-photo',
  name: 'SDXL documentary photo',
  mediaType: 'image',
  source: 'default',
  description: 'SDXL base text-to-image',
  bindings: [{ target: ['6', 'inputs', 'text'], source: 'imagePrompt' }],
  requiredNodes: ['KSampler'],
  missingNodes: [],
  sha256: 'a'.repeat(64),
}
const video: WorkflowEntry = {
  ...photo,
  id: 'image-to-video',
  name: 'Wan 2.2 image-to-video',
  mediaType: 'video',
  bindings: [],
  missingNodes: ['Wan22ImageToVideoLatent', 'SaveVideo'],
}

const comfyProvider = {
  id: 'comfy',
  kind: 'comfyui' as const,
  label: 'ComfyUI',
  baseUrl: 'http://127.0.0.1:8188',
  options: {},
  enabled: true,
  hasKey: false,
}

function setup(over: Parameters<typeof mockTtx>[0] = {}) {
  return mockTtx({
    'providers:list': () => [comfyProvider],
    'comfy:status': () => ({ ok: true, message: 'ComfyUI 0.42.0 on mps', workflows: [] }),
    'comfy:workflows:list': () => [photo, video],
    'comfy:defaults:get': () => ({ image: 'sdxl-photo', video: 'image-to-video' }),
    'comfy:defaults:set': (req: never) => ({ image: 'sdxl-photo', ...(req as object) }),
    'comfy:workflows:inputs': () => [
      { nodeId: '3', classType: 'KSampler', inputName: 'steps', value: 25 },
      {
        nodeId: '6',
        classType: 'CLIPTextEncode',
        title: 'Positive prompt',
        inputName: 'text',
        value: 'x',
      },
    ],
    'comfy:workflows:save-bindings': () => photo,
    'comfy:test-render': () => ({
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      seed: 99,
      elapsedMs: 15_500,
    }),
    ...over,
  })
}

afterEach(() => cleanup())

describe('WorkflowsPage', () => {
  it('shows status, defaults and missing-node warnings by media type', async () => {
    setup()
    renderAt('/workflows', '/workflows', WorkflowsPage)
    expect(await screen.findByText('Connected')).toBeTruthy()
    expect(screen.getByText('ComfyUI 0.42.0 on mps')).toBeTruthy()
    const videos = screen.getByRole('region', { name: 'Video' })
    expect(
      within(videos).getByText(/Missing nodes: Wan22ImageToVideoLatent, SaveVideo/),
    ).toBeTruthy()
    const images = screen.getByRole('region', { name: 'Image' })
    expect(within(images).getByText('All nodes available')).toBeTruthy()
    const defaults = screen.getByRole('region', { name: 'Defaults' })
    expect((within(defaults).getByLabelText('Image') as HTMLSelectElement).value).toBe('sdxl-photo')
  })

  it('edits bindings: binds a row to a fixed value and saves', async () => {
    const { calls } = setup()
    renderAt('/workflows', '/workflows', WorkflowsPage)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /SDXL documentary photo/ }))
    const steps = await screen.findByLabelText('Binding for KSampler steps')
    expect(
      (screen.getByLabelText('Binding for Positive prompt text') as HTMLSelectElement).value,
    ).toBe('imagePrompt')
    await user.selectOptions(steps, 'literal')
    const fixed = screen.getByLabelText('Fixed value for KSampler steps')
    await user.clear(fixed)
    await user.type(fixed, '30')
    await user.click(screen.getByRole('button', { name: 'Save bindings' }))
    await waitFor(() =>
      expect(calls('comfy:workflows:save-bindings')).toEqual([
        {
          id: 'sdxl-photo',
          bindings: [
            { target: ['3', 'inputs', 'steps'], source: 'literal', value: 30 },
            { target: ['6', 'inputs', 'text'], source: 'imagePrompt' },
          ],
        },
      ]),
    )
  })

  it('test-renders and previews the image inline', async () => {
    const { calls } = setup()
    renderAt('/workflows', '/workflows', WorkflowsPage)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /SDXL documentary photo/ }))
    await user.type(screen.getByLabelText('Prompt'), 'a hangar')
    await user.click(screen.getByRole('button', { name: 'Test render' }))
    const img = (await screen.findByAltText('Test render output')) as HTMLImageElement
    expect(img.src.startsWith('data:image/png')).toBe(true)
    expect(screen.getByText(/15\.5 s · seed 99/)).toBeTruthy()
    expect(calls('comfy:test-render')).toEqual([
      { providerId: 'comfy', workflowId: 'sdxl-photo', prompt: 'a hangar' },
    ])
  })

  it('import explains an editor-format file', async () => {
    setup({
      'dialog:open-files': () => ['/tmp/My Flow.json'],
      'comfy:workflows:import': () => {
        throw new FakeIpcError(
          'VALIDATION',
          'This is a ComfyUI editor (UI) workflow. Export (API) instead.',
        )
      },
    })
    renderAt('/workflows', '/workflows', WorkflowsPage)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Import workflow' }))
    await user.click(screen.getByRole('button', { name: 'Choose file…' }))
    expect(((await screen.findByLabelText('Name')) as HTMLInputElement).value).toBe('My Flow')
    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Export \(API\)/)
  })

  it('explains what to do without a ComfyUI provider', async () => {
    setup({ 'providers:list': () => [] })
    renderAt('/workflows', '/workflows', WorkflowsPage)
    expect(await screen.findByText('No ComfyUI provider')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Audio (TTS)' }).textContent).toMatch(
      /No TTS workflow/,
    )
  })

  it('labels pack workflows with their pack and offers a reset, not a delete', async () => {
    const yard: WorkflowEntry = {
      ...photo,
      id: 'yard-cctv-still',
      name: 'Yard CCTV still',
      source: 'pack',
      packId: 'ai.actionstations.freight-rail',
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
    }
    setup({ 'comfy:workflows:list': () => [photo, yard, video] })
    renderAt('/workflows', '/workflows', WorkflowsPage)
    const card = await screen.findByRole('button', { name: /Yard CCTV still/ })
    const badge = within(card).getByRole('img', { name: /Freight Rail Operations/ })
    expect(badge.textContent).toBe('Pack: Freight Rail Operations 1.0.0')
    await userEvent.click(card)
    expect(await screen.findByRole('button', { name: 'Reset bindings to pack' })).toBeTruthy()
  })

  it('badges a project copy of a pack workflow with its copy state (#269)', async () => {
    const copy: WorkflowEntry = {
      ...photo,
      id: 'yard-cctv-still',
      name: 'Yard CCTV still',
      source: 'project',
      packId: 'ai.actionstations.freight-rail',
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
      copy: { edited: true, packMissing: false, updateAvailable: true, installedVersion: '1.1.0' },
    }
    setup({ 'comfy:workflows:list': () => [photo, copy, video] })
    renderAt('/workflows', '/workflows', WorkflowsPage)
    const card = await screen.findByRole('button', { name: /Yard CCTV still/ })
    const badge = within(card).getByRole('img', { name: /Freight Rail Operations/ })
    expect(badge.getAttribute('aria-label')).toBe(
      'Project copy from pack Freight Rail Operations 1.0.0, edited, update available (1.1.0 installed)',
    )
    expect(badge.textContent).toBe('From Freight Rail Operations 1.0.0editedUpdate available')
  })
})
