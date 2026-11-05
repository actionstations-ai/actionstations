// Contract tests for the Replicate adapter against an in-process fake of its predictions API.
import { mkdtempSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { tinyPng } from '../comfyui/fake-server'
import { startFakeReplicate, type FakeReplicate, type FakeReplicateOptions } from './fake-server'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), isPackaged: false } }))

const { createMediaProvider } = await import('../../registry')

let fake: FakeReplicate | undefined
afterEach(async () => {
  await fake?.close()
  fake = undefined
})

const KLING = 'kwaivgi/kling-v2.5-turbo-pro'
const FAST = { pollMinMs: 5, pollMaxMs: 10 }
const TOKEN = 'r8_test-token-1234'

async function setup(
  opts: FakeReplicateOptions = {},
  options: Record<string, unknown> = {},
  secret: string | null = TOKEN,
) {
  fake = await startFakeReplicate(opts)
  const config: ProviderConfig = {
    id: 'replicate-test',
    kind: 'replicate',
    label: 'Replicate',
    baseUrl: fake.url,
    options: { ...FAST, ...options },
    enabled: true,
  }
  return { fake, provider: createMediaProvider(config, secret ?? undefined) }
}

const outDir = (): string => mkdtempSync(join(tmpdir(), 'ttx-replicate-out-'))

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
  model: 'black-forest-labs/flux-schnell',
  outDir: outDir(),
  width: 832,
  height: 1216,
  seed: 42,
  brief: { paths: ['ai_image' as const], imagePrompt: 'A dark concourse' },
  ...extra,
})

describe('Replicate video', () => {
  it('finishes inside Prefer: wait and downloads the clip with the token', async () => {
    const { fake, provider } = await setup({ mode: 'sync' })
    const [out] = await provider.generate(await videoJob())
    const sent = fake.creates[0]!
    expect(sent.path).toBe(KLING)
    expect(sent.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(sent.headers.prefer).toBe('wait=60')
    expect(sent.body).toMatchObject({
      prompt: 'Terminal screens flicker',
      negative_prompt: 'text',
      duration: 5,
    })
    expect(String(sent.body.start_image)).toMatch(/^data:image\/png;base64,/)
    expect(sent.body).not.toHaveProperty('aspect_ratio')
    expect(fake.polls).toBe(0)
    expect(out).toMatchObject({ kind: 'video', mimeType: 'video/mp4', durationSec: 5 })
    expect(await fs.readFile(out!.filePath, 'utf8')).toBe('fake-mp4-bytes')
    expect(out!.posterPath).toBeTruthy()
    expect(out!.provenance).toMatchObject({ provider: 'replicate-test', model: KLING })
    expect(fake.fileFetches[0]).toEqual({ authorization: `Bearer ${TOKEN}` })
  })

  it('polls a slow prediction until it succeeds and reports progress', async () => {
    const { fake, provider } = await setup({ mode: 'async', processingPolls: 2 })
    const messages: string[] = []
    const [out] = await provider.generate(await videoJob(), (p) => {
      if (p.message) messages.push(p.message)
    })
    expect(fake.polls).toBe(3)
    expect(out!.mimeType).toBe('video/mp4')
    expect(messages).toEqual(expect.arrayContaining(['Generating', 'Media ready']))
  })

  it('sends nothing the model does not list: an unknown model gets the prompt only', async () => {
    const { fake, provider } = await setup()
    await provider.generate(await videoJob({ model: 'acme/new-video-model' }))
    expect(Object.keys(fake.creates[0]!.body)).toEqual(['prompt'])
  })

  it('sends a mapped duration as a number for a model that is not in the table', async () => {
    const { fake, provider } = await setup(
      {},
      {
        inputMap: {
          'acme/new-video-model': { prompt: 'text', duration: 'seconds', durationAllowed: [4, 8] },
        },
      },
    )
    await provider.generate(await videoJob({ model: 'acme/new-video-model' }))
    expect(fake.creates[0]!.body).toMatchObject({ text: 'Terminal screens flicker', seconds: 8 })
  })

  it('refuses an image-to-video model when there is no starting image', async () => {
    const { fake, provider } = await setup()
    const job = await videoJob({ model: 'wan-video/wan-2.5-i2v-fast', inputImagePath: undefined })
    await expect(provider.generate(job)).rejects.toThrow(/needs a starting image/)
    expect(fake.creates).toHaveLength(0)
  })

  it('needs an owner/name model and a prompt', async () => {
    const { provider } = await setup()
    for (const model of [undefined, '../etc/passwd', 'just-a-name'])
      await expect(provider.generate(await videoJob({ model }))).rejects.toThrow(
        /Choose a Replicate video model/,
      )
    await expect(
      provider.generate(await videoJob({ brief: { paths: ['ai_video'] } })),
    ).rejects.toThrow(/no video prompt/)
  })
})

describe('Replicate image', () => {
  it('maps the frame to an aspect ratio, accepts a list output and saves the picture', async () => {
    const { fake, provider } = await setup({
      mode: 'sync',
      output: 'array',
      file: { contentType: 'image/png', bytes: tinyPng(64, 48) },
    })
    const [out] = await provider.generate(imageJob())
    expect(fake.creates[0]!.body).toEqual({
      prompt: 'A dark concourse',
      aspect_ratio: '2:3',
      seed: 42,
    })
    expect(out).toMatchObject({ kind: 'image', mimeType: 'image/png', width: 64, height: 48 })
    expect(out!.posterPath).toBeUndefined()
  })
})

describe('Replicate failures', () => {
  it('reports a failed prediction with its error', async () => {
    const { provider } = await setup({ mode: 'failed' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(
      /could not make the video: Model crashed/,
    )
  })

  it('calls a flagged prompt a refusal by the safety check', async () => {
    const { provider } = await setup({ mode: 'nsfw' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/refused the content/)
  })

  it('maps an invalid token to a plain message and never echoes it', async () => {
    const { provider } = await setup({ mode: 'unauthorized' })
    const err = (await provider.generate(await videoJob()).catch((e: Error) => e)) as Error
    expect(err.message).toMatch(/rejected the API token/)
    expect(err.message).not.toContain(TOKEN)
  })

  it('maps 402 to a billing message', async () => {
    const { provider } = await setup({ mode: 'billing' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(
      /needs billing set up or more credit/,
    )
  })

  it('maps 404 to a missing model', async () => {
    const { provider } = await setup({ mode: 'not-found' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/does not have that model/)
  })

  it('maps 429 to a rate limit message with the retry time', async () => {
    const { provider } = await setup({ mode: 'rate-limited' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(
      /rate limiting requests. Try again in about 30 seconds/,
    )
  })

  it('asks for a token when none is stored', async () => {
    const { fake, provider } = await setup({}, {}, null)
    await expect(provider.generate(await videoJob())).rejects.toThrow(/needs an API token/)
    expect(fake.creates).toHaveLength(0)
  })

  it('cancels the prediction at Replicate when the user cancels', async () => {
    const { fake, provider } = await setup({ mode: 'hang' })
    const controller = new AbortController()
    const run = provider.generate(await videoJob({ signal: controller.signal }))
    await vi.waitFor(() => expect(fake.polls).toBeGreaterThan(1))
    controller.abort()
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fake.cancels).toEqual(['pred1234'])
  })

  it('gives up after the timeout and cancels the prediction', async () => {
    const { fake, provider } = await setup({ mode: 'hang' }, { timeoutMs: 60 })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/did not finish within/)
    expect(fake.cancels).toEqual(['pred1234'])
  })

  it('reports a prediction Replicate cancelled on its side', async () => {
    const { provider } = await setup({ mode: 'canceled' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/cancelled the video/)
  })

  it('refuses a result larger than the limit', async () => {
    const { provider } = await setup({ mode: 'oversized' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/larger than the 200 MB/)
  })

  it('refuses a result whose content type is not a video', async () => {
    const { provider } = await setup({ mode: 'wrong-type' })
    await expect(provider.generate(await videoJob())).rejects.toThrow(/type "text\/html"/)
  })
})

describe('Replicate health', () => {
  it('reads the account without making a prediction', async () => {
    const { fake, provider } = await setup()
    const h = await provider.health()
    expect(h).toMatchObject({ ok: true, message: 'Replicate token accepted (exercise-lead)' })
    expect(fake.accountCalls).toBe(1)
    expect(fake.creates).toHaveLength(0)
  })

  it('reports a rejected token', async () => {
    const { provider } = await setup({ mode: 'unauthorized' })
    const h = await provider.health()
    expect(h.ok).toBe(false)
    expect(h.message).toMatch(/rejected the API token/)
  })

  it('advertises image and video only', async () => {
    const { provider } = await setup()
    expect([...provider.capabilities()].sort()).toEqual(['image', 'video'])
  })
})
