// Fixed inputs of the benchmark (#434, FR-4, FR-6 to FR-8): the suite files, the shipped
// examples (their build spec, manifest and hand-corrected scenarios) and the defect files.
// Pure reads of the repository; no app.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

function safeName(name, what) {
  if (!SAFE_NAME.test(name ?? '')) throw new Error(`${what} "${name}" is not a plain name`)
  return name
}

/** bench/suites/<name>.json with the fields the runner relies on checked. */
export function loadSuite(name, root = ROOT) {
  const suite = readJson(join(root, 'bench', 'suites', `${safeName(name, 'suite')}.json`))
  for (const key of ['suite', 'suiteVersion', 'weights', 'thresholds', 'seeds'])
    if (suite[key] === undefined) throw new Error(`suite ${name}: missing "${key}"`)
  for (const task of ['ideation', 'drafting', 'critique'])
    if (!Array.isArray(suite[task])) throw new Error(`suite ${name}: "${task}" must be a list`)
  return suite
}

/** The example's build spec and manifest. */
export function loadExample(id, root = ROOT) {
  const dir = join(root, 'examples', safeName(id, 'example'))
  return {
    id,
    dir,
    build: readJson(join(dir, 'build.json')),
    manifest: readJson(join(dir, 'example.json')),
  }
}

/** The shipped scenario id of a build-spec key (build.json and example.json list them in order). */
export function scenarioIdFor(example, key) {
  const i = example.build.scenarios.findIndex((s) => s.key === key)
  const id = example.manifest.scenarios[i]?.id
  if (i < 0 || !id) throw new Error(`${example.id}: no scenario "${key}"`)
  return id
}

export function shippedScenario(example, key) {
  return readJson(
    join(example.dir, 'project', 'scenarios', scenarioIdFor(example, key), 'scenario.json'),
  )
}

const BRIEF_KEYS = [
  'userPrompt',
  'audience',
  'durationHours',
  'phaseCount',
  'learningObjectives',
  'constraints',
  'startWallClock',
  'threatFamily',
]

/**
 * The drafting brief for a build-spec scenario: its own fields, and for a hand-authored entry
 * (no userPrompt) the brief stored with the shipped scenario.
 */
export function caseBrief(example, key) {
  const entry = example.build.scenarios.find((s) => s.key === key)
  if (!entry) throw new Error(`${example.id}: no scenario "${key}"`)
  const source = entry.userPrompt ? entry : shippedScenario(example, key).brief
  const brief = {}
  for (const k of BRIEF_KEYS) if (source[k] !== undefined) brief[k] = source[k]
  if (!brief.threatFamily && entry.threatFamily) brief.threatFamily = entry.threatFamily
  return {
    durationHours: 4,
    phaseCount: 4,
    learningObjectives: [],
    constraints: [],
    audience: [],
    ...brief,
  }
}

export function loadDefects(name, root = ROOT) {
  return readJson(join(root, 'bench', 'defects', `${safeName(name, 'defects file')}.json`))
}

function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
}

/** sha256 over the example's source documents (names and bytes), so runs record their corpus. */
export function corpusHash(example) {
  const docs = join(example.dir, 'project', 'documents')
  const h = createHash('sha256')
  for (const file of walk(docs)) {
    h.update(relative(docs, file).split('\\').join('/'))
    h.update(readFileSync(file))
  }
  return h.digest('hex').slice(0, 16)
}

export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

/** "darwin-arm64-64gb": coarse, never a hostname. */
export const machineSlug = (hw) => slug(`${hw.platform}-${hw.arch}-${hw.ramGb}gb`)

/** <date>-<model-slug>-<machine-slug>.json (FR-18). */
export const runFileName = (startedAt, modelRef, hw) =>
  `${startedAt.slice(0, 10)}-${slug(modelRef)}-${machineSlug(hw)}.json`
