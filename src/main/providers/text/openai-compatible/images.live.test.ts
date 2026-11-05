// Opt-in live check of hosted image generation: one small, low-quality image. This spends real
// money, so it needs LIVE=1 and LIVE_PAID=1 and an OPENAI_API_KEY; skipped in CI.
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { hostedPresetById } from '@shared/hosted-presets'
import { LIVE } from '../test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { OpenAiCompatibleMediaProvider } = await import('./media')

const KEY = process.env.OPENAI_API_KEY
const LIVE_PAID = LIVE && process.env.LIVE_PAID === '1'

describe.skipIf(!LIVE_PAID || !KEY)('OpenAI images (live, paid)', () => {
  it('draws one low-quality image', async () => {
    const p = hostedPresetById('openai')!
    const outDir = mkdtempSync(join(tmpdir(), 'img-live-'))
    try {
      const media = new OpenAiCompatibleMediaProvider(
        {
          id: 'openai-live',
          kind: 'openai-compatible',
          label: 'OpenAI',
          baseUrl: p.baseUrl,
          options: {
            ...p.options,
            imageModel: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
            imageQuality: 'low',
          },
          enabled: true,
        },
        KEY,
      )
      const [out] = await media.generate({
        kind: 'image',
        injectId: 'live',
        brief: { paths: ['ai_image'], imagePrompt: 'A quiet harbor at dawn, photograph' },
        outDir,
      })
      expect(statSync(out!.filePath).size).toBeGreaterThan(1000)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
