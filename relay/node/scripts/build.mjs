#!/usr/bin/env node
// Bundles the server into one CommonJS file, dist/server.cjs, for `node dist/server.cjs`, the
// Docker image and the single executable (scripts/build-sea.mjs). Node's own modules stay
// external; everything else (the core, zod, ws, the certificate library) is bundled in.
//   node scripts/build.mjs
import { build } from 'esbuild'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function bundle({ outfile = join(pkg, 'dist', 'server.cjs'), minify = false } = {}) {
  mkdirSync(dirname(outfile), { recursive: true })
  await build({
    entryPoints: [join(pkg, 'src', 'main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile,
    minify,
    sourcemap: false,
    legalComments: 'none',
    banner: { js: '#!/usr/bin/env node' },
    tsconfig: join(pkg, 'tsconfig.json'),
    // The LAN transport it shares lives under src/main; its packages resolve from this package.
    nodePaths: [join(pkg, 'node_modules')],
    logLevel: 'warning',
  })
  chmodSync(outfile, 0o755)
  return outfile
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await bundle()
  console.log(`built ${out}`)
}
