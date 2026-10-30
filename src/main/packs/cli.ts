// Pack validator CLI (#259), run by `node scripts/pack-validate.mjs` (which bundles this file
// for plain Node) and by the site repository's local build. It calls the same readPack as the
// app; nothing here decides whether a pack is valid.
//
//   pack-validate <file.aspack>... [--app-version <v>]
//   pack-validate <file.aspack>... --catalog-entry --url <base> [--updated <iso>]
//   pack-validate --catalog <index.json>
//
// Exit code 0 when everything is valid, 1 otherwise (including usage errors).
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import {
  CATALOG_FORMAT_VERSION,
  PACK_KINDS,
  PACK_LIMITS,
  PackCatalog,
  PackCatalogEntry,
  packArchiveName,
  type PackProblem,
} from '@shared/schemas/pack'
import { readPack, type PackBuiltins, type VerifiedPack } from './reader'
import { bundledProfileEntries, registerBundledProfiles } from '@shared/domains'
import { sourceBundledProfileEntries } from './bundled-map'

export interface CliIo {
  out(line: string): void
  err(line: string): void
}

export interface CliOptions {
  /** Version the minAppVersion gate compares with (default: the checkout's package.json). */
  appVersion: string
  builtins?: PackBuiltins
  /** Clock for the entry's `updated` field (tests). */
  now?: () => Date
}

export const USAGE = `Usage:
  node scripts/pack-validate.mjs <file.aspack>... [--app-version <version>]
  node scripts/pack-validate.mjs <file.aspack>... --catalog-entry --url <base-url> [--updated <iso-date>]
  node scripts/pack-validate.mjs --catalog <index.json>

Validates packs with the app's own reader. Prints every problem with its path inside the pack.
--catalog-entry  print the catalog entry (JSON; an array for several files); the archive URL
                 is <base-url>/<id>-<version>.aspack
--catalog        validate a whole catalog index.json strictly (every entry must be valid)
Exit code 0 when valid, 1 otherwise.`

interface Args {
  files: string[]
  catalog?: string
  catalogEntry: boolean
  url?: string
  updated?: string
  appVersion?: string
}

const VALUE_FLAGS = new Set(['--catalog', '--url', '--updated', '--app-version'])

export function parseArgs(argv: readonly string[]): Args | string {
  const args: Args = { files: [], catalogEntry: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (VALUE_FLAGS.has(a)) {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) return `${a} needs a value`
      if (a === '--catalog') args.catalog = v
      else if (a === '--url') args.url = v
      else if (a === '--updated') args.updated = v
      else args.appVersion = v
    } else if (a === '--catalog-entry') args.catalogEntry = true
    else if (a.startsWith('--')) return `Unknown option ${a}`
    else args.files.push(a)
  }
  if (args.catalog && (args.files.length || args.catalogEntry))
    return '--catalog takes no pack files'
  if (!args.catalog && !args.files.length) return 'No pack file given'
  if (args.catalogEntry && !args.url) return '--catalog-entry needs --url <base-url>'
  if (!args.catalogEntry && (args.url || args.updated))
    return '--url and --updated go with --catalog-entry'
  return args
}

const formatProblem = (file: string, p: PackProblem): string =>
  `${file}: ${p.path ? `${p.path}: ` : ''}${p.message}`

/** The catalog entry for a verified pack (validated with PackCatalogEntry). */
export function catalogEntry(
  pack: VerifiedPack,
  archiveSize: number,
  baseUrl: string,
  updated: string,
): PackCatalogEntry {
  const m = pack.manifest
  return PackCatalogEntry.parse({
    id: m.id,
    name: m.name,
    version: m.version,
    formatVersion: m.formatVersion,
    summary: m.summary,
    author: m.author,
    contributors: m.contributors,
    license: m.license,
    kinds: PACK_KINDS.filter((k) => m.contents[k].length > 0),
    domains: m.domains,
    tags: m.tags,
    minAppVersion: m.minAppVersion,
    size: archiveSize,
    sha256: pack.archiveSha256,
    url: `${baseUrl.replace(/\/+$/, '')}/${packArchiveName(m.id, m.version)}`,
    ...(m.homepage ? { homepage: m.homepage } : {}),
    updated,
  })
}

async function validateCatalog(file: string, io: CliIo): Promise<number> {
  const st = await fs.stat(file).catch(() => null)
  if (!st?.isFile()) return (io.err(`${file}: cannot read`), 1)
  if (st.size > PACK_LIMITS.maxCatalogBytes)
    return (io.err(`${file}: larger than ${PACK_LIMITS.maxCatalogBytes} bytes`), 1)
  let data: unknown
  try {
    data = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (e) {
    return (io.err(`${file}: not valid JSON: ${(e as Error).message}`), 1)
  }
  const version = (data as { catalogVersion?: unknown } | null)?.catalogVersion
  if (typeof version === 'number' && version > CATALOG_FORMAT_VERSION)
    return (io.err(`${file}: this catalog needs a newer version of the app`), 1)
  const parsed = PackCatalog.safeParse(data)
  if (!parsed.success) {
    for (const i of parsed.error.issues)
      io.err(`${file}: ${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`)
    return 1
  }
  io.out(`${file}: ok (${parsed.data.packs.length} packs)`)
  return 0
}

/** The author and contributors with their roles, one line each (empty when none are listed). */
export function creditLines(m: {
  author: { name: string }
  contributors: readonly { name: string; github?: string | undefined; roles: readonly string[] }[]
}): string[] {
  if (!m.contributors.length) return []
  return [
    `  author: ${m.author.name}`,
    ...m.contributors.map(
      (c) => `  contributor: ${c.name}${c.github ? ` (@${c.github})` : ''} - ${c.roles.join(', ')}`,
    ),
  ]
}

async function validatePacks(args: Args, opts: CliOptions, io: CliIo): Promise<number> {
  const appVersion = args.appVersion ?? opts.appVersion
  const updated = args.updated ?? (opts.now?.() ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z')
  const entries: PackCatalogEntry[] = []
  let failed = false
  for (const file of args.files) {
    const r = await readPack(
      { path: file },
      { appVersion, ...(opts.builtins ? { builtins: opts.builtins } : {}) },
    )
    const name = basename(file)
    if (!r.ok) {
      failed = true
      for (const p of r.problems) io.err(formatProblem(name, p))
      continue
    }
    const { manifest: m } = r.pack
    if (!args.catalogEntry) {
      io.out(
        `${name}: ok (${m.id} ${m.version}, ${m.files.length} files, sha256 ${r.pack.archiveSha256})`,
      )
      for (const line of creditLines(m)) io.out(line)
      continue
    }
    try {
      const size = (await fs.stat(file)).size
      entries.push(catalogEntry(r.pack, size, args.url!, updated))
    } catch (e) {
      failed = true
      io.err(`${name}: cannot make a catalog entry: ${(e as Error).message}`)
    }
  }
  if (args.catalogEntry && !failed)
    io.out(JSON.stringify(args.files.length === 1 ? entries[0] : entries, null, 2))
  return failed ? 1 : 0
}

/** Run the validator; returns the exit code. */
export async function runCli(
  argv: readonly string[],
  opts: CliOptions,
  io: CliIo,
): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) return (io.out(USAGE), 0)
  // Plain Node: reserve the bundled domain ids (ADR-0020) as the app does at startup.
  if (!bundledProfileEntries().length)
    registerBundledProfiles(sourceBundledProfileEntries(opts.appVersion))
  const args = parseArgs(argv)
  if (typeof args === 'string') {
    io.err(args)
    io.err(USAGE)
    return 1
  }
  if (args.catalog) return validateCatalog(args.catalog, io)
  return validatePacks(args, opts, io)
}
