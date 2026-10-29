// Live test (LIVE=1) against local servers only: runs the eight SimCell probes and prints the
// level. Expected: LM Studio qwen3-30b-a3b-2507 Suited, Ollama qwen2.5:3b Not suited, which
// documents the spread of the gate. Never calls a paid API.
//   LM Studio  LIVE_LMSTUDIO_URL (http://127.0.0.1:1234/v1), model LIVE_LMSTUDIO_MODEL
//   Ollama     LIVE_OLLAMA_URL   (http://127.0.0.1:11434),   model LIVE_OLLAMA_MODEL
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { LIVE } from '../providers/text/test-fixtures'
import { runProbes } from './capability'
import { replyPrompt } from './test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { createTextProvider } = await import('../providers/registry')

beforeAll(() => {
  process.env.TTX_USER_DATA ??= mkdtempSync(join(tmpdir(), 'ttx-live-'))
})

const cfg = (
  kind: ProviderConfig['kind'],
  id: string,
  baseUrl: string,
  defaultModel: string,
): ProviderConfig => ({ id, kind, label: id, baseUrl, defaultModel, options: {}, enabled: true })

async function level(config: ProviderConfig) {
  const result = await runProbes({
    provider: createTextProvider(config, undefined),
    model: config.defaultModel!,
    providerId: config.id,
    prompt: replyPrompt(),
    knownNames: [],
  })
  console.log(`[live] simcell ${config.id}/${config.defaultModel}`, JSON.stringify(result))
  return result
}

describe.skipIf(!LIVE)('live: the SimCell capability gate', () => {
  it('rates a 30B model on LM Studio', async () => {
    const r = await level(
      cfg(
        'openai-compatible',
        'lmstudio',
        process.env.LIVE_LMSTUDIO_URL ?? 'http://127.0.0.1:1234/v1',
        process.env.LIVE_LMSTUDIO_MODEL ?? 'qwen3-30b-a3b-2507',
      ),
    )
    expect(['suited', 'limited']).toContain(r.level)
  }, 600_000)

  it('rates a 3B model on Ollama', async () => {
    const r = await level(
      cfg(
        'ollama',
        'ollama',
        process.env.LIVE_OLLAMA_URL ?? 'http://127.0.0.1:11434',
        process.env.LIVE_OLLAMA_MODEL ?? 'qwen2.5:3b',
      ),
    )
    expect(['limited', 'not_suited']).toContain(r.level)
  }, 600_000)
})
