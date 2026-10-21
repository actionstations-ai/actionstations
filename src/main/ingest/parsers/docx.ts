// DOCX → HTML (mammoth maps Heading 1–6 styles to h1–h6) → sections.
import mammoth from 'mammoth'
import type { ParsedDocument } from '../types'
import { parseHtml } from './html'

const STYLE_MAP = ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => p:fresh"]

export async function parseDocx(filePath: string, fallbackTitle: string): Promise<ParsedDocument> {
  const { value: html } = await mammoth.convertToHtml(
    { path: filePath },
    {
      styleMap: STYLE_MAP,
      ignoreEmptyParagraphs: true,
      // Images carry no citable text; skip base64-encoding them.
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
    },
  )
  return parseHtml(html, { fallbackTitle })
}
