// text.md: the normalized, human-readable extraction of a document. It is also the input for
// re-chunking (index:rebuild) without re-parsing the original, so it round-trips:
//   # <title>                    ← document title
//   <!-- page N -->              ← page markers for paged formats
//   ## / ### …                   ← one heading level per headingPath depth (capped at ######)
import { parseMarkdown } from './parsers/markdown'
import type { ParsedDocument } from './types'

const MAX_LEVEL = 6

/** Lines that markdown would read as structure are escaped so body text stays body text. */
function escapeBody(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      /^\s{0,3}(#{1,6}\s|<!--|={3,}\s*$|-{3,}\s*$)/.test(line) ? `\\${line.trimStart()}` : line,
    )
    .join('\n')
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

export function renderTextMd(doc: ParsedDocument): string {
  const out: string[] = [`# ${oneLine(doc.title)}`, '']
  let path: string[] = []
  let page: number | undefined
  for (const section of doc.sections) {
    if (section.page !== undefined && section.page !== page) {
      page = section.page
      out.push(`<!-- page ${page} -->`, '')
    }
    let same = 0
    while (
      same < path.length &&
      same < section.headingPath.length &&
      path[same] === section.headingPath[same]
    )
      same++
    // A repeated identical path continues the previous section (e.g. across a page break).
    for (let i = same; i < section.headingPath.length; i++) {
      const level = Math.min(MAX_LEVEL, i + 2)
      out.push(`${'#'.repeat(level)} ${oneLine(section.headingPath[i]!)}`, '')
    }
    path = section.headingPath
    out.push(escapeBody(section.text), '')
  }
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  )
}

/** Read text.md back into sections (same shape the original parse produced). */
export function parseTextMd(source: string, fallbackTitle: string): ParsedDocument {
  return parseMarkdown(source, { fallbackTitle, titleMode: 'always' })
}
