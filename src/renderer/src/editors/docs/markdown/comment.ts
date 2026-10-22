// HTML comments in a document (the pipeline's `<!-- section:rubric -->` markers) become an
// invisible atom node that renders back to the exact comment text. A guard plugin stops
// edits from deleting a marker, so a later re-run can still find and replace its section.
import { Node, type JSONContent } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'

export const COMMENT_RE = /^\s*<!--[\s\S]*?-->\s*$/

/** Meta key that lets a transaction remove markers (loading new content, source mode). */
export const ALLOW_MARKER_DELETE = 'allowMarkerDelete'

const markerCount = (doc: PmNode): number => {
  let n = 0
  doc.descendants((node) => {
    if (node.type.name === 'markdownComment') n += 1
    return node.isBlock
  })
  return n
}

export const MarkdownComment = Node.create({
  name: 'markdownComment',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes: () => ({ raw: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-md-comment]', getAttrs: (el) => ({ raw: el.dataset.raw }) }],
  renderHTML: ({ node }) => [
    'div',
    { 'data-md-comment': '', 'data-raw': node.attrs.raw as string, hidden: '', class: 'md-marker' },
  ],

  markdownTokenName: 'html',
  // An empty result hands every other HTML token back to the default handler.
  parseMarkdown: (token): JSONContent | JSONContent[] => {
    const raw = (token as { raw?: string }).raw ?? ''
    if (!(token as { block?: boolean }).block || !COMMENT_RE.test(raw)) return []
    return { type: 'markdownComment', attrs: { raw: raw.trim() } }
  },
  renderMarkdown: (node: JSONContent) => String(node.attrs?.raw ?? ''),

  addProseMirrorPlugins: () => [
    new Plugin({
      key: new PluginKey('markdownCommentGuard'),
      filterTransaction: (tr, state) => {
        if (!tr.docChanged || tr.getMeta(ALLOW_MARKER_DELETE)) return true
        return markerCount(tr.doc) >= markerCount(state.doc)
      },
    }),
  ],
})
