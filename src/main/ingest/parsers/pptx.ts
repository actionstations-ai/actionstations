// PPTX → one section per slide. The title placeholder is the heading, the slide number is
// the page, body shapes and tables become paragraphs, speaker notes are appended.
import { promises as fs } from 'node:fs'
import { posix } from 'node:path'
import JSZip from 'jszip'
import { cleanHeadingText } from '../headings'
import { OutlineBuilder } from '../outline'
import type { ParsedDocument } from '../types'
import { decodeEntities, pipeTable } from './html'

interface SlideContent {
  title?: string
  paragraphs: string[]
}

export async function parsePptx(filePath: string, fallbackTitle: string): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath))
  const slidePaths = await slideOrder(zip)
  const outline = new OutlineBuilder()
  let firstTitle: string | undefined
  for (const [index, slidePath] of slidePaths.entries()) {
    const page = index + 1
    const xml = await readEntry(zip, slidePath)
    const slide = readSlide(xml)
    firstTitle ??= slide.title
    outline.heading(1, slide.title ?? `Slide ${page}`)
    for (const p of slide.paragraphs) outline.paragraph(p, page)
    const notes = await slideNotes(zip, slidePath)
    if (notes) outline.paragraph(`Speaker notes: ${notes}`, page)
  }
  const coreTitle = await documentTitle(zip)
  return {
    title: coreTitle ?? firstTitle ?? fallbackTitle,
    pages: slidePaths.length,
    sections: outline.finish(),
  }
}

async function readEntry(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path)
  return file ? file.async('string') : ''
}

/** Slides in presentation order (presentation.xml sldIdLst → rels), falling back to slideN order. */
async function slideOrder(zip: JSZip): Promise<string[]> {
  const pres = await readEntry(zip, 'ppt/presentation.xml')
  const rels = parseRels(await readEntry(zip, 'ppt/_rels/presentation.xml.rels'))
  const ordered = [...pres.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)]
    .map((m) => rels.get(m[1]!))
    .filter((t): t is string => !!t)
    .map((t) => posix.normalize(posix.join('ppt', t)))
    .filter((p) => zip.file(p))
  if (ordered.length) return ordered
  const slideNumber = (p: string) => Number(/slide(\d+)\.xml$/.exec(p)?.[1] ?? 0)
  return Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b))
}

function parseRels(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1]!)?.[1]
    const target = /\bTarget="([^"]+)"/.exec(m[1]!)?.[1]
    if (id && target) map.set(id, target)
  }
  return map
}

/** Text of each <a:p> paragraph in an XML fragment (runs joined, line breaks as spaces). */
function paragraphsOf(xml: string): string[] {
  return [...xml.matchAll(/<a:p(?:\s[^>]*)?(?<!\/)>([\s\S]*?)<\/a:p>/g)]
    .map((m) => m[1] ?? '')
    .map((p) =>
      [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*>/g)]
        .map((r) => (r[1] !== undefined ? decodeEntities(r[1]) : ' '))
        .join(''),
    )
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function tableOf(xml: string): string {
  const rows = [...xml.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)].map((r) =>
    [...r[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map((c) =>
      paragraphsOf(c[0]).join(' ').replace(/\|/g, '\\|'),
    ),
  )
  return pipeTable(rows)
}

export function readSlide(xml: string): SlideContent {
  const slide: SlideContent = { paragraphs: [] }
  for (const m of xml.matchAll(
    /<p:sp>[\s\S]*?<\/p:sp>|<p:sp\s[\s\S]*?<\/p:sp>|<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g,
  )) {
    const shape = m[0]
    if (shape.startsWith('<p:graphicFrame')) {
      const table = tableOf(shape)
      if (table) slide.paragraphs.push(table)
      continue
    }
    const paras = paragraphsOf(shape)
    if (!paras.length) continue
    const isTitle = /<p:ph\b[^>]*\btype="(title|ctrTitle)"/.test(shape)
    if (isTitle && !slide.title) slide.title = cleanHeadingText(paras.join(' '))
    else slide.paragraphs.push(paras.join('\n'))
  }
  return slide
}

async function slideNotes(zip: JSZip, slidePath: string): Promise<string | undefined> {
  const relsPath = posix.join(
    posix.dirname(slidePath),
    '_rels',
    posix.basename(slidePath) + '.rels',
  )
  const rels = parseRels(await readEntry(zip, relsPath))
  const target = [...rels.values()].find((t) => /notesSlide\d+\.xml$/.test(t))
  if (!target) return undefined
  const xml = await readEntry(zip, posix.normalize(posix.join(posix.dirname(slidePath), target)))
  // Skip the slide-image and slide-number placeholders; keep the body text.
  const body = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>|<p:sp\s[\s\S]*?<\/p:sp>/g)]
    .map((m) => m[0])
    .filter((s) => !/<p:ph\b[^>]*\btype="(sldImg|sldNum|hdr|ftr|dt)"/.test(s))
    .flatMap(paragraphsOf)
  const text = body.join(' ').trim()
  return text || undefined
}

async function documentTitle(zip: JSZip): Promise<string | undefined> {
  const core = await readEntry(zip, 'docProps/core.xml')
  const raw = /<dc:title>([\s\S]*?)<\/dc:title>/.exec(core)?.[1]
  const title = raw ? decodeEntities(raw).trim() : ''
  return title || undefined
}
