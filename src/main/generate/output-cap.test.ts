import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { StageRun } from '@shared/schemas'
import { MockTextProvider } from '../providers/mock/adapter'
import type { ChatRequest, ChatResponse } from '../providers/types'
import { contextRoom, contextWindowOf, planOutputCap, retryCap } from './output-cap'
import { callWithRepair, type Conversation, type StageCall } from './stage'

const thinking = 'qwen3.6-35b-a3b'
const plain = 'qwen3-30b-a3b-2507'
const config = { id: 'mock', kind: 'mock', label: 'Mock', options: {}, enabled: true } as const

describe('planOutputCap', () => {
  it('adds the reasoning allowance when the profile has thinking on', () => {
    expect(planOutputCap({ stageCap: 7000, modelId: thinking, promptText: 'hi' }).cap).toBe(13_000)
  })

  it('keeps the stage cap for a model without reasoning, or with thinking switched off', () => {
    expect(planOutputCap({ stageCap: 7000, modelId: plain, promptText: 'hi' }).cap).toBe(7000)
    const options = { reasoningEffort: 'off' }
    const off = planOutputCap({ stageCap: 7000, modelId: thinking, options, promptText: '' })
    expect(off.cap).toBe(7000)
  })

  it('never asks for more than the context leaves after the prompt', () => {
    const promptText = 'word '.repeat(20_000)
    const plan = planOutputCap({
      stageCap: 7000,
      modelId: thinking,
      promptText,
      contextWindow: 32_768,
    })
    expect(plan.cap).toBe(plan.room)
    expect(plan.cap).toBeLessThan(13_000)
    expect(plan.cap + Math.ceil(20_000 * 1.3)).toBeLessThanOrEqual(32_768)
  })

  it('has a floor when the prompt already fills the context', () => {
    expect(contextRoom('word '.repeat(50_000), 32_768)).toBe(512)
  })
})

describe('retryCap', () => {
  it('doubles the cap, bounded by the growth limit and the room', () => {
    expect(retryCap(4000)).toBe(8000)
    expect(retryCap(20_000)).toBe(32_000)
    expect(retryCap(4000, 6000)).toBe(6000)
  })

  it('gives up when the cap cannot grow', () => {
    expect(retryCap(6000, 6000)).toBeUndefined()
  })
})

describe('contextWindowOf', () => {
  it('reads the window from the provider listing and tolerates a failing listing', async () => {
    const listed = new MockTextProvider(config)
    listed.listModels = async () => [{ id: 'x', kind: 'chat', contextWindow: 8192 }]
    expect(await contextWindowOf(listed, 'x')).toBe(8192)
    const broken = new MockTextProvider(config)
    broken.listModels = () => Promise.reject(new Error('down'))
    expect(await contextWindowOf(broken, 'x')).toBeUndefined()
  })
})

describe('retry after a length cut-off', () => {
  const reply = (finishReason: ChatResponse['finishReason'], text: string): ChatResponse => ({
    text,
    model: 'm',
    usage: { inputTokens: 10, outputTokens: 5 },
    finishReason,
    latencyMs: 1,
  })

  async function run(replies: ChatResponse[], room?: number) {
    const seen: (number | undefined)[] = []
    const provider = new MockTextProvider(config)
    provider.chat = async (req: ChatRequest) => {
      seen.push(req.maxTokens)
      return replies[seen.length - 1]!
    }
    const logs: string[] = []
    const call = {
      stage: 'critique',
      ctx: { log: (m: string) => logs.push(m), throwIfCancelled: () => {}, token: () => {} },
    } as unknown as StageCall
    const conv: Conversation = {
      provider,
      base: { maxTokens: 4000 },
      messages: [{ role: 'user', content: 'go' }],
      onToken: () => {},
      ...(room ? { room } : {}),
    }
    const runRecord = { repairAttempts: 0 } as StageRun
    const parsed = await callWithRepair(conv, z.object({ ok: z.boolean() }), runRecord, call)
    return { seen, logs, parsed }
  }

  it('asks again once with a larger cap and logs it', async () => {
    const { seen, logs, parsed } = await run([
      reply('length', '{"ok":'),
      reply('stop', '{"ok":true}'),
    ])
    expect(seen).toEqual([4000, 8000])
    expect(logs[0]).toContain('cut off at 4000 tokens')
    expect(parsed.ok).toBe(true)
  })

  it('does not retry past the room the context has left', async () => {
    const { seen } = await run([reply('length', '{"ok":'), reply('stop', '{"ok":true}')], 4000)
    expect(seen[1]).toBe(4000)
  })

  it('retries only once, then falls through to the repair round', async () => {
    const cut = reply('length', '{"ok":')
    const { seen, parsed } = await run([cut, cut, reply('stop', '{"ok":true}')])
    expect(seen).toEqual([4000, 8000, 8000])
    expect(parsed.ok).toBe(true)
  })
})
