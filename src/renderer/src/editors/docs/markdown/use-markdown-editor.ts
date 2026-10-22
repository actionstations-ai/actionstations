// The TipTap editor for one markdown document plus the lossless round-trip snapshot.
import { useEditor, type Editor } from '@tiptap/react'
import { useCallback, useMemo, useRef } from 'react'
import { useLatest } from '../use-latest'
import { ALLOW_MARKER_DELETE } from './comment'
import { documentExtensions } from './extensions'
import {
  createSnapshot,
  serializeWithSnapshot,
  snapshotDoc,
  type MarkdownCodec,
  type Snapshot,
} from './roundtrip'

export const codecFor = (editor: Editor): MarkdownCodec => ({
  parse: (md) => editor.markdown!.parse(md),
  serialize: (doc) => editor.markdown!.serialize(doc),
})

export function useMarkdownEditor(opts: {
  label: string
  surfaceId: string
  onChange: () => void
}) {
  const snapshot = useRef<Snapshot | null>(null)
  const onChange = useLatest(opts.onChange)
  const extensions = useMemo(() => documentExtensions(), [])

  const editor = useEditor({
    extensions,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        id: opts.surfaceId,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': opts.label,
        class: 'markdown doc-editor__surface',
        spellcheck: 'true',
      },
    },
    onUpdate: () => onChange.current(),
  })

  /** Replace the editor content with `markdown` (not undoable, no change event). */
  const load = useCallback(
    (markdown: string) => {
      if (!editor) return
      const snap = createSnapshot(codecFor(editor), editor.schema, markdown)
      snapshot.current = snap
      editor
        .chain()
        .setMeta(ALLOW_MARKER_DELETE, true)
        .setMeta('addToHistory', false)
        .setContent(snapshotDoc(snap), { emitUpdate: false })
        .run()
    },
    [editor],
  )

  /** The document as markdown; unchanged blocks keep their original text. */
  const markdown = useCallback((): string => {
    if (!editor || !snapshot.current) return ''
    return serializeWithSnapshot(
      snapshot.current,
      codecFor(editor),
      editor.schema,
      editor.getJSON(),
    )
  }, [editor])

  /** After a save, treat `saved` as the new original without touching the editor. */
  const rebase = useCallback(
    (saved: string) => {
      if (editor) snapshot.current = createSnapshot(codecFor(editor), editor.schema, saved)
    },
    [editor],
  )

  return { editor, load, markdown, rebase }
}
