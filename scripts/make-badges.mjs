#!/usr/bin/env node
// Writes README badges as shields-style flat SVGs into docs/badges/, offline (#317).
// The repository is private, so shields.io cannot read it; these files are committed and the
// README links them by relative path. scripts/local-ci.sh runs this as its last step, only
// after every other step passed, and passes the unit-test log so the count is not re-run.
//
//   node scripts/make-badges.mjs [--unit-log FILE] [--e2e-tests N] [--e2e-files N] [--date YYYY-MM-DD] [--out DIR]
//
// Determinism: the "local CI" badge carries the date of the last green run that changed any
// other badge value. When every value matches docs/badges/badges.json the old date is kept and
// the files are rewritten byte-for-byte, so a green run that changes nothing leaves the tree
// clean. Without --unit-log the previous unit-test count is kept.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Colors chosen so white text passes WCAG AA (4.5:1) on every value color and the label grey.
export const COLORS = {
  label: '#555555',
  green: '#2e7d32',
  blue: '#1565c0',
  orange: '#b4540a',
  grey: '#4a5568',
}

// Advance widths of Verdana at 11px (units/2048 × 11), the font shields uses. Unknown
// characters count as 7px; textLength in the SVG keeps rendering inside the computed box.
// prettier-ignore
const WIDTHS = {
  ' ': 3.87, '.': 4.0, ',': 4.0, ':': 4.83, '-': 4.62, '+': 9.22, '·': 4.0, '|': 5.71,
  '/': 4.93, '(': 5.7, ')': 5.7, a: 6.6, b: 6.83, c: 5.73, d: 6.83, e: 6.55, f: 3.87, g: 6.83,
  h: 6.98, i: 3.02, j: 3.65, k: 6.41, l: 3.02, m: 10.73, n: 6.98, o: 6.69, p: 6.83, q: 6.83,
  r: 4.69, s: 5.73, t: 4.33, u: 6.98, v: 6.41, w: 9.02, x: 6.41, y: 6.41, z: 5.81, A: 7.52,
  B: 7.55, C: 7.68, D: 8.47, E: 6.95, F: 6.33, G: 8.52, H: 8.27, I: 5.12, J: 5.25, K: 7.58,
  L: 6.15, M: 9.32, N: 8.25, O: 8.67, P: 6.68, Q: 8.67, R: 7.66, S: 7.52, T: 6.77, U: 8.07,
  V: 7.52, W: 10.88, X: 7.55, Y: 6.76, Z: 7.54,
}
for (let d = 0; d <= 9; d++) WIDTHS[String(d)] = 6.99

/** Rendered width of `text` in Verdana 11px, rounded to one decimal. */
export function textWidth(text) {
  let w = 0
  for (const ch of text) w += WIDTHS[ch] ?? 7
  return Math.round(w * 10) / 10
}

/** XML-escape text for element content and attribute values. */
export function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function textPair(text, centerX, width) {
  const x = Math.round(centerX * 10)
  const len = Math.round(width * 10)
  const t = escapeXml(text)
  return (
    `<text aria-hidden="true" x="${x}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${len}">${t}</text>` +
    `<text x="${x}" y="140" transform="scale(.1)" fill="#fff" textLength="${len}">${t}</text>`
  )
}

/** A shields "flat" style badge: grey label on the left, colored message on the right. */
export function renderBadge({ label, message, color }) {
  const lw = Math.round(textWidth(label) + 10)
  const mw = Math.round(textWidth(message) + 10)
  const w = lw + mw
  const title = escapeXml(`${label}: ${message}`)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${title}">` +
    `<title>${title}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="${COLORS.label}"/>` +
    `<rect x="${lw}" width="${mw}" height="20" fill="${color}"/>` +
    `<rect width="${w}" height="20" fill="url(#s)"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">` +
    textPair(label, lw / 2, textWidth(label)) +
    textPair(message, lw + mw / 2, textWidth(message)) +
    `</g></svg>\n`
  )
}

/** Passed-test count from Vitest's summary line ("Tests  2271 passed | 25 skipped"). */
export function parseVitestPassed(log) {
  // eslint-disable-next-line no-control-regex
  const plain = log.replace(/\x1b\[[0-9;]*m/g, '')
  const m = plain.match(/^\s*Tests\s+(\d+) passed/m)
  return m ? Number(m[1]) : null
}

/** Test and file counts from `playwright test --list` ("Total: 71 tests in 37 files"). */
export function parsePlaywrightList(out) {
  const m = out.match(/Total:\s+(\d+) tests? in (\d+) files?/)
  return m ? { tests: Number(m[1]), files: Number(m[2]) } : null
}

/** "PolyForm Internal Use 1.0.0" from LICENSE.md's heading, plus "+ education" when present. */
export function licenseName(licenseMd, hasEducation) {
  const heading = (licenseMd.match(/^#\s+(.+)$/m)?.[1] ?? 'see LICENSE.md').trim()
  const name = heading.replace(/\s+License(?=\s|$)/, '')
  return hasEducation ? `${name} + education` : name
}

/** Desktop platforms from electron-builder.yml's top-level mac/win/linux sections. */
export function platformsFrom(builderYml) {
  const names = []
  if (/^mac:/m.test(builderYml)) names.push('macOS')
  if (/^win:/m.test(builderYml)) names.push('Windows')
  if (/^linux:/m.test(builderYml)) names.push('Linux')
  return names.join(' | ')
}

/**
 * The badge values (everything but the CI date). `facts` holds what was measured:
 * { unitTests, e2eTests, e2eFiles, version, license, electron, platforms }.
 */
export function badgeValues(facts) {
  return {
    'unit-tests': `${facts.unitTests} passed`,
    e2e: `${facts.e2eTests} tests in ${facts.e2eFiles} specs`,
    version: facts.version,
    license: facts.license,
    electron: facts.electron,
    platforms: facts.platforms,
    telemetry: 'none',
    'local-first': 'yes',
  }
}

const SPECS = {
  'unit-tests': { label: 'unit tests', color: COLORS.green },
  e2e: { label: 'e2e', color: COLORS.green },
  version: { label: 'version', color: COLORS.blue },
  license: { label: 'license', color: COLORS.orange },
  electron: { label: 'Electron', color: COLORS.blue },
  platforms: { label: 'platforms', color: COLORS.grey },
  telemetry: { label: 'telemetry', color: COLORS.green },
  'local-first': { label: 'local-first', color: COLORS.green },
}

function sameValues(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Decides the CI date and returns every file to write: { 'ci.svg': svg, ..., 'badges.json': json }.
 * `previous` is the parsed old badges.json (or null). The date only moves when a value changed.
 */
export function buildBadgeFiles(values, previous, today) {
  const date = previous && sameValues(previous.values, values) ? previous.ciDate : today
  const files = {
    'ci.svg': renderBadge({ label: 'local CI', message: `passing · ${date}`, color: COLORS.green }),
  }
  for (const [key, message] of Object.entries(values)) {
    files[`${key}.svg`] = renderBadge({ ...SPECS[key], message })
  }
  files['badges.json'] = JSON.stringify({ ciDate: date, values }, null, 2) + '\n'
  return files
}

/** Writes only files whose content changed; returns the names written. */
export function writeChanged(outDir, files) {
  mkdirSync(outDir, { recursive: true })
  const written = []
  for (const [name, content] of Object.entries(files)) {
    const path = join(outDir, name)
    if (existsSync(path) && readFileSync(path, 'utf8') === content) continue
    writeFileSync(path, content)
    written.push(name)
  }
  return written
}

function localDate() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined)
      throw new Error(`bad argument ${argv[i]}`)
    args[key] = argv[i + 1]
  }
  return args
}

function listE2e() {
  const bin = join(ROOT, 'node_modules', '.bin', 'playwright')
  const out = execFileSync(bin, ['test', '--list'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const counts = parsePlaywrightList(out)
  if (!counts) throw new Error('could not read the e2e count from playwright test --list')
  return counts
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const outDir = resolve(ROOT, args.out ?? 'docs/badges')
  const previous = readJson(join(outDir, 'badges.json'))
  const pkg = readJson(join(ROOT, 'package.json'))

  let unitTests = args['unit-log']
    ? parseVitestPassed(readFileSync(args['unit-log'], 'utf8'))
    : null
  if (unitTests === null) unitTests = Number(previous?.values?.['unit-tests']?.split(' ')[0])
  if (!Number.isFinite(unitTests)) throw new Error('no unit-test count: pass --unit-log FILE')

  const e2e =
    args['e2e-tests'] && args['e2e-files']
      ? { tests: Number(args['e2e-tests']), files: Number(args['e2e-files']) }
      : listE2e()

  const values = badgeValues({
    unitTests,
    e2eTests: e2e.tests,
    e2eFiles: e2e.files,
    version: pkg.version,
    license: licenseName(
      readFileSync(join(ROOT, 'LICENSE.md'), 'utf8'),
      existsSync(join(ROOT, 'LICENSE-EDUCATION.md')),
    ),
    electron: String(pkg.devDependencies?.electron ?? pkg.dependencies?.electron).replace(
      /^[\^~]/,
      '',
    ),
    platforms: platformsFrom(readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8')),
  })
  const files = buildBadgeFiles(values, previous, args.date ?? localDate())
  const written = writeChanged(outDir, files)
  console.log(written.length ? `badges updated: ${written.join(', ')}` : 'badges unchanged')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
