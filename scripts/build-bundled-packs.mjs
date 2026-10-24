#!/usr/bin/env node
// Builds the packs included with the app (ADR-0020, #314):
//
//   node scripts/build-bundled-packs.mjs [--out <dir>]      (default out/bundled-packs)
//
// Reads packs/bundled.json and the repo folders, writes one folder per pack with a full
// pack.json (hashes and sizes) plus index.json, and validates every pack with the app's own
// reader first. Fails (exit 1, nothing written) when an item is mapped to no pack or to two,
// a mapped item is missing, or the reader refuses a pack. electron-builder ships the result as
// app-resources/packs/ (electron-builder.yml).
//
// The builder is TypeScript with `@shared` aliases and an `electron` import in its module
// graph, so like scripts/pack-validate.mjs this bundles src/main/packs/bundled-build.ts with
// Vite (electron stubbed) into node_modules/.cache/bundled-packs/ whenever a source is newer.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'node_modules', '.cache', 'bundled-packs')
const bundle = join(cacheDir, 'build.mjs')
const entry = join(root, 'src', 'main', 'packs', 'bundled-build.ts')

function newestSource() {
  let newest = statSync(fileURLToPath(import.meta.url)).mtimeMs
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name)
      if (d.isDirectory()) walk(p)
      else if (/\.(ts|mjs|json)$/.test(d.name)) newest = Math.max(newest, statSync(p).mtimeMs)
    }
  }
  walk(join(root, 'src', 'main'))
  walk(join(root, 'src', 'shared'))
  walk(join(root, 'packs'))
  return newest
}

async function buildBundle() {
  const { build } = await import('vite')
  await build({
    configFile: false,
    root,
    logLevel: 'error',
    resolve: {
      alias: {
        '@shared': join(root, 'src', 'shared'),
        '@main': join(root, 'src', 'main'),
        electron: join(root, 'scripts', 'pack-validate', 'electron-stub.mjs'),
      },
    },
    build: {
      ssr: entry,
      outDir: cacheDir,
      emptyOutDir: true,
      target: 'node20',
      minify: false,
      rollupOptions: { output: { format: 'es', entryFileNames: 'build.mjs' } },
    },
  })
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

async function main() {
  const args = process.argv.slice(2)
  const at = args.indexOf('--out')
  const outDir = resolve(at >= 0 ? args[at + 1] : join(root, 'out', 'bundled-packs'))
  if (!existsSync(bundle) || statSync(bundle).mtimeMs < newestSource()) await buildBundle()
  process.env.TTX_RESOURCES = root
  const { buildBundledPacks } = await import(pathToFileURL(bundle).href)
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const result = await buildBundledPacks({ root, outDir, appVersion: version })
  if (!result.ok) {
    console.error('build-bundled-packs: the bundled packs are not valid:')
    for (const p of result.problems) console.error(`  ✖ ${p}`)
    return 1
  }
  let total = 0
  for (const p of result.packs) {
    total += p.bytes
    const counts = {}
    for (const i of p.items) counts[i.kind] = (counts[i.kind] ?? 0) + 1
    const what = Object.entries(counts)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ')
    console.log(`  ${p.id}${p.core ? ' (core)' : ''}: ${what}; ${p.files} files, ${kb(p.bytes)}`)
  }
  console.log(`build-bundled-packs: ${result.packs.length} packs, ${kb(total)} → ${outDir}`)
  return 0
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`build-bundled-packs: ${err?.stack ?? err}`)
    process.exit(1)
  },
)
