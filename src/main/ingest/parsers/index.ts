// One entry point for every supported format: parse(filePath) → { title, pages, sections }.
import { promises as fs } from 'node:fs'
import { basename, extname } from 'node:path'
import { AppError } from '../../lib/errors'
import type { ParsedDocument, ParseOptions, ParserKind } from '../types'

const KIND_BY_EXT: Record<string, ParserKind> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.xlsx': 'xlsx',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.text': 'text',
  '.html': 'html',
  '.htm': 'html',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
}

const MIME_BY_KIND: Record<ParserKind, (ext: string) => string> = {
  pdf: () => 'application/pdf',
  docx: () => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: () => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: () => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  markdown: () => 'text/markdown',
  text: () => 'text/plain',
  html: () => 'text/html',
  image: (ext) => (ext === '.png' ? 'image/png' : 'image/jpeg'),
}

export const SUPPORTED_EXTENSIONS = Object.keys(KIND_BY_EXT)

export function parserKindFor(filePath: string): ParserKind {
  const ext = extname(filePath).toLowerCase()
  const kind = KIND_BY_EXT[ext]
  if (!kind) {
    throw new AppError(
      'VALIDATION',
      `Unsupported file type "${ext || basename(filePath)}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
    )
  }
  return kind
}

export function mimeTypeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return MIME_BY_KIND[parserKindFor(filePath)](ext)
}

/** Formats heavy enough to parse off the main thread. */
export const needsWorker = (kind: ParserKind): boolean => kind === 'pdf'

/**
 * Parse any supported file. `displayName` (the user's original filename) is the fallback
 * title; the stored copy is always called original.<ext>.
 */
export async function parseFile(
  filePath: string,
  displayName = basename(filePath),
  opts: ParseOptions = {},
): Promise<ParsedDocument> {
  const fallbackTitle = displayName.replace(/\.[^.]+$/, '')
  switch (parserKindFor(filePath)) {
    case 'pdf':
      return (await import('./pdf')).parsePdf(filePath, fallbackTitle, opts)
    case 'docx':
      return (await import('./docx')).parseDocx(filePath, fallbackTitle)
    case 'pptx':
      return (await import('./pptx')).parsePptx(filePath, fallbackTitle)
    case 'xlsx':
      return (await import('./xlsx')).parseXlsx(filePath, fallbackTitle)
    case 'markdown':
      return (await import('./markdown')).parseMarkdown(await fs.readFile(filePath, 'utf8'), {
        fallbackTitle,
      })
    case 'text':
      return (await import('./text')).parseText(await fs.readFile(filePath, 'utf8'), {
        fallbackTitle,
      })
    case 'html':
      return (await import('./html')).parseHtml(await fs.readFile(filePath, 'utf8'), {
        fallbackTitle,
      })
    case 'image':
      return (await import('./image')).parseImage(filePath, fallbackTitle, opts)
  }
}
