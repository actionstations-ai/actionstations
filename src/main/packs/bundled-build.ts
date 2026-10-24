// Build the bundled packs (ADR-0020), run by scripts/build-bundled-packs.mjs: assemble each
// pack from packs/bundled.json and the repo folders (strict), hash every file, validate the
// pack with the app's own reader (as an in-memory archive), and only when every pack passes
// write out/bundled-packs/<id>/ (the files plus a full pack.json) and out/bundled-packs/
// index.json (pack order, the core flag and the reader's item summaries). electron-builder
// ships that folder as app-resources/packs/. Pure Node; the electron import of the reader's
// module graph is stubbed by the script.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import JSZip from 'jszip'
import {
  PACK_MANIFEST_FILE,
  PackManifest,
  type PackItemSummary,
  type PackManifest as PackManifestT,
} from '@shared/schemas/pack'
import { registerBundledProfiles } from '@shared/domains'
import { assembleBundledPacks, type AssembledPack } from './bundled-assemble'
import {
  BUNDLED_INDEX_FILE,
  BUNDLED_INDEX_VERSION,
  BUNDLED_MAP,
  sourceBundledProfileEntries,
  type BundledIndex,
  type BundledMap,
} from './bundled-map'
import { readPack } from './reader'

export interface BuildBundledOptions {
  /** The repo root (templates/, prompts/, comfy/, examples/, packs/). */
  root: string
  /** Where to write the packs (replaced as a whole). */
  outDir: string
  appVersion: string
  map?: BundledMap
}

export interface BuiltBundledPack {
  id: string
  core: boolean
  files: number
  bytes: number
  items: PackItemSummary[]
}

export type BuildBundledResult =
  { ok: true; packs: BuiltBundledPack[] } | { ok: false; problems: string[] }

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const ZIP_DATE = new Date('2000-01-01T00:00:00Z')

async function zip(entries: ReadonlyMap<string, Buffer>): Promise<Buffer> {
  const z = new JSZip()
  for (const name of [...entries.keys()].sort())
    z.file(name, entries.get(name)!, { date: ZIP_DATE, createFolders: false })
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' })
}

interface Hashed {
  pack: AssembledPack
  manifest: PackManifestT
  bytes: Map<string, Buffer>
}

async function hashPack(pack: AssembledPack): Promise<Hashed | string[]> {
  const bytes = new Map<string, Buffer>()
  for (const f of pack.files) bytes.set(f.path, await fs.readFile(f.source))
  const parsed = PackManifest.safeParse({
    ...pack.manifest,
    files: pack.files.map((f) => ({
      path: f.path,
      sha256: sha256(bytes.get(f.path)!),
      size: bytes.get(f.path)!.length,
    })),
  })
  if (!parsed.success)
    return parsed.error.issues.map(
      (i) => `${pack.manifest.id}: pack.json ${i.path.join('.') || '/'}: ${i.message}`,
    )
  return { pack, manifest: parsed.data, bytes }
}

/** The shipped prompt names (a pack prompt must name one; the core ships them all). */
const shippedPrompts = (packs: readonly AssembledPack[]): string[] =>
  packs.flatMap((p) => p.manifest.contents.prompts)

async function validate(
  h: Hashed,
  prompts: string[],
  appVersion: string,
): Promise<{ items: PackItemSummary[] } | { problems: string[] }> {
  const entries = new Map(h.bytes)
  entries.set(PACK_MANIFEST_FILE, Buffer.from(JSON.stringify(h.manifest, null, 2)))
  const read = await readPack(
    { buffer: await zip(entries) },
    {
      appVersion,
      trusted: true,
      builtins: { templates: [], prompts, workflows: [], examples: [] },
    },
  )
  return read.ok
    ? { items: read.pack.items }
    : {
        problems: read.problems.map(
          (p) => `${h.manifest.id}: ${p.path ? `${p.path}: ` : ''}${p.message}`,
        ),
      }
}

async function writePack(outDir: string, h: Hashed): Promise<void> {
  const dir = join(outDir, h.manifest.id)
  for (const [path, buf] of h.bytes) {
    const target = join(dir, ...path.split('/'))
    await fs.mkdir(dirname(target), { recursive: true })
    await fs.writeFile(target, buf)
  }
  await fs.writeFile(join(dir, PACK_MANIFEST_FILE), `${JSON.stringify(h.manifest, null, 2)}\n`)
}

/** Assemble, validate and (when everything passes) write the bundled packs. */
export async function buildBundledPacks(opts: BuildBundledOptions): Promise<BuildBundledResult> {
  const map = opts.map ?? BUNDLED_MAP
  const assembled = assembleBundledPacks(map, {
    root: opts.root,
    appVersion: opts.appVersion,
    strict: true,
  })
  if (assembled.problems.length) return { ok: false, problems: assembled.problems }
  // Example manifests may name their own pack's domain; register them as the app would.
  registerBundledProfiles(sourceBundledProfileEntries(opts.appVersion, map))
  const prompts = shippedPrompts(assembled.packs)
  const problems: string[] = []
  const done: { h: Hashed; items: PackItemSummary[] }[] = []
  for (const pack of assembled.packs) {
    const h = await hashPack(pack)
    if (Array.isArray(h)) {
      problems.push(...h)
      continue
    }
    const v = await validate(h, prompts, opts.appVersion)
    if ('problems' in v) problems.push(...v.problems)
    else done.push({ h, items: v.items })
  }
  if (problems.length) return { ok: false, problems }
  await fs.rm(opts.outDir, { recursive: true, force: true })
  await fs.mkdir(opts.outDir, { recursive: true })
  for (const { h } of done) await writePack(opts.outDir, h)
  const index: BundledIndex = {
    formatVersion: BUNDLED_INDEX_VERSION,
    appVersion: opts.appVersion,
    packs: done.map(({ h, items }) => ({ id: h.manifest.id, core: h.pack.core, items })),
  }
  await fs.writeFile(join(opts.outDir, BUNDLED_INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`)
  return {
    ok: true,
    packs: done.map(({ h, items }) => ({
      id: h.manifest.id,
      core: h.pack.core,
      files: h.manifest.files.length,
      bytes: h.manifest.files.reduce((n, f) => n + f.size, 0),
      items,
    })),
  }
}
