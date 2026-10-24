// Pack fixture builder (#258). Archives are built at test time, never committed: a valid pack
// covering all six kinds (modeled on freight-rail.pack.json, with real content taken from the
// app's own prompts, workflows, domains and examples), plus one broken archive per acceptance
// case. `writePackFixtures(dir)` writes every archive to a folder (for the CLI validator, #259).
//
// Some cases need bytes jszip will not write (a "../" name, an encrypted flag, a duplicate):
// those are built with a placeholder of the same length and patched in the raw zip.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { DOMAIN_PROFILES } from '../../../src/shared/domains'

export type PackTree = Record<string, string | Buffer>
export type Manifest = Record<string, unknown> & {
  files: { path: string; sha256: string; size: number }[]
}

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const repo = (p: string): string => readFileSync(join(ROOT, p), 'utf8')
const FIXED_DATE = new Date('2026-01-01T00:00:00Z')

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const TEMPLATE_HTML = `<div class="board {{variant}}">
  <header><img src="logo.png" alt=""><h1>{{fields.desk}} dispatch</h1></header>
  <table>
    {{#each fields.trains}}
    <tr class="{{#if late}}late{{/if}}"><td>{{symbol}}</td><td>{{track}}</td><td>{{status}}</td></tr>
    {{/each}}
  </table>
  {{#if assets.photo}}<img class="cam" src="{{assets.photo}}" alt="">{{/if}}
  <svg width="10" height="10"><defs><linearGradient id="g"></linearGradient></defs><rect fill="url(#g)" width="10" height="10"/></svg>
</div>
`

const TEMPLATE_CSS = `@font-face { font-family: Board; src: url('fonts/board.woff2') format('woff2'); }
.board { font-family: Board, monospace; background: url("data:image/png;base64,AAAA") no-repeat; }
.late td { color: #c00; }
`

function domainProfile(): Record<string, unknown> {
  const transit = structuredClone(DOMAIN_PROFILES.find((p) => p.id === 'transit')!)
  return {
    ...transit,
    id: 'freight_rail',
    label: 'Freight rail',
    description: 'A freight railroad: yards, mainline subdivisions and a dispatch desk.',
    aliases: ['freight_railroad'],
  }
}

function exampleProject(): Record<string, unknown> {
  const project = JSON.parse(repo('examples/city-water/project/project.json')) as Record<
    string,
    unknown
  >
  return {
    ...project,
    name: 'Harbor Junction Terminal Railroad',
    orgType: 'freight_rail',
    documents: [],
    scenarios: [],
  }
}

function workflow(): Record<string, unknown> {
  const wf = JSON.parse(repo('comfy/workflows/sdxl-photo.json')) as Record<string, unknown>
  return { ...wf, '99': { class_type: 'UltimateSDUpscale', inputs: { image: ['8', 0] } } }
}

/** Every file of the valid pack except pack.json. */
export function validPackTree(): PackTree {
  const sidecar = JSON.parse(repo('comfy/workflows/sdxl-photo.bindings.json')) as Record<
    string,
    unknown
  >
  return {
    'README.md': '# Freight Rail Operations\n\nA test pack.\n',
    LICENSE: 'Creative Commons Attribution 4.0 International\n',
    'templates/rail_dispatch_board/template.html': TEMPLATE_HTML,
    'templates/rail_dispatch_board/style.css': TEMPLATE_CSS,
    'templates/rail_dispatch_board/logo.png': PNG_1PX,
    'templates/rail_dispatch_board/fonts/board.woff2': Buffer.from('wOF2-test'),
    'templates/rail_dispatch_board/meta.json': JSON.stringify({
      type: 'rail_dispatch_board',
      label: 'Rail dispatch board',
      width: 1280,
      variants: ['day', 'night'],
      taxonomy: {
        category: 'operational',
        render: ['template'],
        defaultDelivery: 'display_main_screen',
        domains: ['freight_rail'],
      },
    }),
    'templates/rail_dispatch_board/schema.json': JSON.stringify({
      type: 'object',
      required: ['desk', 'trains'],
      properties: {
        desk: { type: 'string' },
        trains: { type: 'array', items: { type: 'object' } },
      },
    }),
    'templates/rail_dispatch_board/preview.json': JSON.stringify({
      fields: { desk: 'Harbor', trains: [{ symbol: 'M-HJ12', track: '3', status: 'Held' }] },
      assets: { photo: 'logo.png' },
    }),
    'templates/rail_dispatch_board/__golden__/default.png': PNG_1PX,
    'prompts/inject_text.md': repo('prompts/inject_text.md'),
    'domains/freight_rail.json': JSON.stringify(domainProfile(), null, 2),
    'workflows/yard-cctv-still.json': JSON.stringify(workflow(), null, 2),
    'workflows/yard-cctv-still.bindings.json': JSON.stringify({
      ...sidecar,
      name: 'Yard CCTV still',
    }),
    'documents/rail-emergency-plan/emergency-response-plan.pdf': Buffer.from('%PDF-1.4\n%test\n'),
    'documents/rail-emergency-plan/hazmat-quick-reference.md': '# Hazmat quick reference\n',
    'examples/harbor-junction/example.json': JSON.stringify({
      id: 'harbor-junction',
      title: 'Harbor Junction Terminal Railroad',
      domainProfile: 'freight_rail',
      summary: 'A hazmat release in a fictional terminal railroad yard.',
      fictional: true,
      notice: 'Fictional organization for exercise use.',
    }),
    'examples/harbor-junction/project/project.json': JSON.stringify(exampleProject(), null, 2),
    'examples/harbor-junction/project/.gitignore': '.cache/\nindex.sqlite\n',
  }
}

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const bytes = (v: string | Buffer): Buffer => (typeof v === 'string' ? Buffer.from(v) : v)

/** pack.json for a tree, with every file's sha256 and size. */
export function manifestFor(tree: PackTree): Manifest {
  return {
    formatVersion: 1,
    id: 'ai.actionstations.freight-rail',
    name: 'Freight Rail Operations',
    version: '1.0.0',
    summary: 'Domain profile, dispatch board template, prompt, workflow, documents and an example.',
    author: { name: 'Action Stations', url: 'https://actionstations.ai' },
    license: 'CC-BY-4.0',
    minAppVersion: '0.3.0',
    domains: ['freight_rail'],
    tags: ['rail'],
    contents: {
      templates: ['rail_dispatch_board'],
      prompts: ['inject_text'],
      domains: ['freight_rail'],
      workflows: ['yard-cctv-still'],
      documents: ['rail-emergency-plan'],
      examples: ['harbor-junction'],
    },
    documents: [
      {
        path: 'documents/rail-emergency-plan/emergency-response-plan.pdf',
        title: 'Railroad Emergency Response Plan (template)',
        license: 'CC-BY-4.0',
      },
      {
        path: 'documents/rail-emergency-plan/hazmat-quick-reference.md',
        title: 'Hazmat release quick reference',
        license: 'CC0-1.0',
      },
    ],
    files: Object.entries(tree)
      .map(([path, v]) => ({ path, sha256: sha256(bytes(v)), size: bytes(v).length }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }
}

export interface ZipEntry {
  name: string
  data: string | Buffer
  unixPermissions?: number
}

/** A zip with exactly these entries, in order, deflated, with fixed dates. */
export async function zipEntries(entries: ZipEntry[]): Promise<Buffer> {
  const zip = new JSZip()
  for (const e of entries)
    zip.file(e.name, e.data, {
      date: FIXED_DATE,
      createFolders: false,
      ...(e.unixPermissions !== undefined ? { unixPermissions: e.unixPermissions } : {}),
    })
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' })
}

export interface BuildOptions {
  /** Change pack.json before it is written (after hashes are computed). */
  manifest?: (m: Manifest) => void
  /** Entries added to the archive but not to pack.json. */
  extra?: ZipEntry[]
  /** Paths left out of the archive (still listed in pack.json). */
  omit?: string[]
}

/** Build an .aspack from a tree: pack.json first, then the files in tree order. */
export async function buildPack(
  tree: PackTree = validPackTree(),
  opts: BuildOptions = {},
): Promise<Buffer> {
  const manifest = manifestFor(tree)
  opts.manifest?.(manifest)
  const entries: ZipEntry[] = [{ name: 'pack.json', data: JSON.stringify(manifest, null, 2) }]
  for (const [name, data] of Object.entries(tree))
    if (!opts.omit?.includes(name)) entries.push({ name, data })
  return zipEntries([...entries, ...(opts.extra ?? [])])
}

export interface EntryPatch {
  /** New name, same byte length as the old one. */
  name?: string
  /** OR-ed into the general purpose bit flag. */
  setFlags?: number
}

/** Patch one entry's local and central headers in a built zip (copy; input unchanged). */
export function patchEntry(zip: Buffer, name: string, patch: EntryPatch): Buffer {
  const buf = Buffer.from(zip)
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(at + 28)
    const next = at + 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
    if (buf.toString('utf8', at + 46, at + 46 + nameLen) === name) {
      const local = buf.readUInt32LE(at + 42)
      if (patch.name !== undefined) {
        const n = Buffer.from(patch.name)
        if (n.length !== nameLen) throw new Error('patched name must keep its length')
        n.copy(buf, at + 46)
        n.copy(buf, local + 30)
      }
      if (patch.setFlags !== undefined) {
        buf.writeUInt16LE(buf.readUInt16LE(at + 8) | patch.setFlags, at + 8)
        buf.writeUInt16LE(buf.readUInt16LE(local + 6) | patch.setFlags, local + 6)
      }
      return buf
    }
    at = next
  }
  throw new Error(`no entry ${name}`)
}

const withTree = (edit: (t: PackTree) => void): PackTree => {
  const t = validPackTree()
  edit(t)
  return t
}
const T = 'templates/rail_dispatch_board'

export interface PackFixture {
  build(): Promise<Buffer>
  /** What the reader's problems must say. */
  expect: RegExp
  /** Smaller limits the case is read with (over-total: 500 MB is too slow to build). */
  limits?: { maxTotalBytes?: number; maxFileBytes?: number }
}

/** One archive per acceptance case of #258, each with the message it must fail with. */
export const PACK_FIXTURES: Record<string, PackFixture> = {
  'zip-slip': {
    build: async () =>
      patchEntry(
        await buildPack(undefined, { extra: [{ name: 'xx/evil.md', data: 'x' }] }),
        'xx/evil.md',
        {
          name: '../evil.md',
        },
      ),
    expect: /unsafe path: empty, "\." or "\.\." segment/,
  },
  'absolute-path': {
    build: async () =>
      patchEntry(
        await buildPack(undefined, { extra: [{ name: 'xtmp/evil.md', data: 'x' }] }),
        'xtmp/evil.md',
        {
          name: '/tmp/evil.md',
        },
      ),
    expect: /unsafe path: absolute path/,
  },
  symlink: {
    build: () =>
      buildPack(undefined, {
        extra: [{ name: 'NOTICE', data: '../../../../etc/passwd', unixPermissions: 0o120777 }],
      }),
    expect: /symbolic link/,
  },
  'case-collision': {
    build: () => buildPack(undefined, { extra: [{ name: 'readme.md', data: 'x' }] }),
    expect: /differs from "README.md" only in case/,
  },
  'duplicate-entry': {
    build: async () =>
      patchEntry(
        await buildPack(undefined, { extra: [{ name: 'READMEXmd', data: 'x' }] }),
        'READMEXmd',
        {
          name: 'README.md',
        },
      ),
    expect: /duplicate entry in the archive/,
  },
  'extra-entry': {
    build: () => buildPack(undefined, { extra: [{ name: 'NOTICE', data: 'x' }] }),
    expect: /in the archive but not listed in pack.json files/,
  },
  'missing-file': {
    build: () => buildPack(undefined, { omit: ['README.md'] }),
    expect: /listed in pack.json files but missing from the archive/,
  },
  'wrong-sha': {
    build: () =>
      buildPack(undefined, {
        manifest: (m) => {
          m.files.find((f) => f.path === 'README.md')!.sha256 = '0'.repeat(64)
        },
      }),
    expect: /sha256 does not match pack.json/,
  },
  'wrong-size': {
    build: () =>
      buildPack(undefined, {
        manifest: (m) => {
          m.files.find((f) => f.path === 'README.md')!.size += 1
        },
      }),
    expect: /size is \d+ bytes; pack.json says \d+/,
  },
  'zip-bomb': {
    build: () =>
      buildPack(
        withTree(
          (t) => (t['examples/harbor-junction/project/notes.txt'] = Buffer.alloc(20 * 1024 * 1024)),
        ),
      ),
    expect: /compression ratio exceeds 100:1/,
  },
  'over-total': {
    build: () => buildPack(),
    limits: { maxTotalBytes: 8 * 1024 },
    expect: /larger than the uncompressed size limit/,
  },
  encrypted: {
    build: async () => patchEntry(await buildPack(), 'README.md', { setFlags: 0x1 }),
    expect: /encrypted/,
  },
  'newer-format': {
    build: () => buildPack(undefined, { manifest: (m) => (m.formatVersion = 2) }),
    expect: /needs a newer version of the app.*Update Action Stations/,
  },
  'min-app-version': {
    build: () => buildPack(undefined, { manifest: (m) => (m.minAppVersion = '9.0.0') }),
    expect: /needs Action Stations 9\.0\.0 or later.*Update Action Stations/,
  },
  'template-script': {
    build: () =>
      buildPack(withTree((t) => (t[`${T}/template.html`] += '<script>alert(1)</script>\n'))),
    expect: /<script> is not allowed/,
  },
  'template-onload': {
    build: () =>
      buildPack(
        withTree((t) => (t[`${T}/template.html`] += '<img src="logo.png" onload="x()">\n')),
      ),
    expect: /event handler attributes are not allowed/,
  },
  'template-remote-url': {
    build: () =>
      buildPack(
        withTree(
          (t) => (t[`${T}/style.css`] += '.x { background: url(https://example.com/a.png); }\n'),
        ),
      ),
    expect: /CSS url\(\): "https:\/\/example.com\/a.png" is not allowed/,
  },
  'template-triple-stash': {
    build: () => buildPack(withTree((t) => (t[`${T}/template.html`] += '<p>{{{raw}}}</p>\n'))),
    expect: /triple-stash/,
  },
  'prompt-js-frontmatter': {
    build: () =>
      buildPack(
        withTree(
          (t) =>
            (t['prompts/inject_text.md'] = (t['prompts/inject_text.md'] as string).replace(
              /^---/,
              '---js',
            )),
        ),
      ),
    expect: /frontmatter must be YAML/,
  },
  'domain-reuses-airport': {
    build: () =>
      buildPack(
        withTree((t) => {
          const d = JSON.parse(t['domains/freight_rail.json'] as string) as { aliases: string[] }
          d.aliases.push('airport')
          t['domains/freight_rail.json'] = JSON.stringify(d)
        }),
      ),
    expect: /"airport" is a built-in domain id or alias/,
  },
}

/** Write the valid pack and every broken one to `dir`; returns name → file path. */
export async function writePackFixtures(dir: string): Promise<Record<string, string>> {
  mkdirSync(dir, { recursive: true })
  const out: Record<string, string> = {}
  const all: [string, () => Promise<Buffer>][] = [
    ['valid', () => buildPack()],
    ...Object.entries(PACK_FIXTURES).map(
      ([n, f]) => [n, f.build] as [string, () => Promise<Buffer>],
    ),
  ]
  for (const [name, build] of all) {
    const path = join(dir, `${name}.aspack`)
    writeFileSync(path, await build())
    out[name] = path
  }
  return out
}
