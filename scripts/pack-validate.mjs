#!/usr/bin/env node
// Pack validator for pack authors and the site build (#259, docs/packs-format.md § Publishing).
//
//   node scripts/pack-validate.mjs <file.aspack>... [--app-version <version>]
//   node scripts/pack-validate.mjs <file.aspack>... --catalog-entry --url <base-url> [--updated <iso>]
//   node scripts/pack-validate.mjs --catalog <index.json>
//
// It runs the app's own reader (src/main/packs/), not a copy of its rules. The reader is
// TypeScript with `@shared` aliases and an `electron` import, so on first use (and whenever a
// source file under src/ is newer) this script bundles src/main/packs/cli.ts with Vite, a
// devDependency already installed by `pnpm install`, into node_modules/.cache/pack-validate/,
// with `electron` replaced by a stub. npm packages stay external and load from node_modules.
// Works from a fresh checkout after `pnpm install`; plain Node 20+, no Electron.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'node_modules', '.cache', 'pack-validate')
const bundle = join(outDir, 'cli.mjs')
const entry = join(root, 'src', 'main', 'packs', 'cli.ts')

/** Newest modification time of the sources the bundle is built from. */
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
  walk(join(root, 'scripts', 'pack-validate'))
  // The bundled-pack map and domain profiles are compiled in (ADR-0020).
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
      outDir,
      emptyOutDir: true,
      target: 'node20',
      minify: false,
      rollupOptions: { output: { format: 'es', entryFileNames: 'cli.mjs' } },
    },
  })
}

async function main() {
  if (!existsSync(bundle) || statSync(bundle).mtimeMs < newestSource()) await buildBundle()
  // The reader finds the shipped prompts, templates, workflows and examples here.
  process.env.TTX_RESOURCES = root
  const { runCli } = await import(pathToFileURL(bundle).href)
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const io = { out: (l) => console.log(l), err: (l) => console.error(l) }
  return runCli(process.argv.slice(2), { appVersion: version }, io)
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`pack-validate: ${err?.stack ?? err}`)
    process.exit(1)
  },
)
