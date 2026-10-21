// Pure helpers for the Documents screen. No React, so they are unit-testable in Node.
import type { DocumentMeta } from '@shared/schemas/project'

export type DocumentKindValue = DocumentMeta['kind']
export type DocumentStatusValue = DocumentMeta['status']

export const DOCUMENT_KINDS: { value: DocumentKindValue; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'policy', label: 'Policy' },
  { value: 'map', label: 'Map' },
  { value: 'form', label: 'Form' },
  { value: 'course', label: 'Course material' },
  { value: 'prior_exercise', label: 'Prior exercise' },
  { value: 'other', label: 'Other' },
]

/** File-dialog filters for importable source documents. */
export const IMPORT_FILTERS: { name: string; extensions: string[] }[] = [
  {
    name: 'All supported',
    extensions: [
      'pdf',
      'docx',
      'pptx',
      'xlsx',
      'md',
      'markdown',
      'txt',
      'html',
      'htm',
      'png',
      'jpg',
      'jpeg',
      'tif',
      'tiff',
      'webp',
    ],
  },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Word', extensions: ['docx'] },
  { name: 'PowerPoint', extensions: ['pptx'] },
  { name: 'Excel', extensions: ['xlsx'] },
  { name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] },
  { name: 'HTML', extensions: ['html', 'htm'] },
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp'] },
]

const STATUS_TONES: Record<DocumentStatusValue, 'neutral' | 'ok' | 'warn' | 'error' | 'info'> = {
  pending: 'neutral',
  parsing: 'info',
  embedding: 'info',
  ok: 'ok',
  error: 'error',
}
export const statusTone = (s: DocumentStatusValue) => STATUS_TONES[s]

const STATUS_LABELS: Record<DocumentStatusValue, string> = {
  pending: 'Pending',
  parsing: 'Parsing',
  embedding: 'Embedding',
  ok: 'Indexed',
  error: 'Error',
}
export const statusLabel = (s: DocumentStatusValue) => STATUS_LABELS[s]

export function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Heading paths look like "TIRP › Section 13 › 13.6 FIDS/BHS System Failure". */
export function splitHeadingPath(path: string): string[] {
  return path
    .split(/\s*(?:›|>)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export interface HeadingNode {
  label: string
  /** Full path to this node, joined with " › ". Unique among siblings. */
  key: string
  children: HeadingNode[]
}

/** Build a tree from flat heading-path strings, preserving first-seen order. */
export function buildHeadingTree(paths: string[]): HeadingNode[] {
  const roots: HeadingNode[] = []
  for (const path of paths) {
    let level = roots
    const parts: string[] = []
    for (const label of splitHeadingPath(path)) {
      parts.push(label)
      let node = level.find((n) => n.label === label)
      if (!node) {
        node = { label, key: parts.join(' › '), children: [] }
        level.push(node)
      }
      level = node.children
    }
  }
  return roots
}

/** Split long text into pages of roughly `size` characters, breaking at line ends. */
export function paginateText(text: string, size = 20_000): string[] {
  if (text.length <= size) return [text]
  const pages: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + size)
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end)
      if (nl > start) end = nl + 1
    }
    pages.push(text.slice(start, end))
    start = end
  }
  return pages
}

/** Normalize a tag typed by the user; returns null when it should be ignored. */
export function normalizeTag(raw: string, existing: string[]): string | null {
  const tag = raw.trim().replace(/\s+/g, ' ')
  if (!tag) return null
  if (existing.some((t) => t.toLowerCase() === tag.toLowerCase())) return null
  return tag
}

export const isBusy = (s: DocumentStatusValue) =>
  s === 'pending' || s === 'parsing' || s === 'embedding'
