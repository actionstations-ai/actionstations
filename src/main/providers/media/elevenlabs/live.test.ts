// Opt-in live check (LIVE=1 LIVE_PAID=1 ELEVENLABS_API_KEY=...). The free voice list runs with
// LIVE=1 alone; speech spends credits, so it needs LIVE_PAID=1 as well.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { ElevenLabsProvider } = await import('./provider')

const KEY = process.env.ELEVENLABS_API_KEY
const live = process.env.LIVE === '1' && !!KEY
const paid = live && process.env.LIVE_PAID === '1'

const provider = (options: Record<string, unknown> = {}) =>
  new ElevenLabsProvider(
    { id: 'eleven', kind: 'elevenlabs', label: 'ElevenLabs', options, enabled: true },
    KEY,
  )

describe.skipIf(!live)('ElevenLabs live', () => {
  it('lists voices and models with the free calls', async () => {
    const p = provider()
    expect((await p.health()).ok).toBe(true)
    expect((await p.listVoices()).length).toBeGreaterThan(0)
    expect((await p.listModels()).length).toBeGreaterThan(0)
  })

  it.skipIf(!paid)('speaks one short line', async () => {
    const p = provider()
    const voice = (await p.listVoices())[0]!.id
    const [out] = await provider({ voice, sampleRate: 24000 }).generate({
      kind: 'audio',
      injectId: 'live',
      brief: { paths: ['tts'], voiceLines: [{ speaker: 'A', voiceStyle: '', text: 'Test.' }] },
      outDir: mkdtempSync(join(tmpdir(), 'ttx-eleven-live-')),
    })
    expect(out!.durationSec).toBeGreaterThan(0)
  })
})
