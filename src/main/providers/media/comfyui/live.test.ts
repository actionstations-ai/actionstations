// Live tests (LIVE=1) against a local ComfyUI (LIVE_COMFY_URL, default http://127.0.0.1:8188)
// using the shipped default workflows. Image needs sd_xl_base_1.0; video needs the models
// listed in comfy/workflows/README.md. LIVE_COMFY_VIDEO=0 skips the (slow) video test;
// LIVE_COMFY_VIDEO_WORKFLOW picks the video workflow (default: the configured default).
// Outputs land in LIVE_COMFY_OUT (default: a temp dir) so they can be inspected.
// LIVE_COMFY_DARK_SEEDS (default 1001,1002,1003) are the seeds of the dark-screens checks
// (#162 power loss, #356 blank screens with the power on).
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Inject, MselRow, ProviderConfig } from '@shared/schemas'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), isPackaged: false } }))

const LIVE = process.env.LIVE === '1'
const URL = process.env.LIVE_COMFY_URL ?? 'http://127.0.0.1:8188'
const VIDEO = process.env.LIVE_COMFY_VIDEO !== '0'
const VIDEO_WORKFLOW = process.env.LIVE_COMFY_VIDEO_WORKFLOW
const DARK_SEEDS = (process.env.LIVE_COMFY_DARK_SEEDS ?? '1001,1002,1003').split(',').map(Number)
/** Most lit-sign pixels (% of the top 40%) a screens-off render may keep (#356). */
const LIT_SIGN_MAX = 0.3

/** Mean Rec. 601 luma (0–255) of a PNG file. */
function meanLuma(file: string): number {
  const png = PNG.sync.read(readFileSync(file))
  let sum = 0
  for (let i = 0; i < png.data.length; i += 4)
    sum += 0.299 * png.data[i]! + 0.587 * png.data[i + 1]! + 0.114 * png.data[i + 2]!
  return sum / (png.width * png.height)
}

/**
 * Share (%) of the top 40% of a PNG whose pixels look like a lit sign: the colour rules of
 * sdxl-photo's screens-off mask (saturated blue: b - r > 0.3, b > 0.35, r and g <= 0.35;
 * amber: r > 0.85, r - b > 0.55, g > 0.55), without its clean-up (#356).
 */
function litSignShare(file: string): number {
  const png = PNG.sync.read(readFileSync(file))
  const rows = Math.floor(png.height * 0.4)
  let lit = 0
  for (let i = 0; i < rows * png.width * 4; i += 4) {
    const [r, g, b] = [png.data[i]! / 255, png.data[i + 1]! / 255, png.data[i + 2]! / 255]
    const blue = b - r > 0.3 && b > 0.35 && r <= 0.35 && g <= 0.35
    const amber = r > 0.85 && r - b > 0.55 && g > 0.55
    if (blue || amber) lit++
  }
  return (lit / (rows * png.width)) * 100
}

/** The #141 brief: sample-run I-10, whose departure boards go dark; `powerLoss` adds a power
 *  failure to it (#162). */
async function darkScreensBrief(powerLoss: boolean) {
  const { normalizeBrief, planMedia } = await import('../../../generate/injects/media-plan')
  const injects = JSON.parse(
    readFileSync(resolve('tests/fixtures/injects/sample-run/injects.json'), 'utf8'),
  ) as Inject[]
  const i10 = injects.find((i) => i.mselRowId === 'I-10')!
  const loss = 'A power failure has cut the terminal lights; emergency lighting only.'
  const inject = powerLoss
    ? { ...i10, fields: { ...i10.fields, sceneBrief: `${String(i10.fields.sceneBrief)} ${loss}` } }
    : i10
  const row: MselRow = {
    id: 'I-10',
    phaseId: 'p1',
    time: '0:10',
    from: 'Social media',
    toRoleIds: ['ops'],
    event: 'Photo of the concourse as the FIDS go dark',
    expectedAction: '',
    purposeTag: 'PRESSURE',
    citations: [],
    locked: false,
  }
  return normalizeBrief(planMedia(inject, row), undefined, inject, { orgType: 'airport' })
}

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

  it(
    'renders the dark-screens brief with a power loss dim (#162)',
    { timeout: 900_000 },
    async () => {
      const { ComfyMediaProvider } = await import('./provider')
      const p = new ComfyMediaProvider(config)
      const brief = await darkScreensBrief(true)
      expect(brief.lighting).toBe('dark')
      for (const seed of DARK_SEEDS) {
        const [out] = await p.generate(
          { kind: 'image', injectId: `live-dark-${seed}`, outDir, seed, brief },
          () => {},
        )
        const luma = meanLuma(out!.filePath)
        console.log('[live] power out', out!.filePath, 'seed', seed, 'mean luma', luma.toFixed(1))
        // Lit concourse renders of this brief measure 87–116; the dark-lighting path 30–40.
        expect(luma).toBeLessThan(60)
      }
    },
  )

  it(
    'renders blank boards with the power on in a lit room with unlit signs (#162, #356)',
    { timeout: 1_800_000 },
    async () => {
      const { ComfyMediaProvider } = await import('./provider')
      const p = new ComfyMediaProvider(config)
      const brief = await darkScreensBrief(false)
      expect(brief.lighting).toBe('screens-off')
      for (const seed of DARK_SEEDS) {
        const [out] = await p.generate(
          { kind: 'image', injectId: `live-blank-${seed}`, outDir, seed, brief },
          () => {},
        )
        const luma = meanLuma(out!.filePath)
        const lit = litSignShare(out!.filePath)
        console.log(
          '[live] power on',
          out!.filePath,
          'seed',
          seed,
          'mean luma',
          luma.toFixed(1),
          'lit-sign pixels in the top 40%',
          `${lit.toFixed(2)}%`,
        )
        expect(luma).toBeGreaterThan(60)
        expect(lit).toBeLessThan(LIT_SIGN_MAX)
      }
    },
  )

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
