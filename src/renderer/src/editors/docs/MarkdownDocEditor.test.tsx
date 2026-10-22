// @vitest-environment happy-dom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import { lineDiff } from './line-diff'
import { MarkdownDocEditor } from './MarkdownDocEditor'
import { FakeIpcError, PROJECT, SCENARIO, mockTtx, renderWithClient } from './test-helpers'

import HANDBOOK from '../../../../../tests/fixtures/generate/sample-run/handbook.md?raw'

afterEach(() => cleanup())

function setup(handlers: Parameters<typeof mockTtx>[0] = {}) {
  const saves: string[] = []
  const ttx = mockTtx({
    'scenarios:doc-get': () => ({ markdown: saves.at(-1) ?? HANDBOOK }),
    'scenarios:doc-save': (req: { markdown: string }) => {
      saves.push(req.markdown)
    },
    'scenarios:history': () => [],
    ...handlers,
  })
  renderWithClient(<MarkdownDocEditor projectPath={PROJECT} scenario={SCENARIO} kind="handbook" />)
  return { ttx, saves, user: userEvent.setup() }
}

/** TipTap keeps its editor on the ProseMirror root element. */
async function tiptap(): Promise<Editor> {
  const surface = await screen.findByRole('textbox', { name: 'Controller handbook' })
  await waitFor(() => expect(surface.textContent).toContain('Controller / Evaluator'))
  return (surface as unknown as { editor: Editor }).editor
}

describe('MarkdownDocEditor', () => {
  it('renders the document with headings and a toolbar, hiding section markers', async () => {
    setup()
    await tiptap()
    const doc = screen.getByRole('article', { name: 'Controller handbook' })
    expect(within(doc).getByRole('heading', { name: /Exercise Overview/ })).toBeTruthy()
    expect(doc.textContent).not.toContain('section:overview')
    const toolbar = screen.getByRole('toolbar', { name: 'Controller handbook formatting' })
    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1)
  })

  it('saving without edits writes nothing; an edit saves the file with only that change', async () => {
    const { saves, user } = setup()
    const editor = await tiptap()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(saves).toEqual([])
    act(() => {
      let pos = -1
      editor.state.doc.descendants((n, p) => {
        if (pos < 0 && n.type.name === 'heading' && n.textContent.startsWith('3. Rules of Play')) {
          pos = p + n.nodeSize - 1
        }
        return pos < 0
      })
      editor.chain().insertContentAt(pos, ' — revised').run()
    })
    expect(await screen.findByText('Unsaved changes')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0]).toBe(
      HANDBOOK.replace(
        '### 3. Rules of Play (Instructor Guide)',
        '### 3. Rules of Play (Instructor Guide) — revised',
      ),
    )
  })

  it('edits markdown source and saves it', async () => {
    const { saves, user } = setup()
    await tiptap()
    await user.click(screen.getByRole('button', { name: 'Markdown source' }))
    const source = screen.getByRole('textbox', { name: 'Controller handbook markdown source' })
    expect((source as HTMLTextAreaElement).value).toBe(HANDBOOK)
    await user.type(source, 'Closing note.')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saves[0]).toBe(HANDBOOK + 'Closing note.'))
  })

  it('keeps edits while generation runs and saves when the job finishes', async () => {
    let busy = true
    const saves: string[] = []
    const { ttx, user } = setup({
      'scenarios:doc-save': (req: { markdown: string }) => {
        if (busy) throw new FakeIpcError('CONFLICT', 'Generation is running for this scenario')
        saves.push(req.markdown)
      },
    })
    await tiptap()
    await user.click(screen.getByRole('button', { name: 'Markdown source' }))
    await user.type(screen.getByRole('textbox', { name: /markdown source/ }), 'X')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/edits are kept here/)
    busy = false
    ttx.emit('job:done', { jobId: 'J', kind: 'rerun-stage', status: 'done' })
    await waitFor(() => expect(saves).toEqual([HANDBOOK + 'X']))
  })

  it('shows a diff of a history version against the current text and restores it', async () => {
    const older = HANDBOOK.replace('Room Setup & Logistics', 'Room Setup')
    const { ttx, user } = setup({
      'scenarios:history': () => [
        { id: 'H2', at: '2026-10-21T10:00:00.000Z', by: 'user', note: 'Edited' },
      ],
      'scenarios:history-get': () => ({ markdown: older }),
      'scenarios:history-restore': () => undefined,
    })
    await tiptap()
    await user.click(screen.getByRole('button', { name: 'History' }))
    await user.click(await screen.findByRole('button', { name: /Edited/ }))
    const diff = await screen.findByRole('list', { name: /Changes from this version/ })
    expect(within(diff).getByText('### 2. Room Setup')).toBeTruthy()
    expect(within(diff).getByText('### 2. Room Setup & Logistics')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Restore this version' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restore' }),
    )
    await waitFor(() =>
      expect(ttx.calls('scenarios:history-restore')[0]).toMatchObject({
        artifact: 'handbook',
        entryId: 'H2',
      }),
    )
    // The current text was saved to history first.
    expect(ttx.calls('scenarios:doc-save')[0]).toMatchObject({
      note: 'Before restoring an earlier version',
    })
  })
})

describe('lineDiff', () => {
  it('marks added and removed lines and collapses long unchanged runs', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'old'].join('\n')
    const after = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'new'].join('\n')
    expect(lineDiff(before, after)).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
      { kind: 'skip', text: '3 unchanged lines' },
      { kind: 'same', text: 'f' },
      { kind: 'same', text: 'g' },
      { kind: 'del', text: 'old' },
      { kind: 'add', text: 'new' },
    ])
  })
})
