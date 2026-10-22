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

/** Feed `raw` through thinkFilter in chunks of `size` characters; return what was emitted. */
function streamed(raw: string, size: number): string {
  const out: string[] = []
  const emit = thinkFilter((t) => out.push(t))
  for (let i = 0; i < raw.length; i += size) emit(raw.slice(i, i + size))
  return out.join('')
}

const FENCED_ROWS = '```json\n{"rows":[{"id":"I-01"}]}\n```'
const HARMONY_FULL_REPLY =
  '<|channel|>analysis<|message|>We need JSON with rows. Think about gates.<|end|>' +
  `<|start|>assistant<|channel|>final<|constrain|>json<|message|>${FENCED_ROWS}<|return|>`
const HARMONY_PREFIX_ONLY = '<|channel|>final <|constrain|>json<|message|>{"ok":true,"note":"a<b"}'

describe('thinkFilter with gpt-oss harmony output (#142)', () => {
  it.each([1, 2, 3, 5, 7, 11, 64, 1000])(
    'streams only the final channel when chunks are %i chars',
    (size) => {
      expect(streamed(HARMONY_FULL_REPLY, size)).toBe(FENCED_ROWS)
    },
  )

  it.each([1, 4, 9, 1000])('drops a final-channel prefix split every %i chars', (size) => {
    expect(streamed(HARMONY_PREFIX_ONLY, size)).toBe('{"ok":true,"note":"a<b"}')
  })

  it('never forwards control tokens or analysis text', () => {
    const text = streamed(HARMONY_FULL_REPLY, 3)
    expect(text).not.toMatch(/<\|/)
    expect(text).not.toContain('Think about gates')
    expect(text).not.toContain('assistant')
  })

  it('drops commentary channels too', () => {
    const raw =
      '<|start|>assistant<|channel|>commentary<|message|>calling tool<|call|>' +
      '<|start|>assistant<|channel|>final<|message|>done<|end|>'
    expect(streamed(raw, 2)).toBe('done')
  })

  it('leaves plain text with angle brackets and pipes alone', () => {
    expect(streamed('if a <| b and c |> d, x<y z', 2)).toBe('if a <| b and c |> d, x<y z')
  })

  it('still removes <think> blocks alongside harmony tokens', () => {
    expect(streamed('<think>plan</think><|channel|>final<|message|>{"a":1}', 3)).toBe('{"a":1}')
  })

  it('keeps JSON extraction working on the same raw text', () => {
    expect(stripThinking(HARMONY_FULL_REPLY).text).toBe(FENCED_ROWS)
    expect(stripThinking(HARMONY_PREFIX_ONLY).text).toBe('{"ok":true,"note":"a<b"}')
  })

  it('drops an analysis channel that never reached a final answer', () => {
    const r = stripThinking('<|channel|>analysis<|message|>half a thought')
    expect(r.text).toBe('')
    expect(r.reasoning).toContain('half a thought')
  })
})
