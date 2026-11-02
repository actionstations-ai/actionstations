// CycloneDX 1.5 SBOMs for a release (#551): the desktop app's production dependencies and the
// self-hosted server's (relay/node). Built from `pnpm list --prod`, so it needs no extra tool
// and no network. Usage: node scripts/sbom.mjs [--out <dir>] [--version <x.y.z>]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')

export function purl(name, version) {
  const encoded = name.startsWith('@') ? `%40${name.slice(1)}` : name
  return `pkg:npm/${encoded}@${version}`
}

/** Flattens the nested `pnpm list --json` tree into unique components and dependency edges. */
export function collectComponents(listRoot) {
  const components = new Map()
  const edges = new Map()
  const visit = (deps, parentRef) => {
    for (const [name, node] of Object.entries(deps ?? {})) {
      const realName = node.from && !node.from.includes(':') ? node.from : name
      const ref = purl(realName, node.version)
      if (!components.has(ref)) {
        components.set(ref, { name: realName, version: node.version, path: node.path })
      }
      if (!edges.has(parentRef)) edges.set(parentRef, new Set())
      edges.get(parentRef).add(ref)
      if (node.dependencies) visit(node.dependencies, ref)
    }
  }
  const rootRef = purl(listRoot.name, listRoot.version)
  visit(listRoot.dependencies, rootRef)
  return { rootRef, components, edges }
}

function licenseOf(path, read) {
  const pkg = read(path)
  if (!pkg) return undefined
  const raw = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type
  return raw ? [{ license: { name: raw } }] : undefined
}

function readPackageJson(dir) {
  const file = join(dir ?? '', 'package.json')
  try {
    return dir && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
  } catch {
    return undefined
  }
}

/** Builds the CycloneDX document. `timestamp` and `read` are injectable for tests. */
export function buildBom(listRoot, opts = {}) {
  const { timestamp = new Date().toISOString(), read = readPackageJson } = opts
  const { rootRef, components, edges } = collectComponents(listRoot)
  const sorted = [...components.entries()].sort(([a], [b]) => a.localeCompare(b))
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp,
      tools: { components: [{ type: 'application', name: 'actionstations scripts/sbom.mjs' }] },
      component: {
        type: 'application',
        'bom-ref': rootRef,
        name: opts.name ?? listRoot.name,
        version: listRoot.version,
      },
    },
    components: sorted.map(([ref, c]) => ({
      type: 'library',
      'bom-ref': ref,
      name: c.name,
      version: c.version,
      purl: ref,
      licenses: licenseOf(c.path, read),
    })),
    dependencies: [rootRef, ...sorted.map(([ref]) => ref)].map((ref) => ({
      ref,
      dependsOn: [...(edges.get(ref) ?? [])].sort(),
    })),
  }
}

function listProd(filter) {
  const args = [
    ...(filter ? ['--filter', filter] : []),
    'list',
    '--prod',
    '--depth',
    'Infinity',
    '--json',
  ]
  const out = execFileSync('pnpm', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 << 20,
    shell: process.platform === 'win32',
  })
  return JSON.parse(out)[0]
}

export const TARGETS = [
  { file: (v) => `actionstations-${v}-sbom.cdx.json`, filter: undefined, name: 'actionstations' },
  {
    file: (v) => `actionstations-relay-${v}-sbom.cdx.json`,
    filter: '@actionstations/relay-node',
    name: 'actionstations-relay',
  },
]

function main() {
  const argv = process.argv.slice(2)
  const arg = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  const out = resolve(arg('--out') ?? join(ROOT, 'sbom-out'))
  const version =
    arg('--version') ?? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  mkdirSync(out, { recursive: true })
  for (const t of TARGETS) {
    const bom = buildBom(listProd(t.filter), { name: t.name })
    bom.metadata.component.version = version
    writeFileSync(join(out, t.file(version)), JSON.stringify(bom, null, 2) + '\n')
    console.log(`${t.file(version)}: ${bom.components.length} components`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
