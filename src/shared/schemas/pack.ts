// Packs (ADR-0018, docs/packs-format.md): downloadable bundles of templates, prompts, domain
// profiles, ComfyUI workflows, reference documents and example projects. A pack is a zip
// (`<id>-<version>.aspack`) with `pack.json` at its root; a catalog is a JSON index of packs.
// Integrity is hashes only: a sha256 per file in pack.json and a sha256 of the archive in the
// catalog. Pure zod + string checks, no Node imports, so the renderer and scripts can use it.
import { z } from 'zod'
import { HttpUrl, IsoDateTime } from './common'
import { INJECT_CATEGORIES, type InjectTypeInfo, type RenderPath } from '../taxonomy'

/**
 * The newest pack.json format this app reads. 2 added `regulations` and `frameworks` (#426,
 * ADR-0040); the reader accepts 1 and 2, and writers use the oldest version that can hold the
 * contents (packFormatVersionFor), so a pack without the new kinds still installs in older apps.
 */
export const PACK_FORMAT_VERSION = 2
export const CATALOG_FORMAT_VERSION = 1
export const PACK_FILE_EXT = '.aspack'
export const PACK_MANIFEST_FILE = 'pack.json'

/** Hard limits; the reader enforces the byte limits on actual bytes, not on declared sizes. */
export const PACK_LIMITS = {
  /** The .aspack archive itself. */
  maxArchiveBytes: 200 * 1024 * 1024,
  /** Sum of all uncompressed files. */
  maxTotalBytes: 500 * 1024 * 1024,
  /** One uncompressed file. */
  maxFileBytes: 100 * 1024 * 1024,
  /** pack.json. */
  maxManifestBytes: 1024 * 1024,
  maxFiles: 2000,
  /** Uncompressed / compressed for one entry (zip-bomb guard, applied by the reader). */
  maxCompressionRatio: 100,
  maxPathLength: 240,
  maxSegmentLength: 100,
  maxPathDepth: 12,
  /** Catalog index.json. */
  maxCatalogBytes: 5 * 1024 * 1024,
  maxCatalogEntries: 5000,
} as const

/** The kinds of content a pack can carry; each has a top-level folder of the same name. */
export const PACK_KINDS = [
  'templates',
  'prompts',
  'domains',
  'workflows',
  'documents',
  'examples',
  'regulations',
  'frameworks',
] as const
export const PackKind = z.enum(PACK_KINDS)
export type PackKind = z.infer<typeof PackKind>

// ---- scalar fields ------------------------------------------------------------------------

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
/** Reverse-DNS pack id: two or more lowercase labels ("ai.actionstations.social-media"). */
export const PackId = z
  .string()
  .max(128)
  .regex(
    new RegExp(`^${LABEL}(?:\\.${LABEL})+$`),
    'Pack id must be reverse-DNS, e.g. org.example.my-pack',
  )
export type PackId = z.infer<typeof PackId>

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/
/** Semantic version without build metadata ("1.0.0", "1.2.0-beta.1"). */
export const SemVer = z.string().max(64).regex(SEMVER, 'Expected a semantic version like 1.0.0')

export const Sha256Hex = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Expected a lowercase hex sha256 (64 characters)')

/** SPDX license expression ("CC-BY-4.0", "MIT OR Apache-2.0", "LicenseRef-Custom"). */
export const SpdxExpression = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^\(?[A-Za-z0-9.+-]+\)?(?: (?:AND|OR|WITH) \(?[A-Za-z0-9.+-]+\)?)*$/,
    'Expected an SPDX license expression, e.g. CC-BY-4.0',
  )

/** Domain profile id (src/shared/domains/schema.ts DomainProfile.id). */
export const PackDomainId = z.string().regex(/^[a-z][a-z0-9_]*$/, 'Invalid domain id')
export const PackTag = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/, 'Invalid tag')

/** GitHub user name (credit only; nothing is fetched from GitHub). */
export const GitHubUser = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/, 'Invalid GitHub user')

export const PackAuthor = z.object({
  name: z.string().min(1).max(200),
  url: HttpUrl.optional(),
  email: z.email().optional(),
  github: GitHubUser.optional(),
})
export type PackAuthor = z.infer<typeof PackAuthor>

export const CONTRIBUTOR_ROLES = [
  'author',
  'templates',
  'prompts',
  'documents',
  'examples',
  'translation',
  'review',
] as const
export const ContributorRole = z.enum(CONTRIBUTOR_ROLES)
export type ContributorRole = z.infer<typeof ContributorRole>

/** Everyone credited for a pack besides (or including) its author (#441). */
export const PackContributor = z.object({
  name: z.string().min(1).max(200),
  url: HttpUrl.optional(),
  github: GitHubUser.optional(),
  roles: z.array(ContributorRole).min(1).max(CONTRIBUTOR_ROLES.length),
})
export type PackContributor = z.infer<typeof PackContributor>
export const MAX_CONTRIBUTORS = 50

/** Ids under this prefix belong to the project; the app derives the Official label from it. */
export const OFFICIAL_PACK_PREFIX = 'ai.actionstations.'
export const isOfficialPackId = (id: string): boolean => id.startsWith(OFFICIAL_PACK_PREFIX)

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
/** Where an archive or catalog is fetched from: https, or http on loopback (local testing). */
export const PackFetchUrl = z.url({ protocol: /^https?$/ }).refine(
  (u) => {
    // Refinements still run after z.url() fails, so an unparsable string lands here too.
    if (!URL.canParse(u)) return false
    const url = new URL(u)
    return url.protocol === 'https:' || LOOPBACK.has(url.hostname)
  },
  { message: 'Pack and catalog URLs must use https' },
)

/** Whether a dotted IPv4 address is loopback, unspecified, private or link-local. */
function isLocalIpv4(h: string): boolean {
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return (
    a === 127 ||
    a === 0 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

/** Whether a bracketed IPv6 host is loopback, unspecified, unique-local, link-local or a mapped local IPv4. */
function isLocalIpv6(h: string): boolean {
  const v6 = h.slice(1, -1)
  if (v6 === '::1' || v6 === '::') return true
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return true
  // WHATWG URL writes ::ffff:127.0.0.1 as ::ffff:7f00:1.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6)
  if (!mapped) return false
  const [hi, lo] = [parseInt(mapped[1]!, 16), parseInt(mapped[2]!, 16)]
  return isLocalIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`)
}

/**
 * Whether a URL points at this computer or the local network (loopback, `localhost`, private
 * and link-local addresses), where ComfyUI, LM Studio or Ollama may listen. Literal hosts
 * only: a public name that resolves to a local address is not detected here.
 */
export function isLocalNetworkUrl(url: string | URL): boolean {
  let u: URL
  try {
    u = typeof url === 'string' ? new URL(url) : url
  } catch {
    return false
  }
  const h = u.hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  return h.startsWith('[') ? isLocalIpv6(h) : isLocalIpv4(h)
}

/**
 * Why a catalog entry's archive URL may not be fetched for this catalog, or undefined. A
 * catalog may point at this computer or the local network only when it is served from there
 * itself; otherwise a remote catalog could make Install send a request to a local service.
 */
export function catalogEntryUrlProblem(entryUrl: string, catalogUrl: string): string | undefined {
  if (isLocalNetworkUrl(entryUrl) && !isLocalNetworkUrl(catalogUrl))
    return 'The archive URL points at this computer or the local network, but the catalog does not'
  return undefined
}

// ---- paths inside a pack ------------------------------------------------------------------

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/
/** The one dotfile a pack may carry: an example project's .gitignore. */
const ALLOWED_DOTFILE = /^examples\/[^/]+\/project\/(?:.+\/)?\.gitignore$/

/** Why a path inside a pack is unsafe, or undefined when it is fine. */
export function packPathProblem(path: string): string | undefined {
  if (path.length === 0) return 'empty path'
  if (path.length > PACK_LIMITS.maxPathLength) return 'path too long'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return 'control character or backslash in path'
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'absolute path'
  if (path.normalize('NFC') !== path) return 'path is not NFC-normalized'
  const segments = path.split('/')
  if (segments.length > PACK_LIMITS.maxPathDepth) return 'path too deep'
  for (const s of segments) {
    if (s === '' || s === '.' || s === '..') return 'empty, "." or ".." segment'
    if (s.length > PACK_LIMITS.maxSegmentLength) return 'path segment too long'
    if (s.endsWith('.')) return 'segment ends with "."'
    if (WINDOWS_RESERVED.test(s.split('.')[0]!)) return 'reserved file name'
    if (!SEGMENT.test(s) && !(s === '.gitignore' && ALLOWED_DOTFILE.test(path)))
      return `segment "${s}" may contain only letters, digits, "_", "-" and "." (not first)`
  }
  return undefined
}

/** POSIX relative path inside a pack that cannot escape the install folder. */
export const PackPath = z.string().superRefine((p, ctx) => {
  const problem = packPathProblem(p)
  if (problem) ctx.addIssue({ code: 'custom', message: `Unsafe path "${p}": ${problem}` })
})

/** Files allowed at the pack root besides pack.json. */
export const PACK_ROOT_FILES = [
  'README.md',
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'NOTICE',
  'NOTICE.md',
  'CHANGELOG.md',
] as const

const IMAGES = ['.png', '.jpg', '.jpeg', '.webp']
const OFFICE = ['.pdf', '.docx', '.pptx', '.xlsx']
/** Lowercase extensions allowed per kind. Nothing executable; no SVG (it can carry script). */
export const PACK_EXTENSIONS: Record<PackKind, readonly string[]> = {
  templates: ['.html', '.css', '.json', ...IMAGES, '.woff2', '.woff', '.ttf', '.otf'],
  prompts: ['.md'],
  domains: ['.json'],
  workflows: ['.json'],
  documents: [...OFFICE, '.md', '.markdown', '.txt', '.png', '.jpg', '.jpeg'],
  examples: [
    '.json',
    '.md',
    '.txt',
    '.csv',
    ...IMAGES,
    '.mp3',
    '.wav',
    '.ogg',
    '.m4a',
    '.mp4',
    '.webm',
    ...OFFICE,
  ],
  regulations: ['.json'],
  frameworks: ['.json'],
}

/** Item id rules per kind (they become folder or file names in the app's layers). */
export const PACK_ITEM_ID: Record<PackKind, RegExp> = {
  templates: /^[a-z0-9_]+$/,
  prompts: /^[a-z][a-z0-9_]*$/,
  domains: /^[a-z][a-z0-9_]*$/,
  workflows: /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/,
  documents: /^[a-z0-9][a-z0-9_-]{0,63}$/,
  examples: /^[a-z0-9][a-z0-9_-]{0,63}$/,
  regulations: /^[a-z][a-z0-9_]{0,63}$/,
  frameworks: /^[a-z][a-z0-9_]{0,63}$/,
}

/** Kinds that need pack format 2 (#426): a version-1 manifest may not list them. */
export const FORMAT_2_KINDS = ['regulations', 'frameworks'] as const satisfies readonly PackKind[]

/** The oldest pack.json formatVersion that can hold these contents. */
export const packFormatVersionFor = (
  contents: Partial<Record<PackKind, readonly string[]>>,
): number => (FORMAT_2_KINDS.some((k) => (contents[k]?.length ?? 0) > 0) ? 2 : 1)

/**
 * `contents` for a pack.json a writer produces: every kind in order, except the format-2 kinds
 * when they are empty, so a pack without them stays version 1 and older apps (whose contents
 * schema is strict) can install it.
 */
export function manifestContents(
  contents: Partial<Record<PackKind, readonly string[]>>,
): Partial<Record<PackKind, string[]>> {
  const format2 = new Set<PackKind>(FORMAT_2_KINDS)
  return Object.fromEntries(
    PACK_KINDS.filter((k) => !format2.has(k) || (contents[k]?.length ?? 0) > 0).map((k) => [
      k,
      [...(contents[k] ?? [])],
    ]),
  )
}

/** Kinds whose items are single files in a flat folder (prompts/<name>.md…). */
const FLAT_KINDS: ReadonlySet<PackKind> = new Set([
  'prompts',
  'domains',
  'workflows',
  'regulations',
  'frameworks',
])

export type PackPathClass =
  { root: true } | { root: false; kind: PackKind; item: string; rest: string } | { error: string }

const extOf = (name: string): string => {
  if (name === '.gitignore') return '.gitignore'
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i).toLowerCase()
}

function flatItem(kind: PackKind, file: string): string | undefined {
  if (kind === 'prompts') return file.endsWith('.md') ? file.slice(0, -3) : undefined
  if (kind === 'workflows' && file.endsWith('.bindings.json'))
    return file.slice(0, -'.bindings.json'.length)
  return file.endsWith('.json') ? file.slice(0, -5) : undefined
}

/** Which kind and item a (safe) pack path belongs to, and whether its extension is allowed. */
export function classifyPackPath(path: string): PackPathClass {
  const segments = path.split('/')
  if (segments.length === 1) {
    return (PACK_ROOT_FILES as readonly string[]).includes(path)
      ? { root: true }
      : { error: `"${path}" is not allowed at the pack root` }
  }
  const kind = PackKind.safeParse(segments[0])
  if (!kind.success) return { error: `"${segments[0]}/" is not a pack content folder` }
  const k = kind.data
  if (FLAT_KINDS.has(k)) {
    if (segments.length !== 2) return { error: `${k}/ may not contain folders` }
    const item = flatItem(k, segments[1]!)
    if (!item || !PACK_ITEM_ID[k].test(item))
      return { error: `"${path}" is not a valid ${k} file name` }
    return { root: false, kind: k, item, rest: segments[1]! }
  }
  if (segments.length < 3) return { error: `${k}/ items must be folders (${k}/<id>/…)` }
  const item = segments[1]!
  if (!PACK_ITEM_ID[k].test(item)) return { error: `"${item}" is not a valid ${k} id` }
  const ext = extOf(segments[segments.length - 1]!)
  const allowed = k === 'examples' && ext === '.gitignore' ? true : PACK_EXTENSIONS[k].includes(ext)
  if (!allowed)
    return { error: `"${path}": ${ext || 'no extension'} files are not allowed in ${k}/` }
  if (k === 'templates' && ext === '.html' && segments.slice(2).join('/') !== 'template.html')
    return { error: `"${path}": the only HTML file in a template is template.html` }
  return { root: false, kind: k, item, rest: segments.slice(2).join('/') }
}

// ---- pack.json ----------------------------------------------------------------------------

export const PackFile = z.object({
  path: PackPath,
  sha256: Sha256Hex,
  size: z.number().int().nonnegative().max(PACK_LIMITS.maxFileBytes),
})
export type PackFile = z.infer<typeof PackFile>

const itemIds = (kind: PackKind) =>
  z
    .array(z.string().regex(PACK_ITEM_ID[kind], `Invalid ${kind} id`))
    .max(500)
    .default([])

/** What the pack provides, by kind. Unknown kinds are rejected, not ignored. */
export const PackContents = z.strictObject({
  templates: itemIds('templates'),
  prompts: itemIds('prompts'),
  domains: itemIds('domains'),
  workflows: itemIds('workflows'),
  documents: itemIds('documents'),
  examples: itemIds('examples'),
  regulations: itemIds('regulations'),
  frameworks: itemIds('frameworks'),
})
export type PackContents = z.infer<typeof PackContents>

/** One reference document file: shown in the license review and the "Add from pack" list. */
export const PackDocument = z.object({
  path: PackPath,
  title: z.string().min(1).max(300),
  /** Who published it and where it came from ("FEMA, fema.gov/…", "Written for this pack"). */
  source: z.string().max(500).optional(),
  license: SpdxExpression,
  description: z.string().max(2000).optional(),
})
export type PackDocument = z.infer<typeof PackDocument>

/** Files each item must have, relative to its folder (or the flat file names). */
function requiredFiles(kind: PackKind, id: string): string[] {
  switch (kind) {
    case 'templates':
      return [`templates/${id}/template.html`, `templates/${id}/meta.json`]
    case 'prompts':
      return [`prompts/${id}.md`]
    case 'domains':
      return [`domains/${id}.json`]
    case 'workflows':
      return [`workflows/${id}.json`, `workflows/${id}.bindings.json`]
    case 'documents':
      return []
    case 'examples':
      return [`examples/${id}/example.json`, `examples/${id}/project/project.json`]
    case 'regulations':
    case 'frameworks':
      return [`${kind}/${id}.json`]
  }
}

type Ctx = z.RefinementCtx

function checkFiles(files: PackFile[], contents: PackContents, ctx: Ctx): void {
  const seen = new Set<string>()
  let total = 0
  for (const [i, f] of files.entries()) {
    total += f.size
    const key = f.path.toLowerCase()
    if (seen.has(key))
      ctx.addIssue({
        code: 'custom',
        path: ['files', i, 'path'],
        message: `Duplicate path "${f.path}" (paths are compared case-insensitively)`,
      })
    seen.add(key)
    if (f.path === PACK_MANIFEST_FILE) {
      ctx.addIssue({
        code: 'custom',
        path: ['files', i, 'path'],
        message: 'pack.json is not listed in files',
      })
      continue
    }
    if (packPathProblem(f.path)) continue // already reported by PackPath
    const c = classifyPackPath(f.path)
    if ('error' in c) {
      ctx.addIssue({ code: 'custom', path: ['files', i, 'path'], message: c.error })
    } else if (!c.root && !contents[c.kind].includes(c.item)) {
      ctx.addIssue({
        code: 'custom',
        path: ['files', i, 'path'],
        message: `"${f.path}" belongs to ${c.kind} "${c.item}", which contents.${c.kind} does not list`,
      })
    }
  }
  if (total > PACK_LIMITS.maxTotalBytes)
    ctx.addIssue({
      code: 'custom',
      path: ['files'],
      message: 'Pack is larger than the uncompressed size limit',
    })
}

function checkContents(m: { contents: PackContents; files: PackFile[] }, ctx: Ctx): void {
  const paths = new Set(m.files.map((f) => f.path))
  let count = 0
  for (const kind of PACK_KINDS) {
    const ids = m.contents[kind]
    count += ids.length
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        path: ['contents', kind],
        message: `Duplicate ids in contents.${kind}`,
      })
    for (const id of ids) {
      for (const need of requiredFiles(kind, id))
        if (!paths.has(need))
          ctx.addIssue({
            code: 'custom',
            path: ['contents', kind],
            message: `${kind} "${id}" needs ${need}`,
          })
    }
  }
  if (count === 0)
    ctx.addIssue({
      code: 'custom',
      path: ['contents'],
      message: 'A pack must contain at least one item',
    })
}

function checkDocuments(
  m: { contents: PackContents; files: PackFile[]; documents: PackDocument[] },
  ctx: Ctx,
): void {
  const described = new Set(m.documents.map((d) => d.path))
  const listed = new Set(m.files.map((f) => f.path))
  for (const [i, d] of m.documents.entries()) {
    if (!listed.has(d.path))
      ctx.addIssue({
        code: 'custom',
        path: ['documents', i, 'path'],
        message: `"${d.path}" is not in files`,
      })
    if (!d.path.startsWith('documents/'))
      ctx.addIssue({
        code: 'custom',
        path: ['documents', i, 'path'],
        message: 'Document paths start with documents/',
      })
  }
  for (const f of m.files)
    if (f.path.startsWith('documents/') && !described.has(f.path))
      ctx.addIssue({
        code: 'custom',
        path: ['documents'],
        message: `"${f.path}" needs a documents[] entry (title and license)`,
      })
  for (const slug of m.contents.documents)
    if (!m.documents.some((d) => d.path.startsWith(`documents/${slug}/`)))
      ctx.addIssue({
        code: 'custom',
        path: ['contents', 'documents'],
        message: `documents "${slug}" has no files`,
      })
}

/** A version-1 manifest cannot list the kinds format 2 added. */
function checkFormatVersion(m: { formatVersion: number; contents: PackContents }, ctx: Ctx): void {
  if (m.formatVersion >= 2) return
  for (const kind of FORMAT_2_KINDS)
    if (m.contents[kind].length)
      ctx.addIssue({
        code: 'custom',
        path: ['contents', kind],
        message: `contents.${kind} needs formatVersion 2 (this pack.json says ${m.formatVersion})`,
      })
}

export const PackManifestShape = z.object({
  formatVersion: z.number().int().min(1).max(PACK_FORMAT_VERSION),
  id: PackId,
  name: z.string().min(1).max(100),
  version: SemVer,
  summary: z.string().min(1).max(200),
  /** Markdown, shown on the details page (rendered as text-only markdown, no raw HTML). */
  description: z.string().max(20_000).default(''),
  author: PackAuthor,
  contributors: z.array(PackContributor).max(MAX_CONTRIBUTORS).default([]),
  /** License of the pack's own content; documents[] entries carry their own. */
  license: SpdxExpression,
  homepage: HttpUrl.optional(),
  /** Oldest app version that can install the pack. */
  minAppVersion: SemVer,
  /** Domain profile ids the pack is for (empty = any). Also scopes the pack's prompts. */
  domains: z.array(PackDomainId).max(50).default([]),
  tags: z.array(PackTag).max(20).default([]),
  contents: PackContents,
  documents: z.array(PackDocument).max(PACK_LIMITS.maxFiles).default([]),
  files: z.array(PackFile).min(1).max(PACK_LIMITS.maxFiles),
})

/** `pack.json` at the root of an .aspack archive. */
export const PackManifest = PackManifestShape.superRefine((m, ctx) => {
  checkFiles(m.files, m.contents, ctx)
  checkContents(m, ctx)
  checkDocuments(m, ctx)
  checkFormatVersion(m, ctx)
})
export type PackManifest = z.infer<typeof PackManifest>

/**
 * The fields a reader checks before the full schema, so a pack from a newer format or for a
 * newer app gets "update the app" instead of a list of schema errors.
 */
export const PackManifestHeader = z.object({
  formatVersion: z.number().int().positive(),
  id: z.string().optional(),
  version: z.string().optional(),
  minAppVersion: z.string().optional(),
})

// ---- reader results (src/main/packs/reader.ts) ------------------------------------------

/** One reason a pack was refused; `path` is the archive path it concerns, when there is one. */
export const PackProblem = z.object({ path: z.string().optional(), message: z.string() })
export type PackProblem = z.infer<typeof PackProblem>

/** What the review screen lists for one item of a pack. */
export const PackItemSummary = z.object({
  kind: PackKind,
  id: z.string(),
  title: z.string(),
  /** A built-in template, prompt, workflow or example with this id is shadowed by the item. */
  replacesBuiltin: z.boolean(),
  /** The pack included with the app that ships the shadowed item (ADR-0020). */
  replacesPack: z.object({ id: z.string(), name: z.string() }).optional(),
  /** The pack license, or for a document group the license(s) of its files. */
  license: z.string(),
  /** Workflows only: node classes outside ComfyUI core ("needs custom nodes"). */
  customNodes: z.array(z.string()).optional(),
  /** Workflows only: custom node classes used only when installed; it runs without (#356). */
  optionalNodes: z.array(z.string()).optional(),
  /** Uncompressed bytes of the item's files. */
  size: z.number().int().nonnegative(),
})
export type PackItemSummary = z.infer<typeof PackItemSummary>

const RENDER_PATHS = [
  'template',
  'ai_image',
  'ai_video',
  'tts',
] as const satisfies readonly RenderPath[]
const DELIVERIES = [
  'hand_to_role',
  'display_main_screen',
  'play_audio',
  'read_aloud',
] as const satisfies readonly InjectTypeInfo['defaultDelivery'][]

/**
 * `taxonomy` block of a template meta.json whose type is not in the built-in inject taxonomy
 * (src/shared/taxonomy.ts): how the new type joins it (ADR-0018).
 */
export const TemplateTaxonomy = z.object({
  category: z.enum(INJECT_CATEGORIES),
  render: z.array(z.enum(RENDER_PATHS)).min(1),
  defaultDelivery: z.enum(DELIVERIES),
  domains: z.array(PackDomainId).optional(),
  paper: z.boolean().optional(),
})
export type TemplateTaxonomy = z.infer<typeof TemplateTaxonomy>

// ---- catalog index.json -------------------------------------------------------------------

export const PackCatalogEntry = z.object({
  id: PackId,
  name: z.string().min(1).max(100),
  version: SemVer,
  /** pack.json formatVersion of the archive; apps skip entries in a newer format. */
  formatVersion: z.number().int().positive().default(PACK_FORMAT_VERSION),
  summary: z.string().min(1).max(200),
  author: PackAuthor,
  contributors: z.array(PackContributor).max(MAX_CONTRIBUTORS).default([]),
  /** Informational; the app derives Official/Community from the id itself. */
  source: z.enum(['official', 'community']).optional(),
  /** GitHub reactions and confirmed users, gathered by the maintainer at site build. */
  endorsements: z
    .object({
      thumbsUp: z.number().int().min(0),
      usedBy: z.number().int().min(0),
      url: HttpUrl,
      asOf: IsoDateTime,
    })
    .optional(),
  review: z.object({ reviewedAt: IsoDateTime, appVersion: SemVer }).optional(),
  license: SpdxExpression,
  kinds: z
    .array(PackKind)
    .min(1)
    .refine((k) => new Set(k).size === k.length, 'Duplicate kinds'),
  domains: z.array(PackDomainId).max(50).default([]),
  tags: z.array(PackTag).max(20).default([]),
  minAppVersion: SemVer,
  /** Archive size in bytes. */
  size: z.number().int().positive().max(PACK_LIMITS.maxArchiveBytes),
  /** sha256 of the .aspack archive bytes. */
  sha256: Sha256Hex,
  url: PackFetchUrl,
  homepage: HttpUrl.optional(),
  updated: IsoDateTime,
})
export type PackCatalogEntry = z.infer<typeof PackCatalogEntry>

const catalogFields = {
  catalogVersion: z.literal(CATALOG_FORMAT_VERSION),
  name: z.string().min(1).max(100),
  updated: IsoDateTime,
  homepage: HttpUrl.optional(),
}

/** A whole catalog, every entry valid (what a catalog publisher's validator requires). */
export const PackCatalog = z
  .object({ ...catalogFields, packs: z.array(PackCatalogEntry).max(PACK_LIMITS.maxCatalogEntries) })
  .superRefine((c, ctx) => {
    const seen = new Set<string>()
    for (const [i, p] of c.packs.entries()) {
      const key = `${p.id}@${p.version}`
      if (seen.has(key))
        ctx.addIssue({ code: 'custom', path: ['packs', i], message: `Duplicate entry ${key}` })
      seen.add(key)
    }
  })
export type PackCatalog = z.infer<typeof PackCatalog>

export interface SkippedCatalogEntry {
  index: number
  id?: string
  reason: string
}

export type CatalogParseResult =
  { ok: true; catalog: PackCatalog; skipped: SkippedCatalogEntry[] } | { ok: false; reason: string }

/**
 * What the app does with a fetched catalog: the envelope must be valid; an invalid or
 * duplicate entry is skipped (and reported), not fatal, so one bad entry does not hide the rest.
 * With `catalogUrl` (where the index came from), an entry whose archive URL is on this computer
 * or the local network is skipped unless the catalog is too (catalogEntryUrlProblem).
 */
export function parseCatalog(
  data: unknown,
  opts: { catalogUrl?: string } = {},
): CatalogParseResult {
  const version = z.object({ catalogVersion: z.number().int() }).safeParse(data)
  if (version.success && version.data.catalogVersion > CATALOG_FORMAT_VERSION)
    return { ok: false, reason: 'This catalog needs a newer version of the app' }
  const envelope = z
    .object({ ...catalogFields, packs: z.array(z.unknown()).max(PACK_LIMITS.maxCatalogEntries) })
    .safeParse(data)
  if (!envelope.success)
    return {
      ok: false,
      reason: `Not a pack catalog: ${envelope.error.issues[0]?.message ?? 'invalid'}`,
    }
  const packs: PackCatalogEntry[] = []
  const skipped: SkippedCatalogEntry[] = []
  const seen = new Set<string>()
  for (const [index, raw] of envelope.data.packs.entries()) {
    const id = (raw as { id?: unknown } | null)?.id
    const named = typeof id === 'string' ? { id } : {}
    const entry = PackCatalogEntry.safeParse(raw)
    if (!entry.success) {
      skipped.push({ index, ...named, reason: entry.error.issues[0]?.message ?? 'invalid' })
      continue
    }
    const local = opts.catalogUrl && catalogEntryUrlProblem(entry.data.url, opts.catalogUrl)
    if (local) {
      skipped.push({ index, ...named, reason: local })
      continue
    }
    const key = `${entry.data.id}@${entry.data.version}`
    if (seen.has(key)) {
      skipped.push({ index, ...named, reason: `Duplicate entry ${key}` })
      continue
    }
    seen.add(key)
    packs.push(entry.data)
  }
  return { ok: true, catalog: { ...envelope.data, packs }, skipped }
}

// ---- installed packs: userData/packs/registry.json (#260) ---------------------------------

/** Where an installed pack came from (shown on the Packs screen). */
export const PackInstallSource = z.discriminatedUnion('kind', [
  /** Install from file: the file's base name (not its full path). */
  z.object({ kind: z.literal('file'), name: z.string().min(1).max(255) }),
  /** Install from URL: the archive URL the user pasted. */
  z.object({ kind: z.literal('url'), url: z.string().min(1).max(2048) }),
  /** Install or update from a catalog the user added: the catalog's index.json URL. */
  z.object({ kind: z.literal('catalog'), url: z.string().min(1).max(2048) }),
  /** Rebuilt from the pack folder after registry.json was damaged: the origin is not known. */
  z.object({ kind: z.literal('unknown') }),
  /** Included with the app (ADR-0020): read from the app's resources, never in the registry. */
  z.object({ kind: z.literal('bundled') }),
])
export type PackInstallSource = z.infer<typeof PackInstallSource>

/** An archive sha256, or "unknown" for an entry rebuilt from its folder (no archive left). */
export const ArchiveSha256 = z.union([Sha256Hex, z.literal('unknown')])

/** One installed pack. Its files are in userData/packs/<id>/<version>/ (read-only). */
export const PackRegistryEntry = z.object({
  id: PackId,
  version: SemVer,
  enabled: z.boolean(),
  installedAt: IsoDateTime,
  source: PackInstallSource,
  archiveSha256: ArchiveSha256,
  /** sha256 of the sorted "<sha256>  <path>\n" lines of pack.json files[]. */
  contentSha256: Sha256Hex,
  /** The review's item list, kept so the Packs screen and layers need not re-read content. */
  items: z.array(PackItemSummary).max(PACK_LIMITS.maxFiles).default([]),
})
export type PackRegistryEntry = z.infer<typeof PackRegistryEntry>

export const PACK_REGISTRY_VERSION = 1
/** userData/packs/registry.json, written atomically; one entry per pack id. */
export const PackRegistry = z
  .object({
    registryVersion: z.literal(PACK_REGISTRY_VERSION),
    packs: z.array(PackRegistryEntry),
    /** Packs included with the app that the user turned off (ADR-0020); default: all on. */
    bundledDisabled: z.array(PackId).max(PACK_LIMITS.maxFiles).default([]),
  })
  .refine((r) => new Set(r.packs.map((p) => p.id)).size === r.packs.length, {
    message: 'Duplicate pack id in the registry',
  })
export type PackRegistry = z.infer<typeof PackRegistry>

// ---- versions -----------------------------------------------------------------------------

function comparePre(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0
  if (a === undefined) return 1 // a release ranks above its prereleases
  if (b === undefined) return -1
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny && Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    if (nx !== ny) return nx ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** -1 / 0 / 1 by semver precedence. Throws on a string that is not a SemVer. */
export function compareSemver(a: string, b: string): number {
  const ma = SEMVER.exec(a)
  const mb = SEMVER.exec(b)
  if (!ma || !mb) throw new Error(`Not a semantic version: ${ma ? b : a}`)
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i])
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return comparePre(ma[4], mb[4])
}

/** Whether an app at `appVersion` may install a pack that needs `minAppVersion`. */
export const isAppCompatible = (minAppVersion: string, appVersion: string): boolean =>
  compareSemver(appVersion, minAppVersion) >= 0

/** Canonical archive file name: `<id>-<version>.aspack`. */
export const packArchiveName = (id: string, version: string): string =>
  `${id}-${version}${PACK_FILE_EXT}`
