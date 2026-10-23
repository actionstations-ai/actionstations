// LIVE=1: speak a two-speaker call through this machine's real system voice (macOS `say`,
// Windows SAPI or espeak-ng) and run the result through the phone post-FX.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyPostFx, decodeWav } from '../audio-fx'
import { findEngine } from './detect'
import { SystemVoiceProvider } from './provider'

const LIVE = process.env.LIVE === '1'

describe.skipIf(!LIVE || !findEngine())('system voice (live)', () => {
  it('voices a phone call as WAV that the post-FX chain accepts', { timeout: 60_000 }, async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-sysvoice-live-'))
    try {
      const p = new SystemVoiceProvider({
        id: 'system-voice',
        kind: 'system-tts',
        label: 'System voice',
        options: {},
        enabled: true,
      })
      expect((await p.health()).ok).toBe(true)
      const [out] = await p.generate({
        kind: 'audio',
        injectId: 'live',
        brief: {
          paths: ['tts'],
          voiceLines: [
            { speaker: 'Caller', voiceStyle: '', text: 'There is an unattended bag at gate four.' },
            { speaker: 'Dispatcher', voiceStyle: '', text: 'Copy. Keep people back from it.' },
          ],
        },
        outDir,
      })
      expect(out!.durationSec).toBeGreaterThan(1.5)
      const voices = out!.provenance.model ?? ''
      console.log(`system voice: ${voices}, ${out!.durationSec} s`)
      const wet = decodeWav(applyPostFx(readFileSync(out!.filePath), ['phone']))
      expect(wet.samples.length).toBeGreaterThan(wet.sampleRate)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
