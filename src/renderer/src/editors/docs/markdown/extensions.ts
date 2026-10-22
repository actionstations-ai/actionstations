import type { AnyExtension } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { MarkdownComment } from './comment'
import { TableExtensions } from './table'

/** Only web and mail links are kept; anything else (javascript:, file:) is dropped. */
export const isSafeHref = (href: string): boolean => /^(https?:|mailto:|#)/i.test(href.trim())

/** The editor schema for scenario documents: CommonMark + GFM tables + preserved comments. */
export function documentExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
    }),
    MarkdownComment,
    ...TableExtensions,
    Markdown.configure({ markedOptions: { gfm: true } }),
  ]
}
