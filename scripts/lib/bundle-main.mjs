// Bundle a TypeScript entry under src/main for plain Node (the pattern of
// scripts/pack-validate.mjs): `@shared`/`@main` aliases, `electron` stubbed, npm packages
// external, rebuilt into node_modules/.cache/<name>/ whenever a source is newer.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function newestSource() {
  let newest = 0
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name)
      if (d.isDirectory()) walk(p)
      else if (/\.(ts|mjs|json)$/.test(d.name)) newest = Math.max(newest, statSync(p).mtimeMs)
    }
  }
  for (const dir of ['src/main', 'src/shared', 'packs/domains', 'scripts/lib'])
    walk(join(root, dir))
  return Math.max(newest, statSync(join(root, 'packs', 'bundled.json')).mtimeMs)
}

/** Import the bundled module for `entry` (a path relative to the repo root). */
export async function importMain(name, entry) {
  const outDir = join(root, 'node_modules', '.cache', name)
  const bundle = join(outDir, 'entry.mjs')
  if (!existsSync(bundle) || statSync(bundle).mtimeMs < newestSource()) {
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
        ssr: join(root, entry),
        outDir,
        emptyOutDir: true,
        target: 'node20',
        minify: false,
        rollupOptions: { output: { format: 'es', entryFileNames: 'entry.mjs' } },
      },
    })
  }
  // The reader finds the shipped prompts, templates, workflows and examples here.
  process.env.TTX_RESOURCES = root
  return import(pathToFileURL(bundle).href)
}

/** Run `run(argv, { root, appVersion }, io)` from a bundled entry and exit with its code. */
export async function runMain(name, entry, exportName) {
  const { readFileSync } = await import('node:fs')
  const mod = await importMain(name, entry)
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const io = { out: (l) => console.log(l), err: (l) => console.error(l) }
  try {
    process.exit(await mod[exportName](process.argv.slice(2), { root, appVersion: version }, io))
  } catch (err) {
    console.error(`${name}: ${err?.stack ?? err}`)
    process.exit(1)
  }
}
