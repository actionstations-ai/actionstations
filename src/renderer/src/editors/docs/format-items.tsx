import type { Editor } from '@tiptap/react'
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Grid2x2X,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Redo2,
  Table,
  Undo2,
} from 'lucide-react'
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  deleteTable,
} from '@tiptap/pm/tables'
import type { Command } from '@tiptap/pm/state'
import { emptyTable, runTableCommand } from './markdown/table'
import type { ToolbarItem } from './Toolbar'

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'
const ICON = { size: 16, 'aria-hidden': true } as const

const chainOf = (editor: Editor) => () => editor.chain().focus()

/** Paragraph and headings 1–3. */
function blockItems(editor: Editor): ToolbarItem[] {
  const chain = chainOf(editor)
  const heading = (level: 1 | 2 | 3, icon: ToolbarItem['icon']): ToolbarItem => ({
    id: `h${level}`,
    label: `Heading ${level}`,
    icon,
    shortcut: `${MOD}Alt+${level}`,
    pressed: editor.isActive('heading', { level }),
    onRun: () => chain().toggleHeading({ level }).run(),
  })
  return [
    {
      id: 'p',
      label: 'Paragraph',
      icon: <Pilcrow {...ICON} />,
      shortcut: `${MOD}Alt+0`,
      pressed: editor.isActive('paragraph'),
      onRun: () => chain().setParagraph().run(),
    },
    heading(1, <Heading1 {...ICON} />),
    heading(2, <Heading2 {...ICON} />),
    heading(3, <Heading3 {...ICON} />),
  ]
}

/** Bold, italic and link. */
function inlineItems(editor: Editor, onLink: () => void): ToolbarItem[] {
  const chain = chainOf(editor)
  return [
    {
      id: 'bold',
      label: 'Bold',
      icon: <Bold {...ICON} />,
      shortcut: `${MOD}B`,
      pressed: editor.isActive('bold'),
      onRun: () => chain().toggleBold().run(),
      group: true,
    },
    {
      id: 'italic',
      label: 'Italic',
      icon: <Italic {...ICON} />,
      shortcut: `${MOD}I`,
      pressed: editor.isActive('italic'),
      onRun: () => chain().toggleItalic().run(),
    },
    {
      id: 'link',
      label: 'Link',
      icon: <Link {...ICON} />,
      shortcut: `${MOD}K`,
      pressed: editor.isActive('link'),
      onRun: onLink,
    },
  ]
}

function listItems(editor: Editor): ToolbarItem[] {
  const chain = chainOf(editor)
  return [
    {
      id: 'ul',
      label: 'Bulleted list',
      icon: <List {...ICON} />,
      shortcut: `${MOD}Shift+8`,
      pressed: editor.isActive('bulletList'),
      onRun: () => chain().toggleBulletList().run(),
      group: true,
    },
    {
      id: 'ol',
      label: 'Numbered list',
      icon: <ListOrdered {...ICON} />,
      shortcut: `${MOD}Shift+7`,
      pressed: editor.isActive('orderedList'),
      onRun: () => chain().toggleOrderedList().run(),
    },
  ]
}

/** Insert a table outside one; row / column / table edits inside one. */
function tableItems(editor: Editor): ToolbarItem[] {
  const inTable = editor.isActive('table')
  const tableCmd = (id: string, label: string, icon: ToolbarItem['icon'], cmd: Command) => ({
    id,
    label,
    icon,
    disabled: !inTable,
    onRun: () => void runTableCommand(editor, cmd),
  })
  return [
    {
      id: 'table',
      label: 'Insert table',
      icon: <Table {...ICON} />,
      disabled: inTable,
      onRun: () => chainOf(editor)().insertContent(emptyTable(3, 3)).run(),
      group: true,
    },
    tableCmd('row', 'Add row below', <BetweenHorizontalEnd {...ICON} />, addRowAfter),
    tableCmd('col', 'Add column right', <BetweenVerticalEnd {...ICON} />, addColumnAfter),
    tableCmd('delrow', 'Delete row', <Minus {...ICON} />, deleteRow),
    tableCmd(
      'delcol',
      'Delete column',
      <Minus {...ICON} style={{ transform: 'rotate(90deg)' }} />,
      deleteColumn,
    ),
    tableCmd('deltable', 'Delete table', <Grid2x2X {...ICON} />, deleteTable),
  ]
}

function historyItems(editor: Editor): ToolbarItem[] {
  const chain = chainOf(editor)
  return [
    {
      id: 'undo',
      label: 'Undo',
      icon: <Undo2 {...ICON} />,
      shortcut: `${MOD}Z`,
      disabled: !editor.can().undo(),
      onRun: () => chain().undo().run(),
      group: true,
    },
    {
      id: 'redo',
      label: 'Redo',
      icon: <Redo2 {...ICON} />,
      shortcut: `${MOD}Shift+Z`,
      disabled: !editor.can().redo(),
      onRun: () => chain().redo().run(),
    },
  ]
}

/** The formatting toolbar for a TipTap editor; table edits are enabled inside a table. */
export function formatItems(editor: Editor, onLink: () => void): ToolbarItem[] {
  return [
    ...blockItems(editor),
    ...inlineItems(editor, onLink),
    ...listItems(editor),
    ...tableItems(editor),
    ...historyItems(editor),
  ]
}
