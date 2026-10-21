// Reasoning-output handling for local models. Qwen3 / DeepSeek-R1 style models wrap their
// reasoning in <think>…</think>; gpt-oss emits harmony channels
// (<|channel|>analysis<|message|>… then <|channel|>final<|message|>…). Only the answer
// may reach JSON parsing or the user-visible token stream.

const THINK_BLOCK = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi
const FINAL_CHANNEL =
  /<\|channel\|>\s*final\s*(?:<\|constrain\|>[^<]*)?<\|message\|>([\s\S]*?)(?:<\|end\|>|<\|return\|>|$)/i
const HARMONY_TOKEN = /<\|[a-z_]+\|>/gi

export interface SplitThinking {
  /** The answer with reasoning removed. */
  text: string
  /** Concatenated reasoning, for diagnostics only (never logged). */
  reasoning: string
}

export function stripThinking(raw: string): SplitThinking {
  const reasoning: string[] = []
  let text = raw
  const final = FINAL_CHANNEL.exec(text)
  if (final) {
    reasoning.push(text.slice(0, final.index))
    text = final[1] ?? ''
  }
  text = text.replace(THINK_BLOCK, (m) => {
    reasoning.push(m)
    return ''
  })
  // A reasoning block that never closed (output cut off mid-thought): drop it all.
  const open = /<think(?:ing)?>/i.exec(text)
  if (open) {
    reasoning.push(text.slice(open.index))
    text = text.slice(0, open.index)
  }
  // An orphan closing tag means the server stripped the opener but not the close.
  const orphan = /<\/think(?:ing)?>/i.exec(text)
  if (orphan) {
    reasoning.push(text.slice(0, orphan.index))
    text = text.slice(orphan.index + orphan[0].length)
  }
  text = text.replace(HARMONY_TOKEN, '')
  return { text: text.trim(), reasoning: reasoning.join('\n').trim() }
}

const OPEN_TAGS = ['<think>', '<thinking>']
const CLOSE_TAGS = ['</think>', '</thinking>']

/**
 * Wrap an onToken callback so text inside <think>…</think> is not forwarded. Handles tags
 * split across stream chunks by holding back a possible tag prefix.
 */
export function thinkFilter(onToken?: (t: string) => void): (t: string) => void {
  if (!onToken) return () => undefined
  let inThink = false
  let pending = ''
  return (chunk: string) => {
    pending += chunk
    let out = ''
    for (;;) {
      const tags = inThink ? CLOSE_TAGS : OPEN_TAGS
      const hit = firstTag(pending, tags)
      if (hit) {
        if (!inThink) out += pending.slice(0, hit.index)
        pending = pending.slice(hit.index + hit.tag.length)
        inThink = !inThink
        continue
      }
      const keep = partialTagSuffix(pending, tags)
      if (!inThink) out += pending.slice(0, pending.length - keep)
      pending = pending.slice(pending.length - keep)
      break
    }
    if (out) onToken(out)
  }
}

function firstTag(s: string, tags: string[]): { index: number; tag: string } | undefined {
  const lower = s.toLowerCase()
  let best: { index: number; tag: string } | undefined
  for (const tag of tags) {
    const i = lower.indexOf(tag)
    if (i >= 0 && (!best || i < best.index)) best = { index: i, tag }
  }
  return best
}

/** Length of the longest suffix of s that is a proper prefix of one of the tags. */
function partialTagSuffix(s: string, tags: string[]): number {
  const lower = s.toLowerCase()
  let keep = 0
  for (const tag of tags)
    for (let n = Math.min(tag.length - 1, lower.length); n > keep; n--)
      if (tag.startsWith(lower.slice(lower.length - n))) {
        keep = n
        break
      }
  return keep
}
