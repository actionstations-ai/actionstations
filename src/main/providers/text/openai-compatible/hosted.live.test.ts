// Opt-in live check of the hosted presets: one model-list call per service whose key is in the
// environment. Needs LIVE=1 and LIVE_PAID=1; skipped in CI and whenever a key is missing.
// The model list is free; no generation is requested.
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { hostedPresetById } from '@shared/hosted-presets'
import { LIVE } from '../test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { OpenAiCompatibleTextProvider } = await import('./chat')

const LIVE_PAID = LIVE && process.env.LIVE_PAID === '1'
const KEYS: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
}

describe.skipIf(!LIVE_PAID)('hosted presets (live)', () => {
  for (const [id, key] of Object.entries(KEYS)) {
    it.skipIf(!key)(`${id}: Test connection lists models`, async () => {
      const p = hostedPresetById(id)!
      const provider = new OpenAiCompatibleTextProvider(
        {
          id: `${id}-live`,
          kind: 'openai-compatible',
          label: p.label,
          baseUrl: p.baseUrl,
          defaultModel: p.defaultModel,
          options: p.options,
          enabled: true,
        },
        key,
      )
      const health = await provider.health()
      expect(health.ok, health.message).toBe(true)
    })
  }
})
