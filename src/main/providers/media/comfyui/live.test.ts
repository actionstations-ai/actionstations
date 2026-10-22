// Live tests (LIVE=1) against a local ComfyUI (LIVE_COMFY_URL, default http://127.0.0.1:8188)
// using the shipped default workflows. Image needs sd_xl_base_1.0; video needs the models
// listed in comfy/workflows/README.md. LIVE_COMFY_VIDEO=0 skips the (slow) video test;
// LIVE_COMFY_VIDEO_WORKFLOW picks the video workflow (default: the configured default).
// Outputs land in LIVE_COMFY_OUT (default: a temp dir) so they can be inspected.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), isPackaged: false } }))

const LIVE = process.env.LIVE === '1'
const URL = process.env.LIVE_COMFY_URL ?? 'http://127.0.0.1:8188'
const VIDEO = process.env.LIVE_COMFY_VIDEO !== '0'
const VIDEO_WORKFLOW = process.env.LIVE_COMFY_VIDEO_WORKFLOW

const config: ProviderConfig = {
  id: 'comfy-live',
  kind: 'comfyui',
  label: 'ComfyUI',
  baseUrl: URL,
  options: {},
  enabled: true,
}

let outDir = ''
let imagePath = ''

beforeAll(() => {
  process.env.TTX_RESOURCES ??= process.cwd()
  process.env.TTX_USER_DATA ??= mkdtempSync(join(tmpdir(), 'ttx-comfy-live-'))
  outDir = process.env.LIVE_COMFY_OUT ?? mkdtempSync(join(tmpdir(), 'ttx-comfy-out-'))
})

describe.skipIf(!LIVE)('ComfyUI live', () => {
  it('reports health and node classes', async () => {
    const { ComfyMediaProvider } = await import('./provider')
    const p = new ComfyMediaProvider(config)
    const health = await p.health()
    expect(health.ok).toBe(true)
    const classes = await p.nodeClasses()
    expect(classes).toContain('KSampler')
    console.log('[live] comfy health', health.message, `${classes.length} node classes`)
  })

  it('renders the sdxl-photo default workflow', { timeout: 600_000 }, async () => {
    const { ComfyMediaProvider } = await import('./provider')
    const p = new ComfyMediaProvider(config)
    const started = Date.now()
    const progress: number[] = []
    const [out] = await p.generate(
      {
        kind: 'image',
        injectId: 'live-image',
        outDir,
        brief: {
          paths: ['ai_image'],
          imagePrompt:
            'airport terminal check-in hall at dusk, long queue of travelers with rolling suitcases, departure boards powered off and dark, airline staff in uniforms talking to passengers',
          imageStyle: 'phone',
        },
      },
      (pr) => progress.push(pr.progress),
    )
    expect(out?.mimeType).toBe('image/png')
    expect(out?.width).toBe(1216)
    expect(out?.provenance.workflowHash).toMatch(/^[0-9a-f]{64}$/)
    expect(out?.provenance.model).toBe('sd_xl_base_1.0.safetensors')
    expect(progress.some((v) => v > 0.5)).toBe(true)
    imagePath = out!.filePath
    console.log(
      '[live] sdxl-photo',
      out!.filePath,
      `${Date.now() - started} ms`,
      'seed',
      out!.provenance.seed,
    )
  })

  it.skipIf(!VIDEO)(
    'renders the image-to-video default workflow',
    { timeout: 3_600_000 },
    async () => {
      const { ComfyMediaProvider } = await import('./provider')
      const p = new ComfyMediaProvider(config)
      const started = Date.now()
      const outputs = await p.generate(
        {
          kind: 'video',
          injectId: 'live-video',
          ...(VIDEO_WORKFLOW ? { workflowId: VIDEO_WORKFLOW } : {}),
          outDir,
          inputImagePath: imagePath,
          brief: {
            paths: ['ai_video'],
            videoPrompt:
              'handheld phone video in a busy airport check-in hall, travelers shuffle forward in the queue, a staff member gestures, slight camera shake',
            durationSec: 3,
          },
        },
        (pr) => pr.message?.startsWith('Sampling') || console.log('[live] video', pr.message),
      )
      const video = outputs.find((o) => o.kind === 'video')
      expect(video).toBeDefined()
      console.log(
        '[live] image-to-video',
        video!.filePath,
        video!.mimeType,
        `${Date.now() - started} ms`,
        `${video!.durationSec} s`,
      )
    },
  )
})
