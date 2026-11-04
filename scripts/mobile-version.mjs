#!/usr/bin/env node
// The player apps' version (spec 0446): the marketing version is the desktop release version
// from package.json, and the build number is derived from it (major·10000 + minor·100 + patch),
// so every release has a higher build number without a counter to keep.
// Usage: node scripts/mobile-version.mjs            → "0.7.0 700"
//        node scripts/mobile-version.mjs --shell    → APP_VERSION=… APP_BUILD=… (for eval)
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
if (!m || Number(m[2]) > 99 || Number(m[3]) > 99) {
  console.error(`package.json version ${version} is not X.Y.Z with Y and Z under 100`)
  process.exit(1)
}
const build = Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])
if (process.argv.includes('--shell')) console.log(`APP_VERSION=${version}\nAPP_BUILD=${build}`)
else console.log(`${version} ${build}`)
