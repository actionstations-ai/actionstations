import { describe, expect, it } from 'vitest'
import {
  cssString,
  documentBodyHtml,
  escapeHtml,
  hasHeading,
  markdownToHtml,
  mdCell,
  mdTable,
  stripEndNote,
} from './escape'

describe('escapeHtml', () => {
  it('escapes markup and quotes in model text', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    )
  })
  it('treats null and undefined as empty', () => {
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(null)).toBe('')
  })
})

describe('cssString (running headers)', () => {
  it('cannot close the string or the <style> element', () => {
    const s = cssString('Flight "to" \\Nowhere</style><script>alert(1)</script>')
    expect(s.startsWith('"') && s.endsWith('"')).toBe(true)
    expect(s.slice(1, -1)).not.toMatch(/["<>]/)
    expect(s).toContain('\\22 to\\22 ')
    expect(s).toContain('\\5c Nowhere')
  })
  it('flattens newlines', () => {
    expect(cssString('a\nb')).toBe('"a b"')
  })
})

describe('markdownToHtml', () => {
  it('shows raw HTML as text instead of rendering it', () => {
    const html = markdownToHtml('Hello <script>alert(1)</script>\n\n<iframe src="x"></iframe>')
    expect(html).not.toMatch(/<script|<iframe/)
    expect(html).toContain('&lt;script&gt;')
  })
  it('drops javascript: links and images but keeps their text', () => {
    const html = markdownToHtml('[click](javascript:alert(1)) ![alt text](file:///etc/passwd)')
    expect(html).not.toMatch(/javascript:|<img|file:/)
    expect(html).toContain('click')
    expect(html).toContain('alt text')
  })
  it('keeps https links', () => {
    expect(markdownToHtml('[FEMA](https://www.fema.gov)')).toContain(
      '<a href="https://www.fema.gov">FEMA</a>',
    )
  })
  it('removes document-store section markers', () => {
    expect(markdownToHtml('<!-- section:rubric -->\n\nText')).not.toContain('section:rubric')
  })
})

describe('documentBodyHtml', () => {
  const md =
    '# Controller Handbook\n## Scenario 3\n\nLocation: X\n\n### 1. Overview\n\n#### Detail\n'
  it('drops the leading title headings and shifts the rest to start at h2', () => {
    const html = documentBodyHtml(md)
    expect(html).not.toContain('Controller Handbook')
    expect(html).toContain('<h2>1. Overview</h2>')
    expect(html).toContain('<h3>Detail</h3>')
  })
  it('escapes HTML inside the body too', () => {
    expect(documentBodyHtml('Text <b onclick=x>bold</b>')).toContain('&lt;b onclick=x&gt;')
  })
})

describe('hasHeading / stripEndNote', () => {
  it('finds headings by pattern', () => {
    expect(hasHeading('## 4. Evaluation & Grading Rubric', /rubric/i)).toBe(true)
    expect(hasHeading('The rubric is below', /rubric/i)).toBe(false)
  })
  it('removes a closing end note', () => {
    expect(stripEndNote('Body\n\n*End of Handbook*\n')).toBe('Body\n\n')
    expect(stripEndNote('Body text')).toBe('Body text')
  })
})

describe('markdown tables', () => {
  it('escapes pipes and flattens newlines in cells', () => {
    expect(mdCell('a | b\nc')).toBe('a \\| b c')
    expect(mdCell('back\\slash')).toBe('back\\\\slash')
  })
  it('builds a table whose cells cannot break the column count', () => {
    const t = mdTable(['A', 'B'], [['x|y', 'z\n|w']])
    const rows = t.split('\n')
    expect(rows).toHaveLength(3)
    expect(rows[2]!.split(/(?<!\\)\|/).length).toBe(rows[0]!.split('|').length)
  })
})
