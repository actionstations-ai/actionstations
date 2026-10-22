// GFM tables for the TipTap editor: table / tableRow / tableHeader / tableCell nodes over
// prosemirror-tables, with markdown parse (marked `table` token) and render (pipe table).
// Cells hold inline content only, as a markdown table cell can.
import { Node, mergeAttributes, type Editor, type JSONContent } from '@tiptap/react'
import type { Command } from '@tiptap/pm/state'
import { addRowAfter, goToNextCell, isInTable, tableEditing } from '@tiptap/pm/tables'

type Align = 'left' | 'center' | 'right' | null

interface MarkedCell {
  text: string
  tokens: unknown[]
}
interface MarkedTable {
  header: MarkedCell[]
  rows: MarkedCell[][]
  align: Align[]
}

/** prosemirror-tables finds its node types by this spec field. */
const TABLE_ROLES: Record<string, string> = {
  table: 'table',
  tableRow: 'row',
  tableCell: 'cell',
  tableHeader: 'header_cell',
}

const cellAttrs = {
  colspan: { default: 1 },
  rowspan: { default: 1 },
  colwidth: { default: null },
  align: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.textAlign || null,
    renderHTML: (attrs: { align?: Align }) =>
      attrs.align ? { style: `text-align: ${attrs.align}` } : {},
  },
}

/** `|` ends a cell and a newline ends the row, so both are escaped/flattened in cell text. */
export const escapeCell = (s: string): string =>
  s
    .replace(/(^|[^\\])\|/g, '$1\\|')
    .replace(/\r?\n+/g, ' ')
    .trim()

function delimiter(align: Align): string {
  if (align === 'center') return ':---:'
  if (align === 'right') return '---:'
  if (align === 'left') return ':---'
  return '---'
}

export const TableCell = Node.create({
  name: 'tableCell',
  content: 'inline*',
  isolating: true,
  addAttributes: () => cellAttrs,
  parseHTML: () => [{ tag: 'td' }],
  renderHTML: ({ HTMLAttributes }) => ['td', mergeAttributes(HTMLAttributes), 0],
})

export const TableHeader = Node.create({
  name: 'tableHeader',
  content: 'inline*',
  isolating: true,
  addAttributes: () => cellAttrs,
  parseHTML: () => [{ tag: 'th' }],
  renderHTML: ({ HTMLAttributes }) => ['th', mergeAttributes(HTMLAttributes), 0],
})

export const TableRow = Node.create({
  name: 'tableRow',
  content: '(tableCell | tableHeader)*',
  parseHTML: () => [{ tag: 'tr' }],
  renderHTML: ({ HTMLAttributes }) => ['tr', mergeAttributes(HTMLAttributes), 0],
})

function cellNode(
  type: 'tableCell' | 'tableHeader',
  cell: MarkedCell,
  align: Align,
  parseInline: (t: never[]) => JSONContent[],
): JSONContent {
  const content = parseInline((cell.tokens ?? []) as never[])
  return { type, attrs: { align: align ?? null }, ...(content.length ? { content } : {}) }
}

/** An empty table with a header row. */
export function emptyTable(rows: number, cols: number): JSONContent {
  const row = (type: 'tableHeader' | 'tableCell'): JSONContent => ({
    type: 'tableRow',
    content: Array.from({ length: cols }, () => ({ type })),
  })
  return {
    type: 'table',
    content: [row('tableHeader'), ...Array.from({ length: rows - 1 }, () => row('tableCell'))],
  }
}

/** Run a prosemirror-tables command (addRowAfter, deleteColumn…) on the editor. */
export function runTableCommand(editor: Editor, command: Command): boolean {
  editor.view.focus()
  return command(editor.state, editor.view.dispatch)
}

export const Table = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  isolating: true,
  extendNodeSchema: (extension) =>
    TABLE_ROLES[extension.name] ? { tableRole: TABLE_ROLES[extension.name] } : {},
  parseHTML: () => [{ tag: 'table' }],
  renderHTML: ({ HTMLAttributes }) => ['table', mergeAttributes(HTMLAttributes), ['tbody', 0]],

  markdownTokenName: 'table',
  parseMarkdown: (token, helpers) => {
    const t = token as unknown as MarkedTable
    const parseInline = helpers.parseInline as (x: never[]) => JSONContent[]
    const header: JSONContent = {
      type: 'tableRow',
      content: t.header.map((c, i) => cellNode('tableHeader', c, t.align[i] ?? null, parseInline)),
    }
    const rows = t.rows.map((r) => ({
      type: 'tableRow',
      content: r.map((c, i) => cellNode('tableCell', c, t.align[i] ?? null, parseInline)),
    }))
    return { type: 'table', content: [header, ...rows] }
  },
  renderMarkdown: (node: JSONContent, helpers) => {
    const rows = node.content ?? []
    const line = (row: JSONContent) =>
      `| ${(row.content ?? []).map((c) => escapeCell(helpers.renderChildren(c.content ?? []))).join(' | ')} |`
    const head = rows[0]
    if (!head) return ''
    const aligns = (head.content ?? []).map((c) => delimiter((c.attrs?.align as Align) ?? null))
    return [line(head), `|${aligns.join('|')}|`, ...rows.slice(1).map(line)].join('\n')
  },

  addKeyboardShortcuts() {
    const editor = this.editor
    const move = (dir: 1 | -1) => () =>
      isInTable(editor.state) && goToNextCell(dir)(editor.state, editor.view.dispatch)
    return {
      Tab: () => {
        if (!isInTable(editor.state)) return false
        if (move(1)()) return true
        // Tab in the last cell adds a row, like a spreadsheet.
        return runTableCommand(editor, addRowAfter) && move(1)()
      },
      'Shift-Tab': move(-1),
      // A markdown cell is one line: Enter moves to the next cell instead of splitting it.
      Enter: () => isInTable(editor.state) && move(1)(),
    }
  },

  addProseMirrorPlugins: () => [tableEditing()],
})

export const TableExtensions = [Table, TableRow, TableHeader, TableCell]
