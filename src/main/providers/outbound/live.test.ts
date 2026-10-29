// Live check of redaction against Anthropic (#433). Paid, so it runs only with LIVE=1 and a key
// in LIVE_ANTHROPIC_KEY (never read from the app's keychain). A short fixed prompt with a
// fictional name and phone number goes out redacted and comes back restored.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PrivacySettings, REDACTION_CATEGORIES, type ProviderConfig } from '@shared/schemas'
import type { ChatRequest } from '../types'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { createTextProvider } = await import('../registry')
const { Approvals } = await import('./approvals')
const { emptyContext } = await import('./detect')
const { guardText } = await import('./gate')
const { RedactionRegistry } = await import('./redact')

const KEY = process.env.LIVE_ANTHROPIC_KEY
const RUN = process.env.LIVE === '1' && !!KEY

describe.skipIf(!RUN)('live: Anthropic with redaction', () => {
  it('sends placeholders and restores the reply', async () => {
    process.env.TTX_USER_DATA ??= mkdtempSync(join(tmpdir(), 'ttx-live-'))
    const config: ProviderConfig = {
      id: 'anthropic-live',
      kind: 'anthropic',
      label: 'Anthropic',
      defaultModel: process.env.LIVE_ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
      options: {},
      enabled: true,
    }
    const inner = createTextProvider(config, KEY)
    const seen: ChatRequest[] = []
    const spy: typeof inner = Object.assign(Object.create(inner) as typeof inner, {
      chat: (req: ChatRequest) => (seen.push(req), inner.chat(req)),
    })
    const provider = guardText(spy, config, {
      approvals: new Approvals({
        needed: () => undefined,
        settled: () => undefined,
        cancelJob: () => undefined,
      }),
      privacy: async () => PrivacySettings.parse({ review: 'off' }),
      context: async () => emptyContext(),
      registry: async () => new RedactionRegistry(Buffer.alloc(32, 1)),
      enabled: () => new Set(REDACTION_CATEGORIES),
      log: async () => undefined,
      knownProject: async () => false,
    })
    const res = await provider.chat({
      maxTokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Repeat this sentence exactly: Call Chief Dana Ruiz at (509) 555-0142.',
        },
      ],
    })
    expect(JSON.stringify(seen)).not.toContain('Dana Ruiz')
    expect(JSON.stringify(seen)).not.toContain('555-0142')
    expect(res.text).toContain('Dana Ruiz')
    expect(res.text).toContain('(509) 555-0142')
  }, 60_000)
})
