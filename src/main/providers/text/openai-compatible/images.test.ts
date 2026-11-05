// Hosted image generation: request and response shapes follow the services' documented
// /images/generations contract. No live calls.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { hostedPresetById } from '@shared/hosted-presets'
import type { MediaJob } from '../../types'
import { stubFetch } from '../test-fixtures'
import { OpenAiCompatibleMediaProvider } from './media'
import { supportedSize } from './images'

const dirs: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function png(width = 16, height = 8): Buffer {
  const p = new PNG({ width, height })
  p.data.fill(120)
  return PNG.sync.write(p)
}

function config(preset: string, over: Partial<ProviderConfig> = {}): ProviderConfig {
  const p = hostedPresetById(preset)!
  return {
    id: `${preset}-img`,
    kind: 'openai-compatible',
    label: p.label,
    baseUrl: p.baseUrl,
    defaultModel: p.defaultModel || 'dep',
    options: { ...p.options, imageModel: 'gpt-image-test' },
    enabled: true,
    ...over,
  }
}

function job(over: Partial<MediaJob> = {}): MediaJob {
  const outDir = mkdtempSync(join(tmpdir(), 'img-test-'))
  dirs.push(outDir)
  return {
    kind: 'image',
    injectId: 'i1',
    brief: { paths: ['ai_image'], imagePrompt: 'A flooded pump house at night' },
    outDir,
    width: 1216,
    height: 832,
    ...over,
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const provider = (c: ProviderConfig, key = 'sk-test-0000000000') =>
  new OpenAiCompatibleMediaProvider(c, key)

describe('hosted image generation', () => {
  it('sends model, prompt, mapped size and n, and writes the b64_json image', async () => {
    const bytes = png(24, 16)
    const calls = stubFetch([json({ created: 1, data: [{ b64_json: bytes.toString('base64') }] })])
    const j = job()
    const [out] = await provider(
      config('openai', { options: { ...config('openai').options, imageQuality: 'low' } }),
    ).generate(j)
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/images/generations')
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-test-0000000000')
    expect(calls[0]!.body).toEqual({
      model: 'gpt-image-test',
      prompt: 'A flooded pump house at night',
      size: '1536x1024',
      n: 1,
      quality: 'low',
    })
    expect(out).toMatchObject({ kind: 'image', mimeType: 'image/png', width: 24, height: 16 })
    expect(out!.filePath.startsWith(j.outDir)).toBe(true)
    expect(readFileSync(out!.filePath).equals(bytes)).toBe(true)
  })

  it('uses the routed model before options.imageModel', async () => {
    const calls = stubFetch([json({ data: [{ b64_json: png().toString('base64') }] })])
    await provider(config('openai')).generate(job({ model: 'routed-image' }))
    expect((calls[0]!.body as { model: string }).model).toBe('routed-image')
  })

  it('downloads the url form without sending the key', async () => {
    const bytes = png()
    const calls = stubFetch((c) =>
      c.url.endsWith('/images/generations')
        ? json({ data: [{ url: 'https://files.example.com/a.png' }] })
        : new Response(bytes, { headers: { 'content-type': 'image/png' } }),
    )
    const [out] = await provider(config('openai')).generate(job())
    expect(calls[1]!.url).toBe('https://files.example.com/a.png')
    expect(calls[1]!.headers.authorization).toBeUndefined()
    expect(readFileSync(out!.filePath).equals(bytes)).toBe(true)
  })

  it('refuses a download that is not an image or is over 30 MB', async () => {
    stubFetch((c) =>
      c.url.endsWith('/images/generations')
        ? json({ data: [{ url: 'https://files.example.com/a.png' }] })
        : new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    )
    await expect(provider(config('openai')).generate(job())).rejects.toThrow(/not an image/)
    stubFetch((c) =>
      c.url.endsWith('/images/generations')
        ? json({ data: [{ url: 'https://files.example.com/a.png' }] })
        : new Response(png(), {
            headers: { 'content-type': 'image/png', 'content-length': String(31 * 1024 * 1024) },
          }),
    )
    await expect(provider(config('openai')).generate(job())).rejects.toThrow(/30 MB/)
  })

  it('rejects bytes that are not an image even when the service says they are', async () => {
    stubFetch([
      json({ data: [{ b64_json: Buffer.from('not an image at all').toString('base64') }] }),
    ])
    await expect(provider(config('openai')).generate(job())).rejects.toThrow(/not an image/)
  })

  it('maps sizes: OpenAI to its supported sizes, Gemini keeps the request', () => {
    const o = config('openai')
    expect(supportedSize(o, 'gpt-image-1', 1216, 832)).toBe('1536x1024')
    expect(supportedSize(o, 'gpt-image-1', 832, 1216)).toBe('1024x1536')
    expect(supportedSize(o, 'gpt-image-1', 1024, 1024)).toBe('1024x1024')
    expect(supportedSize(config('gemini'), 'gemini-2.5-flash-image', 1216, 832)).toBe('1216x832')
  })

  it('asks Gemini for b64_json and uses its base URL', async () => {
    const calls = stubFetch([json({ data: [{ b64_json: png().toString('base64') }] })])
    await provider(
      config('gemini', {
        options: { ...config('gemini').options, imageModel: 'gemini-2.5-flash-image' },
      }),
    ).generate(job())
    expect(calls[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/images/generations',
    )
    expect(calls[0]!.body).toMatchObject({ response_format: 'b64_json', size: '1216x832' })
  })

  it('sends the Azure key in the api-key header', async () => {
    const calls = stubFetch([json({ data: [{ b64_json: png().toString('base64') }] })])
    const c = config('azure-openai', { baseUrl: 'https://contoso.openai.azure.com/openai/v1/' })
    await provider(c, 'azure-key-0000').generate(job())
    expect(calls[0]!.headers['api-key']).toBe('azure-key-0000')
    expect(calls[0]!.headers.authorization).toBeUndefined()
  })

  describe('errors in plain words', () => {
    const fail = async (res: Response) => {
      stubFetch([res])
      return provider(config('openai'))
        .generate(job())
        .then(
          () => '',
          (e: Error) => e.message,
        )
    }

    it('invalid key', async () => {
      const m = await fail(
        json({ error: { message: 'Incorrect API key provided', code: 'invalid_api_key' } }, 401),
      )
      expect(m).toMatch(/did not accept the API key/)
      expect(m).not.toContain('sk-test')
    })

    it('no credit', async () => {
      expect(
        await fail(
          json(
            { error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } },
            429,
          ),
        ),
      ).toMatch(/no credit or quota/)
    })

    it('rate limited with Retry-After', async () => {
      expect(
        await fail(
          json({ error: { message: 'Rate limit reached' } }, 429, { 'retry-after': '17' }),
        ),
      ).toMatch(/rate limiting.*17 seconds/)
    })

    it('model not available', async () => {
      expect(
        await fail(
          json(
            { error: { message: 'The model `nope` does not exist', code: 'model_not_found' } },
            404,
          ),
        ),
      ).toMatch(/does not offer that image model/)
    })

    it('moderation refusal', async () => {
      expect(
        await fail(
          json(
            {
              error: {
                message: 'Your request was rejected by the safety system.',
                code: 'moderation_blocked',
              },
            },
            400,
          ),
        ),
      ).toMatch(/refused the image because of its content rules/)
    })
  })

  it('advertises image for hosted presets and not for a local server', () => {
    expect(provider(config('openai')).capabilities().has('image')).toBe(true)
    expect(provider(config('gemini')).capabilities().has('image')).toBe(true)
    const local = {
      ...config('openai'),
      baseUrl: 'http://127.0.0.1:1234/v1',
      options: { imageModel: 'x' },
    }
    expect(provider(local).capabilities()).toEqual(new Set(['audio']))
  })

  it('needs a model from the route or the options', async () => {
    const c = config('openai')
    delete c.options.imageModel
    await expect(provider(c).generate(job())).rejects.toThrow(/image model/)
  })
})
