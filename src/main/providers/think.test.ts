import { describe, expect, it } from 'vitest'
import { stripThinking, thinkFilter } from './think'

describe('stripThinking', () => {
  it('removes <think> blocks (Qwen3 / DeepSeek-R1)', () => {
    const r = stripThinking('<think>\nThe user wants JSON.\n</think>\n\n{"ok":true}')
    expect(r.text).toBe('{"ok":true}')
    expect(r.reasoning).toContain('The user wants JSON.')
  })

  it('drops an unterminated reasoning block', () => {
    expect(stripThinking('{"a":1}<think>still thinking').text).toBe('{"a":1}')
  })

  it('handles a server that stripped the opening tag only', () => {
    expect(stripThinking('reasoning here</think>{"a":1}').text).toBe('{"a":1}')
  })

  it('keeps only the gpt-oss final channel', () => {
    const raw =
      '<|channel|>analysis<|message|>Need two rows.<|end|><|start|>assistant<|channel|>final<|message|>{"rows":[]}<|return|>'
    expect(stripThinking(raw)).toEqual({
      text: '{"rows":[]}',
      reasoning: expect.stringContaining('Need two rows'),
    })
  })

  it('leaves plain answers untouched', () => {
    expect(stripThinking('  plain answer ').text).toBe('plain answer')
  })
})

describe('thinkFilter', () => {
  it('suppresses streamed reasoning even when tags split across chunks', () => {
    const out: string[] = []
    const emit = thinkFilter((t) => out.push(t))
    for (const c of ['<th', 'ink>secret ', 'plan</thi', 'nk>{"a"', ':1}']) emit(c)
    expect(out.join('')).toBe('{"a":1}')
  })

  it('passes through text that only looks like a tag prefix', () => {
    const out: string[] = []
    const emit = thinkFilter((t) => out.push(t))
    emit('a <')
    emit('b> c')
    expect(out.join('')).toBe('a <b> c')
  })
})
