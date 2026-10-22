// @vitest-environment happy-dom
import { Editor } from '@tiptap/react'
import { Lexer, type Token, type Tokens } from 'marked'
import { afterAll, describe, expect, it } from 'vitest'
import { ALLOW_MARKER_DELETE } from './comment'
import { documentExtensions } from './extensions'
import {
  createSnapshot,
  serializeFresh,
  serializeWithSnapshot,
  snapshotDoc,
  splitBlocks,
} from './roundtrip'

const FIXTURES = [
  'tests/fixtures/generate/sample-run/handbook.md',
  'tests/fixtures/generate/sample-run/briefing.md',
  'tests/fixtures/generate/sample-run/hotwash.md',
  'tests/fixtures/generate/sample-run/msel.md',
  'reference/scenario-3/controller-handbook.md',
  'reference/scenario-3/player-briefing.md',
  'reference/scenario-3/msel.md',
  'reference/scenario-3/master-inject-deck.md',
]
const SOURCES = import.meta.glob(
  ['/tests/fixtures/generate/sample-run/*.md', '/reference/scenario-3/*.md'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const read = (rel: string): string => {
  const text = SOURCES[`/${rel}`]
  if (text === undefined) throw new Error(`fixture ${rel} not found`)
  return text
}

const editor = new Editor({ extensions: documentExtensions() })
afterAll(() => editor.destroy())
const codec = {
  parse: (md: string) => editor.markdown!.parse(md),
  serialize: (doc: Parameters<NonNullable<Editor['markdown']>['serialize']>[0]) =>
    editor.markdown!.serialize(doc),
}

function load(markdown: string) {
  const snap = createSnapshot(codec, editor.schema, markdown)
  editor
    .chain()
    .setMeta(ALLOW_MARKER_DELETE, true)
    .setMeta('addToHistory', false)
    .setContent(snapshotDoc(snap), { emitUpdate: false })
    .run()
  return snap
}
const save = (snap: ReturnType<typeof load>) =>
  serializeWithSnapshot(snap, codec, editor.schema, editor.getJSON())

/** What a reader sees: headings, table cells, list items, bold runs and section markers. */
function outline(markdown: string): string[] {
  const out: string[] = []
  const walk = (tokens: Token[]) => {
    for (const t of tokens) {
      if (t.type === 'heading')
        out.push(`h${(t as Tokens.Heading).depth}:${(t as Tokens.Heading).text}`)
      if (t.type === 'table') {
        const tt = t as Tokens.Table
        out.push(`table:${tt.header.length}x${tt.rows.length}`)
        for (const c of [...tt.header, ...tt.rows.flat()])
          out.push(`cell:${c.text.replace(/\\\|/g, '|').trim()}`)
      }
      if (t.type === 'list_item') out.push('li')
      if (t.type === 'strong') out.push(`b:${(t as Tokens.Strong).text}`)
      if (t.type === 'html' && t.raw.trim().startsWith('<!--')) out.push(`marker:${t.raw.trim()}`)
      const kids = (t as { tokens?: Token[] }).tokens
      if (kids) walk(kids)
      const items = (t as { items?: Token[] }).items
      if (items) walk(items)
    }
  }
  walk(new Lexer({ gfm: true }).lex(markdown))
  return out
}

describe('markdown round-trip', () => {
  it.each(FIXTURES)('%s: load → save without edits is byte-identical', (rel) => {
    const md = read(rel)
    expect(splitBlocks(md)).not.toBeNull()
    expect(save(load(md))).toBe(md)
  })

  it.each(FIXTURES)(
    '%s: the serializer alone keeps headings, tables, lists, bold, markers',
    (rel) => {
      const md = read(rel)
      load(md)
      const rewritten = serializeFresh(codec, editor.getJSON())
      expect(outline(rewritten)).toEqual(outline(md))
    },
  )

  it('an edit rewrites only the edited block', () => {
    const md = read('tests/fixtures/generate/sample-run/handbook.md')
    const snap = load(md)
    let pos = -1
    editor.state.doc.descendants((node, p) => {
      if (pos < 0 && node.type.name === 'heading' && node.textContent.startsWith('2. Room Setup')) {
        pos = p + node.nodeSize - 1
      }
      return pos < 0
    })
    editor.chain().insertContentAt(pos, ' (revised)').run()
    const out = save(snap)
    expect(out).toBe(
      md.replace('### 2. Room Setup & Logistics', '### 2. Room Setup & Logistics (revised)'),
    )
  })

  it('editing a table cell keeps the table and its other rows verbatim', () => {
    const md = read('reference/scenario-3/controller-handbook.md')
    const snap = load(md)
    let pos = -1
    editor.state.doc.descendants((node, p) => {
      if (pos < 0 && node.type.name === 'tableCell' && node.textContent.length > 0) pos = p + 1
      return pos < 0
    })
    expect(pos).toBeGreaterThan(0)
    editor.chain().insertContentAt(pos, 'EDITED ').run()
    const out = save(snap)
    expect(out).toContain('EDITED ')
    expect(outline(out).filter((x) => x.startsWith('table:'))).toEqual(
      outline(md).filter((x) => x.startsWith('table:')),
    )
    // Everything outside the edited table is unchanged.
    const before = md.split('\n').filter((l) => !l.startsWith('|'))
    expect(out.split('\n').filter((l) => !l.startsWith('|'))).toEqual(before)
  })

  it('section markers are kept and cannot be deleted by an edit', () => {
    const md = read('tests/fixtures/generate/sample-run/handbook.md')
    const snap = load(md)
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    const out = save(snap)
    expect(out).toContain('<!-- section:rubric -->')
    expect(out).toContain('<!-- /section:hotwash -->')
  })

  it('raw HTML that is not a comment stays text, never markup', () => {
    const md = '# T\n\n<img src=x onerror="alert(1)">\n'
    const snap = load(md)
    expect(editor.getHTML()).not.toContain('<img')
    expect(save(snap)).toBe(md)
  })
})
