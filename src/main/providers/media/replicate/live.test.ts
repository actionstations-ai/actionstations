// Opt-in live check of Replicate: the free token check, then one image from the cheapest model.
// Needs LIVE=1, LIVE_PAID=1 and REPLICATE_API_TOKEN; skipped in CI and whenever the token is missing.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LIVE } from '../../text/test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), isPackaged: false } }))
const { ReplicateMediaProvider } = await import('./provider')

const TOKEN = process.env.REPLICATE_API_TOKEN
const LIVE_PAID = LIVE && process.env.LIVE_PAID === '1'

describe.skipIf(!LIVE_PAID || !TOKEN)('Replicate (live)', () => {
  const provider = new ReplicateMediaProvider(
    { id: 'replicate-live', kind: 'replicate', label: 'Replicate', options: {}, enabled: true },
    TOKEN,
  )

  it('accepts the token without generating anything', async () => {
    expect((await provider.health()).ok).toBe(true)
  })

  it('makes one small image with the cheapest model', async () => {
    const [out] = await provider.generate({
      kind: 'image',
      injectId: 'live',
      model: 'black-forest-labs/flux-schnell',
      outDir: mkdtempSync(join(tmpdir(), 'ttx-replicate-live-')),
      width: 512,
      height: 512,
      brief: { paths: ['ai_image'], imagePrompt: 'A plain grey airport concourse, photograph' },
    })
    expect(out?.mimeType).toMatch(/^image\//)
  }, 180_000)
})
