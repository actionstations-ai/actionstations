#!/usr/bin/env node
// Verifies a packaged build (docs/RELEASING.md):
//   1. static checks: fuse wire in the Electron binary, asar integrity in Info.plist (mac),
//      and app.asar contents (only out/ + production node_modules; no sources, fixtures,
//      reference material or test goldens);
//   2. runs e2e/packaged.spec.ts against the packaged executable (ingest incl. OCR and
//      sqlite-vec, template rendering vs goldens, ttx-media, runtime fuse probes).
// Usage:
//   node scripts/package-smoke.mjs                 # release/<version>/<platform dir>
//   node scripts/package-smoke.mjs --app <path>    # a .app bundle or an executable
//   node scripts/package-smoke.mjs --dmg <path>    # mount a .dmg read-only and test from it
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, openSync, readFileSync, readSync, closeSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const FUSE_SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
/** Fuse wire v1 order (@electron/fuses FuseV1Options). */
export const FUSE_NAMES = [
  'runAsNode',
  'enableCookieEncryption',
  'enableNodeOptionsEnvironmentVariable',
  'enableNodeCliInspectArguments',
  'enableEmbeddedAsarIntegrityValidation',
  'onlyLoadAppFromAsar',
  'loadBrowserProcessSpecificV8Snapshot',
  'grantFileProtocolExtraPrivileges',
]
/** Must match electronFuses in electron-builder.yml (#55). */
export const EXPECTED_FUSES = {
  runAsNode: false,
  enableCookieEncryption: true,
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  enableEmbeddedAsarIntegrityValidation: true,
  onlyLoadAppFromAsar: true,
  // The renderer is served from app://bundle/ (#117, ADR-0013).
  grantFileProtocolExtraPrivileges: false,
}
/** Top-level app.asar entries a release may contain. */
export const ALLOWED_ASAR_ROOTS = ['out', 'node_modules', 'package.json']
const FORBIDDEN_IN_ASAR = [
  /(^|\/)__golden__\//,
  /^node_modules\/[^/]+\/(test|tests|fixtures)\//,
  // Only the app's own build output: the bundled packs ship beside app.asar, in
  // app-resources/packs (ADR-0020), and other tools write to out/ too (#392).
  /^out\/(?!(main|preload|renderer)\/)/,
]

/** Every fuse wire in an Electron binary (universal mac binaries hold two). */
export function readFuseWires(binary) {
  const wires = []
  const sentinel = Buffer.from(FUSE_SENTINEL, 'ascii')
  for (let at = binary.indexOf(sentinel); at !== -1; at = binary.indexOf(sentinel, at + 1)) {
    const pos = at + sentinel.length
    const version = binary[pos]
    const length = binary[pos + 1]
    const fuses = {}
    for (let i = 0; i < length; i++) {
      const state = String.fromCharCode(binary[pos + 2 + i])
      fuses[FUSE_NAMES[i] ?? `fuse${i}`] = state === '1' ? true : state === '0' ? false : state
    }
    wires.push({ version, fuses })
  }
  return wires
}

/** Human-readable mismatches between a fuse wire and EXPECTED_FUSES. */
export function fuseProblems(wire, expected = EXPECTED_FUSES) {
  if (wire.version !== 1) return [`unsupported fuse wire version ${wire.version}`]
  return Object.entries(expected)
    .filter(([name, want]) => wire.fuses[name] !== want)
    .map(([name, want]) => `${name} is ${wire.fuses[name]}, expected ${want}`)
}

/** File paths (relative, POSIX) packed into an asar archive, from its JSON header. */
export function asarFileList(headerJson) {
  const out = []
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const path = prefix ? `${prefix}/${name}` : name
      if (child.files) walk(child, path)
      else out.push(path)
    }
  }
  walk(JSON.parse(headerJson), '')
  return out
}

/** Entries that must not ship: anything outside out/ + node_modules, goldens, fixtures. */
export function asarLeaks(files) {
  return files.filter(
    (f) =>
      !ALLOWED_ASAR_ROOTS.includes(f.split('/')[0]) || FORBIDDEN_IN_ASAR.some((re) => re.test(f)),
  )
}

const NATIVE_LIB_RE = /\.(node|dll|dylib|so(\.\d+)*)$/

/**
 * Native libraries packed inside app.asar instead of app.asar.unpacked: the OS loader cannot
 * open them there, so the module that needs them fails at runtime (#372, sharp's libvips).
 */
export function packedNativeLibs(headerJson) {
  const out = []
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const path = prefix ? `${prefix}/${name}` : name
      if (child.files) walk(child, path)
      else if (!child.unpacked && NATIVE_LIB_RE.test(name)) out.push(path)
    }
  }
  walk(JSON.parse(headerJson), '')
  return out
}

const NATIVE_PACKAGE_RE =
  /^node_modules\/(?:@napi-rs\/canvas-|@img\/sharp-(?:libvips-)?|sqlite-vec-|better-sqlite3\/prebuilds\/)([a-z0-9]+)-([a-z0-9]+)([^/]*)/
const OS_ALIASES = { windows: 'win32' }
/** onnxruntime-node's GPU execution providers: the app runs the CPU provider only (#401). */
const GPU_PROVIDER_RE =
  /^node_modules\/onnxruntime-node\/bin\/.*onnxruntime_providers_(cuda|tensorrt)\./

/**
 * Native binaries in the archive (packed or unpacked) built for another OS, CPU or libc than the
 * target, and packages and libraries the app never loads (#382; onnxruntime's CUDA and TensorRT
 * providers, which its install script downloads on a Linux x64 host, #401). A cross-build installs every platform's
 * native packages; electron-builder.yml keeps only the target's, and this check holds it to that.
 */
export function foreignBinaries(files, platform = process.platform, arch = process.arch) {
  const found = new Set()
  for (const f of files) {
    if (f.startsWith('node_modules/onnxruntime-web/')) {
      found.add('node_modules/onnxruntime-web')
      continue
    }
    if (GPU_PROVIDER_RE.test(f)) {
      found.add(f)
      continue
    }
    const m = NATIVE_PACKAGE_RE.exec(f)
    if (!m) continue
    const os = OS_ALIASES[m[1]] ?? m[1]
    if (os !== platform || m[2] !== arch || m[3].includes('musl'))
      found.add(m[0].replace(/\.node$/, ''))
  }
  return [...found].sort()
}

/** Read the JSON header of an asar archive (Chromium pickle framing). */
export function readAsarHeader(asarPath) {
  const fd = openSync(asarPath, 'r')
  try {
    const sizes = Buffer.alloc(16)
    readSync(fd, sizes, 0, 16, 0)
    const jsonLength = sizes.readUInt32LE(12)
    const json = Buffer.alloc(jsonLength)
    readSync(fd, json, 0, jsonLength, 16)
    return json.toString('utf8')
  } finally {
    closeSync(fd)
  }
}

/** Executable, fuse-bearing binary and resources dir for a packaged app on `platform`. */
export function packagedLayout(appPath, platform = process.platform) {
  if (platform === 'darwin') {
    const name = basename(appPath, '.app')
    return {
      executable: join(appPath, 'Contents', 'MacOS', name),
      fuseBinary: join(
        appPath,
        'Contents/Frameworks/Electron Framework.framework/Electron Framework',
      ),
      resources: join(appPath, 'Contents', 'Resources'),
      infoPlist: join(appPath, 'Contents', 'Info.plist'),
    }
  }
  return {
    executable: appPath,
    fuseBinary: appPath,
    resources: join(dirname(appPath), 'resources'),
  }
}

function defaultAppPath() {
  const { version, productName } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const release = join(ROOT, 'release', version)
  const arch = process.arch
  if (process.platform === 'darwin')
    return join(release, arch === 'arm64' ? 'mac-arm64' : 'mac', `${productName}.app`)
  if (process.platform === 'win32') return join(release, 'win-unpacked', `${productName}.exe`)
  return join(release, 'linux-unpacked', 'actionstations')
}

function mountDmg(dmg) {
  const mountpoint = mkdtempSync(join(tmpdir(), 'ttx-dmg-'))
  execFileSync('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mountpoint, dmg])
  const app = readdirSync(mountpoint).find((f) => f.endsWith('.app'))
  if (!app) throw new Error(`No .app inside ${dmg}`)
  return {
    appPath: join(mountpoint, app),
    detach: () => execFileSync('hdiutil', ['detach', mountpoint]),
  }
}

/** PIDs still running from `executable`; SIGKILLs them so no run leaves the app open. */
export function killLeftovers(executable) {
  if (process.platform === 'win32') return []
  const r = spawnSync('pgrep', ['-f', '--', executable], { encoding: 'utf8' })
  // Never this script or its parent (`--app <executable>` puts the path on our command line).
  const self = [String(process.pid), String(process.ppid)]
  const pids = (r.stdout ?? '').split('\n').filter((pid) => pid && !self.includes(pid))
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL')
    } catch {
      // already gone
    }
  }
  return pids
}

/** The bundled packs (ADR-0020) are in app-resources/packs; the old per-kind folders are gone. */
export function bundledPackProblems(resources) {
  const root = join(resources, 'app-resources')
  const problems = []
  const indexPath = join(root, 'packs', 'index.json')
  if (!existsSync(indexPath)) return [`${indexPath} is missing (scripts/build-bundled-packs.mjs)`]
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  const ids = index.packs.map((p) => p.id)
  if (!ids.includes('ai.actionstations.core')) problems.push('the core pack is not bundled')
  for (const id of ids)
    if (!existsSync(join(root, 'packs', id, 'pack.json')))
      problems.push(`${id}/pack.json is missing`)
  for (const old of ['templates/injects', 'prompts', 'comfy', 'examples'])
    if (existsSync(join(root, old))) problems.push(`app-resources/${old} still ships`)
  console.log(`bundled packs: ${ids.length} (${ids.join(', ')})`)
  return problems
}

function staticChecks(layout) {
  const problems = [...bundledPackProblems(layout.resources)]
  const wires = readFuseWires(readFileSync(layout.fuseBinary))
  if (wires.length === 0) problems.push('no fuse wire found in the Electron binary')
  for (const wire of wires) problems.push(...fuseProblems(wire))
  if (layout.infoPlist && !readFileSync(layout.infoPlist, 'utf8').includes('ElectronAsarIntegrity'))
    problems.push('Info.plist has no ElectronAsarIntegrity entry')
  const asar = join(layout.resources, 'app.asar')
  const header = readAsarHeader(asar)
  const files = asarFileList(header)
  const leaks = asarLeaks(files)
  if (leaks.length)
    problems.push(`app.asar holds files that must not ship: ${leaks.slice(0, 8).join(', ')}`)
  const foreign = foreignBinaries(files)
  if (foreign.length)
    problems.push(`app.asar ships binaries for other platforms: ${foreign.slice(0, 8).join(', ')}`)
  const natives = packedNativeLibs(header)
  if (natives.length)
    problems.push(
      `native libraries packed inside app.asar (add to asarUnpack): ${natives.slice(0, 8).join(', ')}`,
    )
  const mb = (p) => (statSync(p).size / 1e6).toFixed(1)
  console.log(`fuse wires: ${wires.length}; app.asar: ${files.length} files, ${mb(asar)} MB`)
  return problems
}

function main() {
  const args = process.argv.slice(2)
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const dmg = flag('--dmg')
  const mounted = dmg ? mountDmg(resolve(dmg)) : undefined
  const appPath = mounted?.appPath ?? resolve(flag('--app') ?? defaultAppPath())
  try {
    if (!existsSync(appPath)) throw new Error(`Packaged app not found: ${appPath} (run pnpm build)`)
    const layout = packagedLayout(appPath)
    console.log(`packaged app: ${appPath}`)
    const problems = staticChecks(layout)
    if (problems.length) throw new Error(`static checks failed:\n  ${problems.join('\n  ')}`)
    console.log('static checks passed (fuses, asar integrity, asar contents, bundled packs)')
    const started = Date.now()
    // Playwright's CLI through this Node: `pnpm` is pnpm.cmd on Windows, which spawnSync cannot
    // start without a shell.
    const cli = join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js')
    const run = spawnSync(process.execPath, [cli, 'test', 'e2e/packaged.spec.ts'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, TTX_PACKAGED_APP: layout.executable },
    })
    console.log(`packaged e2e: ${((Date.now() - started) / 1000).toFixed(1)} s`)
    const leftover = killLeftovers(layout.executable)
    if (leftover.length)
      throw new Error(`packaged app still running after the e2e (killed): pids ${leftover}`)
    if (run.status !== 0) throw new Error('packaged e2e failed')
  } finally {
    if (appPath) killLeftovers(packagedLayout(appPath).executable)
    mounted?.detach()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main()
  } catch (err) {
    console.error(`✖ ${err.message}`)
    process.exit(1)
  }
}
