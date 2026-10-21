import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { CALL_LOG_FILE, logProviderCall, withChatLog } = await import('./call-log')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ttx-calllog-'))
  process.env.TTX_USER_DATA = dir
})

const lines = () =>
  readFileSync(join(dir, CALL_LOG_FILE), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>)

describe('provider call log', () => {
  it('appends one metering line per call without prompt text', async () => {
    const res = await withChatLog({ providerId: 'p1', kind: 'ollama', model: 'm' }, async () => ({
      text: 'SECRET PROMPT ECHO',
      model: 'm',
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
      latencyMs: 3,
      costUsd: 0,
      structuredVia: 'json_schema',
    }))
    expect(res.text).toBe('SECRET PROMPT ECHO')
    const [entry] = lines()
    expect(entry).toMatchObject({
      providerId: 'p1',
      kind: 'ollama',
      op: 'chat',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0,
      structuredVia: 'json_schema',
      ok: true,
    })
    expect(typeof entry!.at).toBe('string')
    expect(typeof entry!.durationMs).toBe('number')
    expect(JSON.stringify(entry)).not.toContain('SECRET')
  })

  it('logs failures and rethrows', async () => {
    await expect(
      withChatLog({ providerId: 'p1', kind: 'anthropic', model: 'x' }, async () => {
        throw new Error('HTTP 500: boom')
      }),
    ).rejects.toThrow('boom')
    expect(lines()[0]).toMatchObject({ ok: false, error: 'HTTP 500: boom', inputTokens: 0 })
  })

  it('serialises concurrent writes into whole lines', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        logProviderCall({
          providerId: `p${i}`,
          kind: 'mock',
          op: 'embed',
          model: 'm',
          inputTokens: i,
          outputTokens: 0,
          durationMs: 1,
          ok: true,
        }),
      ),
    )
    expect(lines()).toHaveLength(20)
  })
})
