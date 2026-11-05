// Opt-in live check of fal.ai: the free key check, then one image from the cheapest model.
// Needs LIVE=1, LIVE_PAID=1 and FAL_KEY; skipped in CI and whenever the key is missing.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LIVE } from '../../text/test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), isPackaged: false } }))
const { FalMediaProvider } = await import('./provider')

const KEY = process.env.FAL_KEY
const LIVE_PAID = LIVE && process.env.LIVE_PAID === '1'

describe.skipIf(!LIVE_PAID || !KEY)('fal.ai (live)', () => {
  const provider = new FalMediaProvider(
    { id: 'fal-live', kind: 'fal', label: 'fal.ai', options: {}, enabled: true },
    KEY,
  )

  it('accepts the key without generating anything', async () => {
    expect((await provider.health()).ok).toBe(true)
  })

  it('makes one small image with the cheapest model', async () => {
    const [out] = await provider.generate({
      kind: 'image',
      injectId: 'live',
      model: 'fal-ai/flux/schnell',
      outDir: mkdtempSync(join(tmpdir(), 'ttx-fal-live-')),
      width: 512,
      height: 512,
      brief: { paths: ['ai_image'], imagePrompt: 'A plain grey airport concourse, photograph' },
    })
    expect(out?.mimeType).toMatch(/^image\//)
  }, 180_000)
})
