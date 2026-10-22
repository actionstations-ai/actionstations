// Lossless markdown round-trip for the WYSIWYG editor.
//
// TipTap's serializer normalizes markdown (list markers, escapes, spacing), so a document
// loaded and saved without edits would still change on disk. Instead the source is split
// into top-level blocks; each block is parsed on its own and remembered with its exact text.
// On save, blocks whose nodes are unchanged are written back verbatim and only edited
// blocks go through the serializer. Untouched content is therefore byte-identical.
import type { JSONContent } from '@tiptap/react'
import type { Schema } from '@tiptap/pm/model'
import { diffArrays } from 'diff'
import { Lexer } from 'marked'
import { COMMENT_RE } from './comment'

export interface MarkdownCodec {
  parse: (markdown: string) => JSONContent
  serialize: (doc: JSONContent) => string
}

interface Block {
  raw: string
  nodes: JSONContent[]
  keys: string[]
}

export interface Snapshot {
  lead: string
  blocks: Block[]
  /** seps[i] is the whitespace between blocks[i] and blocks[i + 1]. */
  seps: string[]
  trail: string
}

const isEmptyParagraph = (n: JSONContent): boolean =>
  n.type === 'paragraph' && !(n.content ?? []).length

type Mark = NonNullable<JSONContent['marks']>[number]
const sameMarks = (a: Mark[] = [], b: Mark[] = []): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/** Merge adjacent text nodes with equal marks so editing artifacts don't change keys. */
function mergeText(content: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = []
  for (const n of content) {
    const prev = out.at(-1)
    if (n.type === 'text' && prev?.type === 'text' && sameMarks(prev.marks, n.marks)) {
      out[out.length - 1] = { ...prev, text: (prev.text ?? '') + (n.text ?? '') }
    } else out.push(n.content ? { ...n, content: mergeText(n.content) } : n)
  }
  return out
}

/** Schema-normalized JSON (defaults filled) so parse output and editor output compare equal. */
export function canonicalKey(schema: Schema, node: JSONContent): string {
  let json: JSONContent
  try {
    json = schema.nodeFromJSON(node).toJSON() as JSONContent
  } catch {
    json = node
  }
  return JSON.stringify(json.content ? { ...json, content: mergeText(json.content) } : json)
}

/** Top-level blocks with their exact source text; the whitespace between them is kept apart. */
export function splitBlocks(
  markdown: string,
): { lead: string; raws: string[]; seps: string[]; trail: string } | null {
  const tokens = new Lexer({ gfm: true }).lex(markdown)
  if (tokens.map((t) => t.raw).join('') !== markdown) return null
  const raws: string[] = []
  const gaps: string[] = ['']
  for (const t of tokens) {
    if (t.type === 'space') {
      gaps[gaps.length - 1] += t.raw
      continue
    }
    const body = t.raw.trimEnd()
    raws.push(body)
    gaps.push(t.raw.slice(body.length))
  }
  const [lead = '', ...rest] = gaps
  return { lead, raws, seps: rest.slice(0, -1), trail: rest.at(-1) ?? '' }
}

/** A comment stays an invisible marker; any other unparsed source is shown as plain text. */
function rawBlockNode(raw: string): JSONContent {
  if (COMMENT_RE.test(raw)) return { type: 'markdownComment', attrs: { raw } }
  return { type: 'paragraph', content: [{ type: 'text', text: raw }] }
}

export function createSnapshot(codec: MarkdownCodec, schema: Schema, markdown: string): Snapshot {
  const split = splitBlocks(markdown.replace(/\r\n?/g, '\n'))
  if (!split) {
    const nodes = (codec.parse(markdown).content ?? []).filter((n) => !isEmptyParagraph(n))
    return { lead: '', blocks: [{ raw: '', nodes, keys: [] }], seps: [], trail: '' }
  }
  const blocks = split.raws.map((raw) => {
    const parsed = (codec.parse(raw).content ?? []).filter((n) => !isEmptyParagraph(n))
    // Source the editor has no node for (link definitions…) is kept as an invisible raw block.
    const nodes = parsed.length ? parsed : [rawBlockNode(raw)]
    return { raw, nodes, keys: nodes.map((n) => canonicalKey(schema, n)) }
  })
  return { lead: split.lead, blocks, seps: split.seps, trail: split.trail }
}

/**
 * Readability fixes for serializer output. TipTap writes `&` as `&amp;` and escapes every
 * bracket; the .md file is also read by people and by the pipeline's prompts, so a plain
 * ampersand and `[INJECT I-04]` are restored. `&lt;`/`&gt;` stay encoded so typed angle
 * brackets never become HTML, and a `[x]` followed by `(`, `[` or `:` keeps its escapes so
 * it cannot turn into a link. Fenced code is left alone.
 */
export function tidyMarkdown(md: string): string {
  let fenced = false
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
      if (fenced) return line
      return (
        line
          .replace(/&amp;(?![a-zA-Z#][a-zA-Z0-9]*;)/g, '&')
          .replace(/\\\[([^\]\n]*?)\\\](?![([:])/g, '[$1]')
          // GFM never reads an underscore inside a word as emphasis (OPS_INTERN_03).
          .replace(/(?<=[A-Za-z0-9])\\_(?=[A-Za-z0-9])/g, '_')
      )
    })
    .join('\n')
}

/** Serialize with the editor's serializer only (no original text reused). */
export const serializeFresh = (codec: MarkdownCodec, doc: JSONContent): string =>
  tidyMarkdown(codec.serialize(doc)).trim()

/** The editor document for a snapshot. */
export const snapshotDoc = (s: Snapshot): JSONContent => ({
  type: 'doc',
  content: s.blocks.flatMap((b) => b.nodes),
})

type Segment = { block: number } | { nodes: JSONContent[] }

/** Align current top-level nodes with the snapshot's blocks: unchanged blocks stay verbatim. */
function segments(s: Snapshot, schema: Schema, nodes: JSONContent[]): Segment[] {
  const owners = s.blocks.flatMap((b, i) => b.keys.map((_, j) => ({ block: i, first: j === 0 })))
  const oldKeys = s.blocks.flatMap((b) => b.keys)
  const newKeys = nodes.map((n) => canonicalKey(schema, n))
  const out: Segment[] = []
  const pushNode = (n: JSONContent) => {
    const last = out.at(-1)
    if (last && 'nodes' in last) last.nodes.push(n)
    else out.push({ nodes: [n] })
  }
  let oi = 0
  let ni = 0
  for (const part of diffArrays(oldKeys, newKeys)) {
    const count = part.count ?? part.value.length
    if (part.removed) {
      oi += count
      continue
    }
    if (part.added) {
      for (let k = 0; k < count; k++) pushNode(nodes[ni++]!)
      continue
    }
    let k = 0
    while (k < count) {
      const owner = owners[oi + k]!
      const size = s.blocks[owner.block]!.keys.length
      if (owner.first && k + size <= count) {
        out.push({ block: owner.block })
        k += size
        ni += size
      } else {
        pushNode(nodes[ni++]!)
        k += 1
      }
    }
    oi += count
  }
  return out
}

/** Serialize the editor document, reusing the original text of every unchanged block. */
export function serializeWithSnapshot(
  s: Snapshot,
  codec: MarkdownCodec,
  schema: Schema,
  doc: JSONContent,
): string {
  const nodes = (doc.content ?? []).filter((n) => !isEmptyParagraph(n))
  const parts = segments(s, schema, nodes)
  if (!parts.length) return ''
  let out = ''
  parts.forEach((p, i) => {
    const prev = parts[i - 1]
    if (prev) {
      const adjacent = 'block' in prev && 'block' in p && p.block === prev.block + 1
      out += adjacent ? s.seps[prev.block]! : '\n\n'
    } else if ('block' in p && p.block === 0) out += s.lead
    out +=
      'block' in p
        ? s.blocks[p.block]!.raw
        : serializeFresh(codec, { type: 'doc', content: p.nodes })
  })
  const last = parts.at(-1)!
  return out + ('block' in last && last.block === s.blocks.length - 1 ? s.trail : '\n')
}
