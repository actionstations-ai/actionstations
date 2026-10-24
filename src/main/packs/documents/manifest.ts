// Reference documents manifest (#325, ADR-0020): packs/documents/manifest.json pins every
// public-domain document the core pack and the catalog-only `ai.actionstations.<domain>-library`
// packs carry, by source URL, sha256 and size. scripts/fetch-documents.mjs downloads them into
// a gitignored cache and refuses any file whose sha256 differs; scripts/build-library-packs.mjs
// builds the library packs from that cache. The repository never commits the library PDFs.
// Pure zod, no Node imports.
import { z } from 'zod'
import { HttpUrl } from '@shared/schemas/common'
import { PACK_ITEM_ID, SemVer, Sha256Hex } from '@shared/schemas/pack'
import { BUNDLED_DOCUMENT_LICENSES } from '../bundled-map'

export const DOCUMENTS_MANIFEST_VERSION = 1

/** `core` or `<domain>-library` (the pack id without `ai.actionstations.`). */
export const DocumentPackName = z
  .string()
  .regex(/^(core|[a-z0-9]+(?:-[a-z0-9]+)*-library)$/, 'Expected "core" or "<domain>-library"')
export type DocumentPackName = z.infer<typeof DocumentPackName>

/**
 * What the pack builder does to the fetched bytes:
 * - `strip-cover`: a CISA CTEP .docx; its cover photo (unknown provenance) becomes a blank image.
 * - `extract`: a .zip; the files in a pack format (.pdf/.docx/.pptx/.xlsx/.md/.txt) are packed,
 *   legacy .doc/.xls/.ppt and anything else are left out and listed as links.
 */
export const DocumentProcess = z.enum(['strip-cover', 'extract'])
export type DocumentProcess = z.infer<typeof DocumentProcess>

/** Extensions a fetched source file may have (the cache file keeps it). */
export const SOURCE_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'md', 'txt', 'zip'] as const

export const ManifestDocument = z
  .strictObject({
    /** The pack that carries it. */
    pack: DocumentPackName,
    /** Other library packs that carry it too (each library installs on its own). */
    alsoIn: z.array(DocumentPackName).default([]),
    /** Document group id inside the pack (`documents/<slug>/`); unique in the manifest. */
    slug: z.string().regex(PACK_ITEM_ID.documents, 'Invalid document slug'),
    /** Cache and pack file name: `<slug>.<ext>`. */
    file: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}\.[a-z]+$/),
    title: z.string().min(1).max(300),
    publisher: z.string().min(1).max(200),
    /** Edition or date as the document states it. */
    edition: z.string().min(1).max(200),
    url: HttpUrl,
    /** Tried in order when `url` fails (Wayback `id_` captures, agency mirrors). */
    mirrors: z.array(HttpUrl).default([]),
    landing: HttpUrl.optional(),
    /** Pinned hash and size of the fetched bytes; null until first pinned. */
    sha256: Sha256Hex.nullable(),
    size: z.number().int().positive().nullable(),
    license: z.enum(BUNDLED_DOCUMENT_LICENSES),
    /** Why it is public domain. */
    basis: z.string().min(1).max(500),
    process: DocumentProcess.optional(),
    note: z.string().max(1000).optional(),
    /** Date the hash was pinned (YYYY-MM-DD). */
    pinned: z.iso.date().optional(),
  })
  .superRefine((d, ctx) => {
    const ext = d.file.slice(d.file.lastIndexOf('.') + 1)
    if (!(SOURCE_EXTENSIONS as readonly string[]).includes(ext))
      ctx.addIssue({ code: 'custom', path: ['file'], message: `.${ext} is not a document format` })
    if (d.file !== `${d.slug}.${ext}`)
      ctx.addIssue({ code: 'custom', path: ['file'], message: 'file must be <slug>.<ext>' })
    if ((ext === 'zip') !== (d.process === 'extract'))
      ctx.addIssue({
        code: 'custom',
        path: ['process'],
        message: 'a .zip needs process "extract", and only a .zip',
      })
    if (d.process === 'strip-cover' && ext !== 'docx')
      ctx.addIssue({
        code: 'custom',
        path: ['process'],
        message: 'strip-cover works on .docx only',
      })
    if ((d.sha256 === null) !== (d.size === null))
      ctx.addIssue({
        code: 'custom',
        path: ['sha256'],
        message: 'sha256 and size are pinned together',
      })
    if (d.alsoIn.includes(d.pack) || d.alsoIn.includes('core'))
      ctx.addIssue({
        code: 'custom',
        path: ['alsoIn'],
        message: 'alsoIn lists other library packs only',
      })
  })
export type ManifestDocument = z.infer<typeof ManifestDocument>

/** A reference a pack README names with a link but does not carry. */
export const ManifestLink = z.strictObject({
  pack: DocumentPackName,
  title: z.string().min(1).max(300),
  publisher: z.string().max(200).default(''),
  url: HttpUrl,
  reason: z.string().max(500).default(''),
})
export type ManifestLink = z.infer<typeof ManifestLink>

/** Metadata of one catalog-only library pack. Bump `version` whenever its documents change. */
export const LibraryInfo = z.strictObject({
  name: z.string().min(1).max(100),
  summary: z.string().min(1).max(200),
  /** The domain profile id the library is for (scopes nothing; shown in the catalog). */
  domain: z.string().regex(/^[a-z][a-z0-9_]*$/),
  version: SemVer,
})
export type LibraryInfo = z.infer<typeof LibraryInfo>

export const DocumentsManifest = z
  .object({
    $comment: z.string().optional(),
    formatVersion: z.literal(DOCUMENTS_MANIFEST_VERSION),
    libraries: z.record(DocumentPackName, LibraryInfo).default({}),
    documents: z.array(ManifestDocument),
    links: z.array(ManifestLink).default([]),
  })
  .superRefine((m, ctx) => {
    const seen = new Set<string>()
    for (const [i, d] of m.documents.entries()) {
      if (seen.has(d.slug))
        ctx.addIssue({
          code: 'custom',
          path: ['documents', i, 'slug'],
          message: `Duplicate slug "${d.slug}"`,
        })
      seen.add(d.slug)
      for (const p of [d.pack, ...d.alsoIn])
        if (p !== 'core' && !m.libraries[p])
          ctx.addIssue({
            code: 'custom',
            path: ['documents', i, 'pack'],
            message: `No libraries entry for "${p}"`,
          })
    }
    if (m.libraries.core)
      ctx.addIssue({
        code: 'custom',
        path: ['libraries', 'core'],
        message: 'core is a bundled pack, not a library',
      })
  })
export type DocumentsManifest = z.infer<typeof DocumentsManifest>

/** The full pack id of a manifest pack name. */
export const documentPackId = (pack: DocumentPackName): string => `ai.actionstations.${pack}`

/** Library pack names in the manifest, sorted. */
export const libraryPacks = (m: DocumentsManifest): DocumentPackName[] =>
  [...new Set(m.documents.flatMap((d) => [d.pack, ...d.alsoIn]))].filter((p) => p !== 'core').sort()

/** The documents a pack carries (its own and the ones it shares). */
export const documentsOf = (m: DocumentsManifest, pack: DocumentPackName): ManifestDocument[] =>
  m.documents.filter((d) => d.pack === pack || d.alsoIn.includes(pack))

/** The links a pack README lists. */
export const linksOf = (m: DocumentsManifest, pack: DocumentPackName): ManifestLink[] =>
  m.links.filter((l) => l.pack === pack)

/** Cache path of a document, relative to the cache root. */
export const cachePath = (d: Pick<ManifestDocument, 'slug' | 'file'>): string =>
  `${d.slug}/${d.file}`
