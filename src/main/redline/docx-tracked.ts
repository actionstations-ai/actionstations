// Tracked changes in a copy of the plan's own DOCX (#431, FR-4). Each accepted proposal is
// located as a span of paragraph text, word-diffed against the proposed wording, and the
// changed words are wrapped in w:del / w:ins with the app as author. Untouched runs keep their
// formatting; the original file is never written. Proposals whose text is not in a body
// paragraph (a table cell, a text box, spread over fields) are returned as unmatched so the
// caller can put them in the change memo.
//
// Pure apart from the zip: bytes in, bytes out. No DTD or entity is expanded; a document that
// declares either is refused. Everything but word/document.xml and docProps/core.xml (modified
// date) is copied through unchanged.
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { findExcerpt, countExcerpt } from '@shared/redline/excerpt'
import { wordDiff } from '@shared/redline/diff'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
/** Inflated size cap for the whole package (same bound as pack archives). */
const MAX_INFLATED = 200 * 1024 * 1024
const MAX_DOCUMENT_XML = 80 * 1024 * 1024

export interface TrackedProposal {
  id: string
  originalExcerpt: string
  proposedText: string
}

export interface TrackedOptions {
  author: string
  /** ISO date-time; written to w:date without milliseconds. */
  date: string
}

export interface TrackedResult {
  /** The edited package; empty when nothing could be applied. */
  bytes: Uint8Array
  applied: string[]
  /** Proposal id → why the text could not be located. */
  unmatched: { id: string; reason: string }[]
  /** Non-fatal notes, such as an excerpt that occurs twice. */
  warnings: string[]
}

type El = Element
const isEl = (n: Node | null | undefined): n is El => !!n && n.nodeType === 1
const isW = (n: Node | null | undefined, name: string): n is El =>
  isEl(n) && n.namespaceURI === W && n.localName === name

interface Segment {
  run: El
  start: number
  end: number
}

interface Scan {
  text: string
  segments: Segment[]
}

/** Text a run child contributes, in the same units the span search uses. */
function childText(c: El): string {
  if (isW(c, 't')) return c.textContent ?? ''
  if (isW(c, 'tab')) return '\t'
  if (isW(c, 'br') || isW(c, 'cr')) return '\n'
  if (isW(c, 'noBreakHyphen')) return '-'
  return ''
}

const contentChildren = (run: El): El[] =>
  Array.from(run.childNodes).filter((c): c is El => isEl(c) && !isW(c, 'rPr'))

const runText = (run: El): string => contentChildren(run).map(childText).join('')

/** Body paragraphs that are plain text flow: not in tables, text boxes or earlier revisions. */
function eligibleParagraphs(doc: Document): El[] {
  const all = Array.from(doc.getElementsByTagNameNS(W, 'p'))
  return all.filter((p) => {
    for (let n = p.parentNode; n; n = n.parentNode) {
      if (!isEl(n)) continue
      if (n.namespaceURI !== W) continue
      if (['tbl', 'txbxContent', 'ins', 'del', 'moveFrom', 'moveTo'].includes(n.localName ?? ''))
        return false
    }
    return true
  })
}

function paragraphRuns(p: El): El[] {
  const runs: El[] = []
  for (const c of Array.from(p.childNodes)) {
    if (isW(c, 'r')) runs.push(c)
    else if (isW(c, 'hyperlink') || isW(c, 'smartTag'))
      for (const r of Array.from(c.childNodes)) if (isW(r, 'r')) runs.push(r)
  }
  return runs
}

/** The document's text with a segment per run; paragraphs are joined by one "\n". */
function scan(paragraphs: El[]): Scan {
  let text = ''
  const segments: Segment[] = []
  paragraphs.forEach((p, i) => {
    if (i > 0) text += '\n'
    for (const run of paragraphRuns(p)) {
      const t = runText(run)
      segments.push({ run, start: text.length, end: text.length + t.length })
      text += t
    }
  })
  return { text, segments }
}

/** Split `run` at `offset` characters of its text; returns the new right-hand run. */
function splitRun(doc: Document, run: El, offset: number): El {
  const right = run.cloneNode(false) as El
  const rPr = Array.from(run.childNodes).find((c) => isW(c, 'rPr'))
  if (rPr) right.appendChild(rPr.cloneNode(true))
  let pos = 0
  let moving = false
  for (const c of contentChildren(run)) {
    const len = childText(c).length
    if (!moving && pos + len > offset) {
      moving = true
      if (isW(c, 't') && offset > pos) {
        const t = c.textContent ?? ''
        const keep = t.slice(0, offset - pos)
        const rest = t.slice(offset - pos)
        setText(c, keep)
        right.appendChild(textElement(doc, c.prefix ?? 'w', 't', rest))
        pos += len
        continue
      }
    }
    if (moving) right.appendChild(run.removeChild(c))
    pos += len
  }
  run.parentNode!.insertBefore(right, run.nextSibling)
  return right
}

function setText(el: El, text: string): void {
  while (el.firstChild) el.removeChild(el.firstChild)
  el.appendChild(el.ownerDocument!.createTextNode(text))
  el.setAttributeNS(XML_NS, 'xml:space', 'preserve')
}

function textElement(doc: Document, prefix: string, name: 't' | 'delText', text: string): El {
  const el = doc.createElementNS(W, `${prefix}:${name}`)
  setText(el, text)
  return el
}

class Editor {
  private nextId: number
  private readonly prefix: string
  constructor(
    private readonly doc: Document,
    private readonly opts: TrackedOptions,
  ) {
    this.prefix = doc.documentElement!.lookupPrefix(W) ?? 'w'
    let max = 0
    for (const el of Array.from(doc.getElementsByTagName('*'))) {
      const id = Number(el.getAttributeNS(W, 'id') || el.getAttribute(`${this.prefix}:id`))
      if (Number.isInteger(id) && id > max) max = id
    }
    this.nextId = max + 1
  }

  private revision(name: 'ins' | 'del'): El {
    const el = this.doc.createElementNS(W, `${this.prefix}:${name}`)
    el.setAttributeNS(W, `${this.prefix}:id`, String(this.nextId++))
    el.setAttributeNS(W, `${this.prefix}:author`, this.opts.author)
    el.setAttributeNS(W, `${this.prefix}:date`, this.opts.date)
    return el
  }

  /** Wrap a run in w:del and turn its text into deleted text. */
  deleteRun(run: El): void {
    const del = this.revision('del')
    run.parentNode!.insertBefore(del, run)
    del.appendChild(run)
    for (const t of Array.from(run.childNodes).filter((c) => isW(c, 't')) as El[]) {
      run.replaceChild(textElement(this.doc, this.prefix, 'delText', t.textContent ?? ''), t)
    }
  }

  /** A w:ins holding `text` in the formatting of `like`, placed after or before `anchor`. */
  insertText(anchor: El, where: 'after' | 'before', text: string, like: El): void {
    const ins = this.revision('ins')
    const run = this.doc.createElementNS(W, `${this.prefix}:r`)
    const rPr = Array.from(like.childNodes).find((c) => isW(c, 'rPr'))
    if (rPr) run.appendChild(rPr.cloneNode(true))
    run.appendChild(textElement(this.doc, this.prefix, 't', text))
    ins.appendChild(run)
    const parent = anchor.parentNode!
    parent.insertBefore(ins, where === 'after' ? anchor.nextSibling : anchor)
  }

  /** Split runs so `pos` is a run boundary; returns the fresh scan. */
  boundary(paragraphs: El[], pos: number): Scan {
    const s = scan(paragraphs)
    const seg = s.segments.find((x) => x.start < pos && pos < x.end)
    if (!seg) return s
    splitRun(this.doc, seg.run, pos - seg.start)
    return scan(paragraphs)
  }

  remove(paragraphs: El[], from: number, to: number): void {
    this.boundary(paragraphs, from)
    const s = this.boundary(paragraphs, to)
    for (const seg of s.segments)
      if (seg.end > seg.start && seg.start >= from && seg.end <= to) this.deleteRun(seg.run)
  }

  /** Insert after the character before `pos` (keeps its formatting); at a paragraph start, before. */
  insert(paragraphs: El[], pos: number, text: string): void {
    const s = this.boundary(paragraphs, pos)
    const atParagraphStart = pos === 0 || s.text[pos - 1] === '\n'
    const before = atParagraphStart
      ? undefined
      : s.segments.find((x) => x.end === pos && x.end > x.start)
    if (before) return this.insertText(before.run, 'after', text, before.run)
    const after = s.segments.find((x) => x.start === pos && x.end > x.start)
    if (after) this.insertText(after.run, 'before', text, after.run)
  }
}

interface Edit {
  kind: 'del' | 'ins'
  from: number
  to: number
  text: string
}

/** The edits that turn the matched text into the proposal, in document coordinates. */
function editsFor(matched: string, proposed: string, offset: number): Edit[] {
  const edits: Edit[] = []
  let pos = offset
  // A paragraph break in the matched text reads as a space, so the diff does not delete it.
  for (const op of wordDiff(matched.replace(/\n/g, ' '), proposed)) {
    if (op.kind === 'equal') pos += op.text.length
    else if (op.kind === 'del') {
      edits.push({ kind: 'del', from: pos, to: pos + op.text.length, text: '' })
      pos += op.text.length
    } else edits.push({ kind: 'ins', from: pos, to: pos, text: op.text })
  }
  return edits
}

const stripMarkdown = (s: string): string => s.replace(/(\*\*|__|`)/g, '')

function locate(text: string, excerpt: string) {
  const span = findExcerpt(text, excerpt)
  if (span) return { span, excerpt }
  const plain = stripMarkdown(excerpt)
  const span2 = plain !== excerpt ? findExcerpt(text, plain) : null
  return span2 ? { span: span2, excerpt: plain } : null
}

function applyOne(
  editor: Editor,
  doc: Document,
  p: TrackedProposal,
  warnings: string[],
): string | null {
  const paragraphs = eligibleParagraphs(doc)
  const { text } = scan(paragraphs)
  const found = locate(text, p.originalExcerpt)
  if (!found)
    return 'The text is not in a body paragraph (it may be in a table, a text box or a field).'
  if (countExcerpt(text, found.excerpt) > 1)
    warnings.push(`"${found.excerpt.slice(0, 40)}…" occurs more than once; the first is marked.`)
  const { start, end } = found.span
  const edits = editsFor(text.slice(start, end), p.proposedText, start)
  if (!edits.length) return 'The proposed text is the same as the current text.'
  // Back to front, so the positions of the edits still to make stay valid.
  for (const e of edits.reverse()) {
    if (e.kind === 'ins') editor.insert(paragraphs, e.from, e.text)
    else editor.remove(paragraphs, e.from, e.to)
  }
  return null
}

function assertSafeXml(xml: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('The document declares a DTD or entities, which are not read.')
}

async function openPackage(bytes: Uint8Array): Promise<JSZip> {
  const zip = await JSZip.loadAsync(bytes)
  let total = 0
  for (const f of Object.values(zip.files)) {
    const size = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
    total += size ?? 0
  }
  if (total > MAX_INFLATED) throw new Error('The document is larger than 200 MB when unpacked.')
  return zip
}

const withModifiedDate = (xml: string, date: string): string =>
  xml.replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${date}$2`)

/** Apply the proposals to a copy of the DOCX held in `original`. */
export async function applyTrackedChanges(
  original: Uint8Array,
  proposals: TrackedProposal[],
  opts: TrackedOptions,
): Promise<TrackedResult> {
  const zip = await openPackage(original)
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('The file has no word/document.xml; it is not a Word document.')
  const xml = await entry.async('string')
  if (xml.length > MAX_DOCUMENT_XML) throw new Error('The document body is too large to edit.')
  assertSafeXml(xml)
  const date = opts.date.replace(/\.\d+Z$/, 'Z')
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(xml, 'application/xml')
  const editor = new Editor(doc, { ...opts, date })
  const result: TrackedResult = {
    bytes: new Uint8Array(),
    applied: [],
    unmatched: [],
    warnings: [],
  }
  for (const p of proposals) {
    const problem = applyOne(editor, doc, p, result.warnings)
    if (problem) result.unmatched.push({ id: p.id, reason: problem })
    else result.applied.push(p.id)
  }
  if (!result.applied.length) return result
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc))
  const core = zip.file('docProps/core.xml')
  if (core) zip.file('docProps/core.xml', withModifiedDate(await core.async('string'), date))
  result.bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return result
}
