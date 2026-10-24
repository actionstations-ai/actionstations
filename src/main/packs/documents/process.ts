// Turn a fetched document into the files a pack carries (#325): as is, a CTEP .docx with its
// cover photo blanked, or the pack-format files of a .zip. Deterministic: rewritten archives
// keep their entry order and get one fixed timestamp, so the same input gives the same bytes.
import JSZip from 'jszip'
import type { ManifestDocument } from './manifest'

export interface PackedFile {
  /** File name inside documents/<slug>/. */
  name: string
  bytes: Buffer
  title: string
}

export interface Processed {
  files: PackedFile[]
  /** Archive members left out, with why (listed in the pack README). */
  skipped: { name: string; reason: string }[]
  notes: string[]
}

/** Extensions a pack document may have (PACK_EXTENSIONS.documents minus images). */
export const PACKABLE = ['.pdf', '.docx', '.pptx', '.xlsx', '.md', '.txt']
const LEGACY = ['.doc', '.xls', '.ppt']

const ZIP_DATE = new Date('2000-01-01T00:00:00Z')

/** Light grey placeholders (4×3 px) that take the cover photo's place, by extension. */
const BLANK: Record<string, Buffer> = {
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAADklEQVR4nGO4iQQYcHIAU1Mehd686NcAAAAASUVORK5CYII=',
    'base64',
  ),
  jpg: Buffer.from(
    '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAAAwAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAwAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A/WSiiigD/9k=',
    'base64',
  ),
}
BLANK.jpeg = BLANK.jpg!
BLANK.jfif = BLANK.jpg!
BLANK.emf = blankEmf()

/** An empty Enhanced Metafile: a header record and an end-of-file record, nothing drawn. */
function blankEmf(): Buffer {
  const b = Buffer.alloc(108)
  const ints = [1, 88, 0, 0, 3, 2, 0, 0, 100, 75, 0x464d4520, 0x10000, 108, 2]
  ints.forEach((v, i) => b.writeInt32LE(v, i * 4))
  b.writeUInt16LE(1, 56) // nHandles
  // nDescription, offDescription, nPalEntries stay 0; device 1024x768 px, 320x240 mm
  ;[1024, 768, 320, 240].forEach((v, i) => b.writeInt32LE(v, 72 + i * 4))
  ;[14, 20, 0, 16, 20].forEach((v, i) => b.writeInt32LE(v, 88 + i * 4)) // EMR_EOF
  return b
}

/** An image this large or larger is a photo, not an icon. */
export const COVER_MIN_BYTES = 20 * 1024
/**
 * The cover sits at the very start of the body (offset about 3,500 to 5,500 characters into
 * word/document.xml in every CTEP checked); an image further in is part of the content, and
 * the older physical-security CTEPs have a "[Insert Cover Picture]" placeholder instead.
 */
export const COVER_MAX_OFFSET = 20_000

const extOf = (name: string): string => {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

/** Rewrite a zip with fixed dates, same entry order, optionally replacing some entries. */
async function rezip(zip: JSZip, replace: ReadonlyMap<string, Buffer>): Promise<Buffer> {
  const out = new JSZip()
  for (const f of Object.values(zip.files)) {
    if (f.dir) continue
    const data = replace.get(f.name) ?? (await f.async('nodebuffer'))
    out.file(f.name, data, { date: ZIP_DATE, createFolders: false })
  }
  return out.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'DOS',
  })
}

/** The media entry of the image at the top of word/document.xml, if it is a cover photo. */
async function coverEntry(zip: JSZip): Promise<string | undefined> {
  const body = await zip.file('word/document.xml')?.async('string')
  const rels = await zip.file('word/_rels/document.xml.rels')?.async('string')
  if (!body || !rels) return undefined
  const embed = /r:embed="([^"]+)"/.exec(body)
  if (!embed || embed.index > COVER_MAX_OFFSET) return undefined
  const rid = embed[1]!
  const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`).exec(rels)?.[0]
  const target = rel && /\bTarget="([^"]+)"/.exec(rel)?.[1]
  if (!target || /TargetMode="External"/.test(rel)) return undefined
  const name = `word/${target.replace(/^\.?\//, '')}`
  const file = zip.file(name)
  if (!file || !BLANK[extOf(name).slice(1)]) return undefined
  const size = (await file.async('nodebuffer')).length
  return size >= COVER_MIN_BYTES ? name : undefined
}

/** A CTEP .docx with its cover photo replaced by a blank image of the same format. */
export async function stripCover(bytes: Buffer): Promise<{ bytes: Buffer; replaced?: string }> {
  const zip = await JSZip.loadAsync(bytes)
  const cover = await coverEntry(zip)
  const replace = new Map<string, Buffer>()
  if (cover) replace.set(cover, BLANK[extOf(cover).slice(1)]!)
  return { bytes: await rezip(zip, replace), ...(cover ? { replaced: cover } : {}) }
}

/** Name parts that only repeat the publisher's template marking ("HSEEP Template", "2020", "508"). */
const NOISE = /^(hseep template|508c?|(19|20)\d\d)$/i

/** The meaningful underscore-separated parts of a member's file name. */
const nameParts = (member: string): string[] => {
  const base = member.split('/').pop()!
  const parts = base
    .slice(0, base.length - extOf(base).length)
    .split('_')
    .map((p) => p.trim())
  const kept = parts.filter((p) => p && !NOISE.test(p))
  return kept.length ? kept : parts.filter(Boolean)
}

/** Longest name segment a pack path allows, minus room for a "-NN" de-duplication suffix. */
const MAX_NAME = 96

/** A pack-safe file name for an archive member: `[A-Za-z0-9_.-]`, no leading punctuation. */
export function safeName(member: string): string {
  const ext = extOf(member.split('/').pop()!)
  const stem = nameParts(member)
    .join('_')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^A-Za-z0-9_]+|[-._]+$/g, '')
  return `${stem.slice(0, MAX_NAME - ext.length).replace(/[-._]+$/, '') || 'file'}${ext}`
}

/** "Name (Stage, Variant)" from "Name_Stage_Variant_HSEEP Template_2020_508.docx". */
export const memberTitle = (member: string): string => {
  const [first, ...rest] = nameParts(member)
  return rest.length ? `${first} (${rest.join(', ')})` : (first ?? member)
}

/** The pack-format files of a .zip, flattened to unique safe names, sorted by member path. */
export async function extractArchive(doc: ManifestDocument, bytes: Buffer): Promise<Processed> {
  const zip = await JSZip.loadAsync(bytes)
  const out: Processed = { files: [], skipped: [], notes: [] }
  const used = new Set<string>()
  const members = Object.values(zip.files)
    .filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(f.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const f of members) {
    const ext = extOf(f.name)
    if (!PACKABLE.includes(ext)) {
      const reason = LEGACY.includes(ext)
        ? `legacy ${ext} format (no faithful conversion available); download the original`
        : `${ext || 'no extension'} is not a pack document format`
      out.skipped.push({ name: f.name, reason })
      continue
    }
    let name = safeName(f.name)
    for (let n = 2; used.has(name.toLowerCase()); n++)
      name = safeName(f.name).replace(ext, `-${n}${ext}`)
    used.add(name.toLowerCase())
    const data = await f.async('nodebuffer')
    out.files.push({ name, bytes: data, title: `${doc.title}: ${memberTitle(f.name)}` })
  }
  return out
}

/** The files a document contributes to a pack. */
export async function processDocument(doc: ManifestDocument, bytes: Buffer): Promise<Processed> {
  if (doc.process === 'extract') return extractArchive(doc, bytes)
  if (doc.process === 'strip-cover') {
    const r = await stripCover(bytes)
    return {
      files: [{ name: doc.file, bytes: r.bytes, title: doc.title }],
      skipped: [],
      notes: [
        r.replaced
          ? `cover photo ${r.replaced} replaced with a blank image`
          : 'no cover photo found',
      ],
    }
  }
  return { files: [{ name: doc.file, bytes, title: doc.title }], skipped: [], notes: [] }
}
