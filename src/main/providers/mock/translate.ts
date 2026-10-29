// Deterministic "translations" for the mock provider (spec 0435): every sentence-start gets
// the prefix `[es] `, fixed glossary terms from the prompt are applied, nothing else changes.
// Lets the translate job, the review screen and the export run offline in tests.
import type { ChatRequest } from '../types'

export const MOCK_TRANSLATE_PREFIX = '[es] '

type Glossary = [string, string][]

/** `- "term" = "translation"` lines of the system prompt. */
function glossaryOf(system: string | undefined): Glossary {
  const out: Glossary = []
  for (const m of (system ?? '').matchAll(/^- "([^"\n]+)" = "([^"\n]+)"$/gm))
    out.push([m[1]!, m[2]!])
  return out
}

function sourceOf(req: ChatRequest): string {
  const text = req.messages.at(-1)?.content ?? ''
  return /<source>\n([\s\S]*?)\n<\/source>/.exec(text)?.[1] ?? text
}

function translateText(text: string, glossary: Glossary): string {
  let out = text
  for (const [term, translation] of glossary) out = out.split(term).join(translation)
  return `${MOCK_TRANSLATE_PREFIX}${out}`
}

const TABLE_RULE = /^\s*\|?[-:| ]+\|?\s*$/

/** Markdown: keep heading, list and quote markers; prefix the text after them. */
function translateMarkdown(md: string, glossary: Glossary): string {
  return md
    .split('\n')
    .map((line) => {
      const m = /^(\s*(?:#{1,6}|[-*+]|\d+\.|>)\s+)(.*)$/.exec(line)
      if (m) return `${m[1]}${translateText(m[2]!, glossary)}`
      return line.trim() && !TABLE_RULE.test(line) ? translateText(line, glossary) : line
    })
    .join('\n')
}

function translateValue(v: unknown, glossary: Glossary): unknown {
  if (typeof v === 'string') return v.trim() ? translateText(v, glossary) : v
  if (Array.isArray(v)) return v.map((x) => translateValue(x, glossary))
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, translateValue(x, glossary)]))
  return v
}

/** The mock's reply to a `TranslateDocument` or `TranslateInject` request. */
export function mockTranslation(req: ChatRequest): unknown {
  const glossary = glossaryOf(req.system)
  const source = sourceOf(req)
  if (req.json?.name === 'TranslateDocument')
    return { markdown: translateMarkdown(source, glossary) }
  return translateValue(JSON.parse(source), glossary)
}
