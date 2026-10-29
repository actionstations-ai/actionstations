#!/usr/bin/env node
// Builds the single executable for this machine's platform with Node's single executable
// application tooling (spec 0409 FR-9b): bundle → SEA blob (with the player page embedded as
// assets) → a copy of the running Node binary with the blob injected by postject.
//   node scripts/build-sea.mjs [--out DIR]
// Run it on Linux x64 for actionstations-relay-linux-x64 and on Windows x64 for
// actionstations-relay-win-x64.exe (the release workflow does both on GitHub-hosted runners).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from './build.mjs'

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outArg = process.argv.indexOf('--out')
const outDir = outArg >= 0 ? resolve(process.argv[outArg + 1]) : join(pkg, 'dist')
const SENTINEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

function listFiles(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

mkdirSync(outDir, { recursive: true })
const main = await bundle({ outfile: join(outDir, 'server.cjs') })

// The player page (or the placeholder) travels inside the executable.
const publicDir = join(pkg, 'public')
const files = existsSync(publicDir) ? listFiles(publicDir) : []
const assets = { 'public-files.json': join(outDir, 'public-files.json') }
writeFileSync(assets['public-files.json'], JSON.stringify(files))
for (const f of files) assets[`public/${f}`] = join(publicDir, f)

const seaConfig = {
  main,
  output: join(outDir, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  assets,
}
writeFileSync(join(outDir, 'sea-config.json'), JSON.stringify(seaConfig, null, 2))
execFileSync(process.execPath, ['--experimental-sea-config', join(outDir, 'sea-config.json')], {
  stdio: 'inherit',
})

const platform =
  { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform] ?? process.platform
const binary = join(
  outDir,
  `actionstations-relay-${platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`,
)
// A copy of node is read-only, so a second build must remove it first.
rmSync(binary, { force: true })
copyFileSync(process.execPath, binary)
chmodSync(binary, 0o755)
if (process.platform === 'darwin')
  execFileSync('codesign', ['--remove-signature', binary], { stdio: 'inherit' })
const postject = join(pkg, 'node_modules', 'postject', 'dist', 'cli.js')
const args = [postject, binary, 'NODE_SEA_BLOB', seaConfig.output, '--sentinel-fuse', SENTINEL]
if (process.platform === 'darwin') args.push('--macho-segment-name', 'NODE_SEA')
execFileSync(process.execPath, args, { stdio: 'inherit' })
if (process.platform === 'darwin')
  execFileSync('codesign', ['--sign', '-', binary], { stdio: 'inherit' })

const sha = createHash('sha256').update(readFileSync(binary)).digest('hex')
writeFileSync(`${binary}.sha256`, `${sha}  ${relative(outDir, binary)}\n`)
console.log(`built ${binary}\nsha256 ${sha}`)
