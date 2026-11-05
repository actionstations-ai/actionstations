// Contract tests for the fal.ai adapter against an in-process fake of fal's queue API.
import { mkdtempSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { tinyPng } from '../comfyui/fake-server'
import { startFakeFal, type FakeFal, type FakeFalOptions } from './fake-server'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), isPackaged: false } }))

const { createMediaProvider } = await import('../../registry')

let fake: FakeFal | undefined
afterEach(async () => {
  await fake?.close()
  fake = undefined
})

const KLING = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'
const FAST = { pollMinMs: 5, pollMaxMs: 10 }

async function setup(
  opts: FakeFalOptions = {},
  options: Record<string, unknown> = {},
  secret: string | null = 'fal-test-key-1234',
) {
  fake = await startFakeFal(opts)
  const config: ProviderConfig = {
    id: 'fal-test',
    kind: 'fal',
    label: 'fal.ai',
    baseUrl: fake.url,
    options: { ...FAST, ...options },
    enabled: true,
  }
  return { fake, provider: createMediaProvider(config, secret ?? undefined) }
}

const outDir = (): string => mkdtempSync(join(tmpdir(), 'ttx-fal-out-'))

async function stillOnDisk(): Promise<string> {
  const path = join(outDir(), 'still.png')
  await fs.writeFile(path, tinyPng())
  return path
}

const videoJob = async (extra: Record<string, unknown> = {}) => ({
  kind: 'video' as const,
  injectId: 'I-07',
  model: KLING,
  outDir: outDir(),
  inputImagePath: await stillOnDisk(),
  width: 1216,
  height: 832,
  brief: {
    paths: ['ai_video' as const],
    videoPrompt: 'Terminal screens flicker',
    negativePrompt: 'text',
    durationSec: 7,
  },
  ...extra,
})

const imageJob = (extra: Record<string, unknown> = {}) => ({
  kind: 'image' as const,
  injectId: 'I-02',
  model: 'fal-ai/flux/schnell',
  outDir: outDir(),
  width: 832,
  height: 1216,
  seed: 42,
  brief: { paths: ['ai_image' as const], imagePrompt: 'A dark concourse' },
  ...extra,
})

describe('fal.ai video', () => {
  it('submits, polls through the queue, downloads the clip and reports progress', async () => {
    const { fake, provider } = await setup()
    const messages: string[] = []
    const [out] = await provider.generate(await videoJob(), (p) => {
      if (p.message) messages.push(p.message)
    })
    const sent = fake.submits[0]!
    expect(sent.path).toBe(KLING)
    expect(sent.headers.authorization).toBe('Key fal-test-key-1234')
    expect(sent.body.prompt).toBe('Terminal screens flicker')
    expect(sent.body.negative_prompt).toBe('text')
    expect(sent.body.duration).toBe('5')
    expect(String(sent.body.image_url)).toMatch(/^data:image\/png;base64,/)
    expect(sent.body).not.toHaveProperty('aspect_ratio')
    expect(out).toMatchObject({ kind: 'video', mimeType: 'video/mp4', durationSec: 5 })
    expect(await fs.readFile(out!.filePath, 'utf8')).toBe('fake-mp4-bytes')
    expect(out!.posterPath).toBeTruthy()
    expect(out!.provenance).toMatchObject({ provider: 'fal-test', model: KLING })
    expect(messages).toEqual(
      expect.arrayContaining(['Waiting in line (position 1)', 'Generating', 'Media ready']),
    )
    expect(fake.fileFetches[0]).toEqual({})
  })

  it('sends nothing the model does not list: an unknown model gets the prompt only', async () => {
    const { fake, provider } = await setup()
    await provider.generate(await videoJob({ model: 'acme/new-video-model' }))
    expect(Object.keys(fake.submits[0]!.body)).toEqual(['prompt'])
  })

  it('uses the mapping the user saved for a model that is not in the table', async () => {
    const { fake, provider } = await setup(
      {},
      {
        inputMap: {
          'acme/new-video-model': {
            prompt: 'text',
            duration: 'seconds',
            durationAllowed: [4, 8],
            image: 'first_frame',
          },
        },
      },
    )
    await provider.generate(await videoJob({ model: 'acme/new-video-model' }))
    expect(fake.submits[0]!.body).toMatchObject({ text: 'Terminal screens flicker', seconds: '8' })
    expect(String(fake.submits[0]!.body.first_frame)).toMatch(/^data:image/)
  })

  it('refuses an image-to-video model when there is no starting image', async () => {
    const { fake, provider } = await setup()
    await expect(provider.generate(await videoJob({ inputImagePath: undefined }))).rejects.toThrow(
      /needs a starting image/,
    )
    expect(fake.submits).toHaveLength(0)
  })

  it('needs a model id and a prompt', async () => {
    const { provider } = await setup()
    await expect(provider.generate(await videoJob({ model: undefined }))).rejects.toThrow(
      /Choose a fal.ai video model/,
    )
    await expect(provider.generate(await videoJob({ model: '../etc/passwd' }))).rejects.toThrow(
      /Choose a fal.ai video model/,
    )
    await expect(
      provider.generate(await videoJob({ brief: { paths: ['ai_video'] } })),
    ).rejects.toThrow(/no video prompt/)
  })
})

describe('fal.ai image', () => {
  it('maps the frame to an image_size preset and saves the picture', async () => {
    const png = tinyPng(64, 48)
    const { fake, provider } = await setup({
      result: 'image',
      file: { contentType: 'image/png', bytes: png },
    })
    const [out] = await provider.generate(imageJob())
    expect(fake.submits[0]!.body).toEqual({
      prompt: 'A dark concourse',
      image_size: 'portrait_4_3',
      seed: 42,
    })
    expect(out).toMatchObject({ kind: 'image', mimeType: 'image/png', width: 1024, height: 768 })
    expect(out!.filePath.endsWith('.png')).toBe(true)
    expect(out!.posterPath).toBeUndefined()
  })
})

describe('fal.ai failures', () => {
  it('reports a job fal marks as failed, in plain words', async () => {
    const { provider } = await setup({ mode: 'failed' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(
      /could not make the video: content policy violation/,
    )
  })

  it('maps an invalid key to a plain message and never echoes the key', async () => {
    const { provider } = await setup({ mode: 'unauthorized' })
    const err = await provider.generate(await videoJob()).catch((e: Error) => e)
    expect((err as Error).message).toMatch(/rejected the API key/)
    expect((err as Error).message).not.toContain('fal-test-key-1234')
  })

  it('asks for a key when none is stored', async () => {
    const { fake, provider } = await setup({}, {}, null)
    await expect(provider.generate(await videoJob())).rejects.toThrow(/needs an API key/)
    expect(fake.submits).toHaveLength(0)
  })

  it('maps a full queue (429) to a rate limit message', async () => {
    const { provider } = await setup({ mode: 'rate-limited' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/rate limiting/)
  })

  it('cancels the job at fal when the user cancels', async () => {
    const { fake, provider } = await setup({ mode: 'hang' })
    const controller = new AbortController()
    const run = provider.generate(await videoJob({ signal: controller.signal }))
    await vi.waitFor(() => expect(fake.statusPolls).toBeGreaterThan(1))
    controller.abort()
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fake.cancels).toEqual(['req-1'])
  })

  it('gives up after the timeout and cancels the job at fal', async () => {
    const { fake, provider } = await setup({ mode: 'hang' }, { timeoutMs: 60 })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/did not finish within/)
    expect(fake.cancels).toEqual(['req-1'])
  })

  it('refuses a result larger than the limit', async () => {
    const { provider } = await setup({ mode: 'oversized' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/larger than the 200 MB/)
  })

  it('refuses a result whose content type is not a video', async () => {
    const { provider } = await setup({ mode: 'wrong-type' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/type "text\/html"/)
  })

  it('refuses a result link to a private network address', async () => {
    const { provider } = await setup({ mode: 'private-file' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/local address/)
  })

  it('does not follow a status link on another host', async () => {
    const { provider } = await setup({ mode: 'foreign-link' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/another host/)
  })
})

describe('fal.ai health', () => {
  it('accepts a key when fal answers "no such request"', async () => {
    const { provider } = await setup()
    // The fake answers 404 for status of an unknown route shape; any non-401 means the key works.
    expect((await provider.health()).ok).toBe(true)
  })

  it('reports a rejected key', async () => {
    const { provider } = await setup({ mode: 'unauthorized' })
    const h = await provider.health()
    expect(h.ok).toBe(false)
    expect(h.message).toMatch(/rejected the API key/)
  })

  it('advertises image and video only', async () => {
    const { provider } = await setup()
    expect([...provider.capabilities()].sort()).toEqual(['image', 'video'])
  })
})
