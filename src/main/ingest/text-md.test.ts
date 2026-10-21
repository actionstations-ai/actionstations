import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chunkSections } from './chunker'
import { parseMarkdown } from './parsers/markdown'
import { parseTextMd, renderTextMd } from './text-md'
import type { ParsedDocument } from './types'

describe('text.md', () => {
  it('renders headings by depth and page markers', () => {
    const doc: ParsedDocument = {
      title: 'Plan (P)',
      pages: 2,
      sections: [
        { headingPath: ['SECTION 1: A'], page: 1, text: 'Alpha.' },
        { headingPath: ['SECTION 1: A', '1.1 B'], page: 1, text: 'Bravo.' },
        { headingPath: ['SECTION 1: A', '1.1 B'], page: 2, text: 'Bravo continued.' },
      ],
    }
    expect(renderTextMd(doc)).toBe(
      '# Plan (P)\n\n<!-- page 1 -->\n\n## SECTION 1: A\n\nAlpha.\n\n### 1.1 B\n\nBravo.\n\n<!-- page 2 -->\n\nBravo continued.\n',
    )
  })

  it('escapes body lines that would read as markdown headings', () => {
    const doc: ParsedDocument = {
      title: 'T',
      pages: 0,
      sections: [{ headingPath: ['H'], text: '# not a heading' }],
    }
    const back = parseTextMd(renderTextMd(doc), 'T')
    expect(back.sections).toHaveLength(1)
    expect(back.sections[0]!.headingPath).toEqual(['H'])
  })

  it.each([
    'terminal-incident-response-plan-TIRP.md',
    'airport-emergency-plan-AEP.md',
    'airport-security-program-ASP.md',
  ])('round-trips %s to identical chunks', (name) => {
    const original = parseMarkdown(readFileSync(`reference/ncia/${name}`, 'utf8'), {
      fallbackTitle: name,
    })
    const reread = parseTextMd(renderTextMd(original), name)
    expect(reread.title).toBe(original.title)
    expect(chunkSections(reread.sections, 'X')).toEqual(chunkSections(original.sections, 'X'))
  })

  it('round-trips paged sections', () => {
    const doc: ParsedDocument = {
      title: 'Deck',
      pages: 2,
      sections: [
        { headingPath: ['Slide one'], page: 1, text: 'A' },
        { headingPath: ['Slide two'], page: 2, text: 'B\n\n| x | y |\n| --- | --- |\n| 1 | 2 |' },
      ],
    }
    const back = parseTextMd(renderTextMd(doc), 'Deck')
    expect(back.sections).toEqual(doc.sections)
    expect(back.pages).toBe(2)
  })
})
