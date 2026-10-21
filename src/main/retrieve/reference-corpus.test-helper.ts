// Test helper: splits reference/ncia/*.md into chunks at markdown headings, the way the real
// ingestion parser (a separate workstream) is expected to, so retrieval quality can be tested
// against the CSAAP source plans without depending on it.
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ChunkInput, IndexedDocument } from './types'

export const NCIA_DIR = resolve(import.meta.dirname, '../../../reference/ncia')

const SHORT_NAMES: Record<string, string> = {
  'airport-emergency-plan-AEP.md': 'AEP',
  'airport-security-program-ASP.md': 'ASP',
  'terminal-incident-response-plan-TIRP.md': 'TIRP',
  'terminal-map.md': 'MAP',
}

const approxTokens = (text: string): number => Math.ceil(text.split(/\s+/).length * 1.3)

/** Split markdown at headings; each chunk's headingPath is "SHORT › H1 › H2 › H3". */
export function splitMarkdown(markdown: string, shortName: string): ChunkInput[] {
  const chunks: ChunkInput[] = []
  const stack: string[] = []
  let body: string[] = []
  const flush = (): void => {
    const text = body.join('\n').trim()
    body = []
    if (!text) return
    const headingPath = [shortName, ...stack.filter(Boolean)].join(' › ')
    chunks.push({ headingPath, ord: chunks.length, text, tokenCount: approxTokens(text) })
  }
  for (const line of markdown.split('\n')) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (!h) {
      body.push(line)
      continue
    }
    flush()
    const level = h[1]!.length
    stack.length = level - 1
    stack[level - 1] = h[2]!.replace(/\*+/g, '').trim()
  }
  flush()
  return chunks
}

export interface CorpusDocument {
  doc: IndexedDocument
  chunks: ChunkInput[]
}

export function loadNciaCorpus(): CorpusDocument[] {
  return readdirSync(NCIA_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const shortName = SHORT_NAMES[file] ?? file.replace(/\.md$/, '')
      const markdown = readFileSync(join(NCIA_DIR, file), 'utf8')
      const title = /^#\s+(.*)$/m.exec(markdown)?.[1]?.trim() ?? file
      return {
        doc: {
          id: shortName.toLowerCase(),
          title,
          shortName,
          kind: 'plan',
          path: `documents/${file}`,
          pages: 1,
        },
        chunks: splitMarkdown(markdown, shortName),
      }
    })
}
