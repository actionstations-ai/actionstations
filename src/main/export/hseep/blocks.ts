// The HSEEP documents (#420) are built once as a list of blocks (headings, paragraphs, fact
// tables, lists, tables, markdown) in HSEEP section order. The PDF template and the Word writer
// both render that list, so the two formats always carry the same sections in the same order.
// Every string is raw model or designer text: the template escapes it, the Word writer writes
// it as text runs.
import { documentBodyHtml } from '../escape'
import { trusted } from '../templates'

/** What a blank exercise detail prints: a line to write on, never an invented value. */
export const FILL_IN = '______________________'

export interface Fact {
  label: string
  /** '' prints a fill-in line. */
  value: string
}

export type Block =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'para'; text: string; label?: string }
  | { kind: 'facts'; caption: string; rows: Fact[] }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | {
      kind: 'table'
      caption: string
      header: string[]
      rows: string[][]
      /** Empty cells print a fill-in line (tables of details to complete). */
      fillBlanks?: boolean
    }
  | { kind: 'markdown'; md: string; baseLevel: 3 | 4 }
  | { kind: 'note'; text: string }

export const h2 = (text: string): Block => ({ kind: 'heading', level: 2, text })
export const h3 = (text: string): Block => ({ kind: 'heading', level: 3, text })
export const h4 = (text: string): Block => ({ kind: 'heading', level: 4, text })
export const para = (text: string, label?: string): Block =>
  label === undefined ? { kind: 'para', text } : { kind: 'para', text, label }
export const list = (items: string[], ordered = false): Block => ({ kind: 'list', items, ordered })
export const note = (text: string): Block => ({ kind: 'note', text })

/** The headings of a block list, in order (tests and the completeness report read these). */
export function headingsOf(blocks: Block[]): { level: number; text: string }[] {
  return blocks.flatMap((b) => (b.kind === 'heading' ? [{ level: b.level, text: b.text }] : []))
}

/** All the plain text of a block list (tests check what a document does or does not say). */
export function textOf(blocks: Block[]): string {
  const parts = blocks.flatMap((b): string[] => {
    switch (b.kind) {
      case 'heading':
      case 'note':
        return [b.text]
      case 'para':
        return [b.label ? `${b.label}: ${b.text}` : b.text]
      case 'facts':
        return b.rows.map((r) => `${r.label}: ${r.value}`)
      case 'list':
        return b.items
      case 'table':
        return [b.header.join(' | '), ...b.rows.map((r) => r.join(' | '))]
      case 'markdown':
        return [b.md]
    }
  })
  return parts.join('\n')
}

interface Cell {
  text: string
  blank: boolean
}

const cell = (text: string, fill: boolean): Cell => ({ text, blank: fill && !text.trim() })

/** The template's view of one block: one flag per kind, cells marked blank for fill-in lines. */
export interface BlockView {
  h2?: boolean
  h3?: boolean
  h4?: boolean
  para?: boolean
  facts?: boolean
  list?: boolean
  ordered?: boolean
  table?: boolean
  html?: ReturnType<typeof trusted>
  note?: boolean
  text?: string
  label?: string
  blank?: boolean
  caption?: string
  header?: string[]
  rows?: Cell[][]
  items?: string[]
}

function blockView(b: Block): BlockView {
  switch (b.kind) {
    case 'heading':
      return { [`h${b.level}`]: true, text: b.text }
    case 'para':
      return { para: true, text: b.text, label: b.label ?? '', blank: !b.text.trim() }
    case 'facts':
      return {
        facts: true,
        caption: b.caption,
        rows: b.rows.map((r) => [cell(r.label, false), cell(r.value, true)]),
      }
    case 'list':
      return { list: true, ordered: !!b.ordered, items: b.items }
    case 'table':
      return {
        table: true,
        caption: b.caption,
        header: b.header,
        rows: b.rows.map((r) => r.map((c) => cell(c, !!b.fillBlanks))),
      }
    case 'markdown':
      return { html: trusted(documentBodyHtml(b.md, b.baseLevel, true)) }
    case 'note':
      return { note: true, text: b.text }
  }
}

export const blocksView = (blocks: Block[]): BlockView[] => blocks.map(blockView)
