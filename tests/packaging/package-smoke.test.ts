import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { load as loadYaml } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import {
  asarFileList,
  asarLeaks,
  packedNativeLibs,
  foreignBinaries,
  bundledPackProblems,
  EXPECTED_FUSES,
  FUSE_SENTINEL,
  fuseProblems,
  packagedLayout,
  readAsarHeader,
  readFuseWires,
} from '../../scripts/package-smoke.mjs'

/** A fake binary holding v1 fuse wires, e.g. states '01001101'. */
const binaryWith = (...states: string[]) =>
  Buffer.concat(
    states.flatMap((s) => [
      Buffer.from('padding-bytes'),
      Buffer.from(FUSE_SENTINEL, 'ascii'),
      Buffer.from([1, s.length]),
      Buffer.from(s, 'ascii'),
    ]),
  )

// Wire order: runAsNode, cookieEncryption, nodeOptions, nodeCliInspect, asarIntegrity,
// onlyLoadAppFromAsar, browserV8Snapshot, grantFileProtocolExtraPrivileges.
const HARDENED = '01001100'

describe('readFuseWires / fuseProblems', () => {
  it('decodes fuse states by name', () => {
    const [wire] = readFuseWires(binaryWith(HARDENED))
    expect(wire!.version).toBe(1)
    expect(wire!.fuses).toMatchObject({ runAsNode: false, enableCookieEncryption: true })
    expect(fuseProblems(wire!)).toEqual([])
  })
  it('finds both wires of a universal binary and reports mismatches', () => {
    const wires = readFuseWires(binaryWith(HARDENED, '11111111'))
    expect(wires).toHaveLength(2)
    expect(fuseProblems(wires[1]!)).toContain('runAsNode is true, expected false')
  })
  it('requires GrantFileProtocolExtraPrivileges off (#117)', () => {
    const [wire] = readFuseWires(binaryWith('01001101'))
    expect(fuseProblems(wire!)).toEqual([
      'grantFileProtocolExtraPrivileges is true, expected false',
    ])
  })
  it('marks removed fuses and rejects unknown wire versions', () => {
    const [wire] = readFuseWires(binaryWith('r1001101'))
    expect(wire!.fuses.runAsNode).toBe('r')
    expect(fuseProblems({ version: 2, fuses: {} })).toEqual(['unsupported fuse wire version 2'])
  })
  it('expects exactly the fuses electron-builder.yml sets', () => {
    const config = loadYaml(readFileSync(resolve('electron-builder.yml'), 'utf8')) as {
      electronFuses: Record<string, boolean>
    }
    const { resetAdHocDarwinSignature: _reset, ...fuses } = config.electronFuses
    expect(fuses).toEqual(EXPECTED_FUSES)
  })
})

describe('asar contents', () => {
  const header = JSON.stringify({
    files: {
      'package.json': { size: 1 },
      out: { files: { main: { files: { 'index.js': { size: 1 } } } } },
      node_modules: {
        files: {
          a: { files: { 'index.js': { size: 1 }, test: { files: { 'x.js': { size: 1 } } } } },
        },
      },
      src: { files: { 'main.ts': { size: 1 } } },
      templates: { files: { x: { files: { __golden__: { files: { 'd.png': { size: 1 } } } } } } },
    },
  })

  it('lists files and flags sources, goldens and package tests', () => {
    const files = asarFileList(header)
    expect(files).toContain('out/main/index.js')
    expect(asarLeaks(files).sort()).toEqual([
      'node_modules/a/test/x.js',
      'src/main.ts',
      'templates/x/__golden__/d.png',
    ])
  })
  it('flags native libraries left inside the archive, not unpacked ones (#372)', () => {
    const lib = (unpacked: boolean) => ({ size: 1, ...(unpacked ? { unpacked } : {}) })
    const natives = JSON.stringify({
      files: {
        node_modules: {
          files: {
            '@img': {
              files: {
                'sharp-libvips-linux-x64': { files: { 'libvips-cpp.so.8.17.2': lib(false) } },
                'sharp-linux-x64': { files: { 'sharp.node': lib(true), 'index.js': lib(false) } },
              },
            },
          },
        },
      },
    })
    expect(packedNativeLibs(natives)).toEqual([
      'node_modules/@img/sharp-libvips-linux-x64/libvips-cpp.so.8.17.2',
    ])
    expect(packedNativeLibs(header)).toEqual([])
  })
  it('flags binaries for another OS, CPU or libc, and onnxruntime-web (#382)', () => {
    const files = [
      'node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node',
      'node_modules/@napi-rs/canvas-win32-arm64-msvc/skia.win32-arm64-msvc.node',
      'node_modules/@napi-rs/canvas-darwin-arm64/skia.darwin-arm64.node',
      'node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node',
      'node_modules/@img/sharp-libvips-darwin-x64/lib/libvips-cpp.dylib',
      'node_modules/@img/colour/index.cjs',
      'node_modules/sqlite-vec-windows-x64/vec0.dll',
      'node_modules/sqlite-vec-linux-x64/vec0.so',
      'node_modules/better-sqlite3/prebuilds/win32-x64.node',
      'node_modules/better-sqlite3/prebuilds/linux-x64.node',
      'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
    ]
    expect(foreignBinaries(files, 'win32', 'x64')).toEqual([
      'node_modules/@img/sharp-libvips-darwin-x64',
      'node_modules/@napi-rs/canvas-darwin-arm64',
      'node_modules/@napi-rs/canvas-win32-arm64-msvc',
      'node_modules/better-sqlite3/prebuilds/linux-x64',
      'node_modules/onnxruntime-web',
      'node_modules/sqlite-vec-linux-x64',
    ])
  })
  it('treats musl builds as foreign on a glibc Linux target', () => {
    const files = [
      'node_modules/@napi-rs/canvas-linux-x64-gnu/a.node',
      'node_modules/@napi-rs/canvas-linux-x64-musl/a.node',
      'node_modules/@img/sharp-linuxmusl-x64/a.node',
    ]
    expect(foreignBinaries(files, 'linux', 'x64')).toEqual([
      'node_modules/@img/sharp-linuxmusl-x64',
      'node_modules/@napi-rs/canvas-linux-x64-musl',
    ])
  })
  it('reads the JSON header from an asar file', () => {
    const json = Buffer.from(header)
    const pickle = Buffer.alloc(16)
    pickle.writeUInt32LE(4, 0)
    pickle.writeUInt32LE(json.length + 8, 4)
    pickle.writeUInt32LE(json.length + 4, 8)
    pickle.writeUInt32LE(json.length, 12)
    const file = join(mkdtempSync(join(tmpdir(), 'ttx-asar-')), 'header.bin')
    writeFileSync(file, Buffer.concat([pickle, json]))
    expect(readAsarHeader(file)).toBe(header)
  })
})

describe('packagedLayout', () => {
  it('finds the fuse wire in the framework on macOS and in the executable elsewhere', () => {
    const mac = packagedLayout('/r/Action Stations.app', 'darwin')
    expect(mac.executable).toBe('/r/Action Stations.app/Contents/MacOS/Action Stations')
    expect(mac.fuseBinary).toMatch(/Electron Framework\.framework\/Electron Framework$/)
    const linux = packagedLayout('/r/linux-unpacked/actionstations', 'linux')
    expect(linux.fuseBinary).toBe(linux.executable)
    expect(linux.resources).toBe('/r/linux-unpacked/resources')
  })
})

describe('bundledPackProblems (ADR-0020)', () => {
  const resources = (packs: string[], extra: string[] = []) => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-res-'))
    const root = join(dir, 'app-resources')
    mkdirSync(join(root, 'packs'), { recursive: true })
    writeFileSync(
      join(root, 'packs', 'index.json'),
      JSON.stringify({ packs: packs.map((id) => ({ id })) }),
    )
    for (const id of packs) {
      mkdirSync(join(root, 'packs', id))
      writeFileSync(join(root, 'packs', id, 'pack.json'), '{}')
    }
    for (const old of extra) mkdirSync(join(root, old), { recursive: true })
    return dir
  }
  it('passes app-resources/packs with the core pack and no per-kind folders', () => {
    expect(bundledPackProblems(resources(['ai.actionstations.core']))).toEqual([])
  })
  it('flags a missing core pack and the old per-kind folders', () => {
    expect(bundledPackProblems(resources(['ai.actionstations.airport'], ['prompts']))).toEqual([
      'the core pack is not bundled',
      'app-resources/prompts still ships',
    ])
  })
})
