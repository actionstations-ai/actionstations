#!/usr/bin/env node
// Builds a bundled example project (examples/<id>/, the example contract of #169, #157, #158)
// from a build spec by driving the built app headless against the local provider stack, then
// strips and trims the generated project folder for git.
//
//   node scripts/make-example.mjs generate --spec examples/<id>/build.json --out .tmp/examples-release/<id> [--only key,…] [--replace]
//   node scripts/make-example.mjs repair   --spec examples/<id>/build.json --out .tmp/examples-release/<id> [--only key,…]
//   node scripts/make-example.mjs export   --spec examples/<id>/build.json --out .tmp/examples-release/<id> [--only key,…]
//   node scripts/make-example.mjs refresh  --spec examples/<id>/build.json --out .tmp/examples-release/<id> [--only key,…] [--voices]
//   node scripts/make-example.mjs package  --spec examples/<id>/build.json --out .tmp/examples-release/<id>
//   node scripts/make-example.mjs verify   --spec examples/<id>/build.json
//
// export: the PDF set, the DOCX documents and the distribution ZIP of every scenario again,
//   into <out>/exports/<key>/ (repair and generate export too).
// generate: creates (or reopens) <out>/project, imports the spec's documents, routes every
//   task to the local providers (LM Studio text, ComfyUI images, mlx-audio TTS), generates one
//   scenario per spec entry, or loads a hand-authored one (entry.seed) (scenario → injects → template media for every inject, a bounded
//   number of AI stills and voice clips), exports the PDF set and a ZIP per scenario to
//   <out>/exports/<key>/ and writes review material (summary, scenario, injects, documents)
//   to <out>/review/<key>/. <out>/state.json maps scenario keys to ids so a key can be
//   regenerated alone (--only key --replace). Needs `pnpm build:app` first.
// repair: fixes the generated scenarios in place with generate:repair (#185) instead of
//   regenerating them: MSEL repairs and the revision pass for flagged rows only, injects and
//   media for what changed, up to media.aiImagesPerScenario AI stills. Writes
//   <out>/review/<key>/repair.json (warning counts per code before/after, the job summary, and
//   how many scenario files changed, were added, removed or stayed byte-identical), refreshes
//   the review material and exports the PDF set and ZIP again.
// refresh: after hand edits to <out>'s scenario and inject JSON (fixes made in place, #220),
//   with no model reachable: seeds the spec's documents that differ (overview, hot wash,
//   handouts), records each edited scenario and inject as a user save, re-renders the template
//   media of every inject whose content differs from the packaged example, then, for a
//   generated scenario, runs generate:repair with no AI stills so the stored warnings are
//   recomputed (fails when the repair would have to rewrite a row or an inject with a model:
//   fix that by hand first); for a hand-authored (seed) scenario it drops the content warnings
//   of the injects corrected by hand instead, since the repair would rewrite authored rows.
//   --voices: re-voices the edited injects that carry a voice clip with the local TTS
//   (mlx-audio); every other task stays routed offline.
// Names: documents, seed scenarios and seed documents pass through examples/simulated-names.json
//   (scripts/simulate-names.mjs) on the way in, so released examples carry simulated names
//   while reference/ keeps the source material (#283).
// package: copies <out>/project to examples/<id>/project without index.sqlite*, .cache, job
//   or log files, provider ids and absolute paths, keeps one short voice clip per example (as
//   MP3), the most useful rendered PNGs and at most two AI stills per scenario within the git
//   media budget (6 MB, the clip included), drops the other audio, video and PDFs from the
//   project (the full set stays in <out>), and writes examples/<id>/example.json.
// verify: copies examples/<id>/project to a temp folder, opens it in the built app, rebuilds
//   the index and checks that every scenario, inject and kept asset loads, and that no
//   scenario carries a lint warning other than CRITIQUE notes: stored ones, and for a
//   generated scenario the recomputed lints too (the generator's inject-mix and coverage rules
//   do not apply to a hand-authored MSEL).
import { _electron as electron } from '@playwright/test'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import pngjs from 'pngjs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInThisContext } from 'node:vm'
import wavefile from 'wavefile'
import { simulateNames } from './simulate-names.mjs'

const { PNG } = pngjs
const { WaveFile } = wavefile
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MEDIA_BUDGET_BYTES = 6 * 1024 * 1024
const TEXT_PROVIDER = {
  kind: 'openai-compatible',
  label: 'LM Studio',
  baseUrl: 'http://127.0.0.1:1234/v1',
  defaultModel: 'qwen3-30b-a3b-2507',
  options: {},
  enabled: true,
}
const IMAGE_PROVIDER = {
  kind: 'comfyui',
  label: 'ComfyUI',
  baseUrl: 'http://127.0.0.1:8188',
  options: {},
  enabled: true,
}
const TTS_MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16'
const TTS_PROVIDER = {
  kind: 'openai-compatible',
  label: 'Local TTS (mlx-audio)',
  baseUrl: 'http://127.0.0.1:8765',
  defaultModel: TTS_MODEL,
  options: { ttsModel: TTS_MODEL },
  enabled: true,
}
const EXPORT_TARGETS = [
  'msel_pdf',
  'deck_pdf',
  'handbook_pdf',
  'briefing_pdf',
  'exercise_plan_pdf',
  'docx',
  'zip',
]
/** Tags whose injects are kept first when trimming media for git. */
const TAG_PRIORITY = [
  'STARTEX',
  'DECISION_POINT',
  'CORE_NARRATIVE',
  'CLUE',
  'TECH_HURDLE',
  'PRESSURE',
  'TIME_JUMP',
  'END_GAME',
  'ENDEX',
]

// ---- arguments --------------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, ...rest] = argv
  const args = { command, only: [], replace: false, voices: false }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--spec') args.spec = rest[++i]
    else if (a === '--out') args.out = rest[++i]
    else if (a === '--only') args.only = rest[++i].split(',').map((s) => s.trim())
    else if (a === '--replace') args.replace = true
    else if (a === '--voices') args.voices = true
    else throw new Error(`Unknown argument ${a}`)
  }
  if (!['generate', 'repair', 'refresh', 'export', 'package', 'verify'].includes(command ?? ''))
    throw new Error(
      'Usage: make-example.mjs generate|repair|refresh|export|package|verify --spec <build.json> [--out <dir>]',
    )
  if (!args.spec) throw new Error('--spec is required')
  return args
}

function loadSpec(path) {
  const spec = JSON.parse(readFileSync(resolve(path), 'utf8'))
  for (const key of ['id', 'title', 'domainProfile', 'summary', 'notice', 'project', 'documents'])
    if (!spec[key]) throw new Error(`build spec: missing "${key}"`)
  if (!Array.isArray(spec.scenarios) || !spec.scenarios.length)
    throw new Error('build spec: "scenarios" must list at least one scenario')
  return spec
}

const exampleDir = (spec) => join(ROOT, 'examples', spec.id)

// ---- the app -----------------------------------------------------------------------------------

async function launchApp() {
  const userData = mkdtempSync(join(tmpdir(), 'ttx-example-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingComplete: true }))
  const app = await electron.launch({
    timeout: 180_000,
    args: [join(ROOT, 'out/main/index.js')],
    env: { ...process.env, TTX_USER_DATA: userData, TTX_HEADLESS: '1', NODE_ENV: 'test' },
  })
  const page = await app.firstWindow({ timeout: 180_000 })
  await page.waitForLoadState('domcontentloaded')
  const invoke = async (channel, payload) => {
    const r = await page.evaluate(([c, p]) => globalThis.ttx.invoke(c, p), [channel, payload])
    if (!r.ok) throw new Error(`${channel} failed: ${r.error.code} ${r.error.message}`)
    return r.data
  }
  return { app, invoke }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForJob(invoke, jobId, label, timeoutMs) {
  const started = Date.now()
  let last = ''
  for (;;) {
    const job = await invoke('jobs:get', { jobId })
    if (job.message && job.message !== last) {
      last = job.message
      log(`  ${label}: ${job.message}`)
    }
    if (/done|error|cancelled/.test(job.status)) {
      if (job.status !== 'done') throw new Error(`${label} ${job.status}: ${job.error ?? ''}`)
      return job
    }
    if (Date.now() - started > timeoutMs) throw new Error(`${label} timed out`)
    await sleep(5000)
  }
}

const log = (msg) => console.log(`[make-example ${new Date().toISOString().slice(11, 19)}] ${msg}`)

// ---- generate ----------------------------------------------------------------------------------

function documentFiles(spec) {
  const exclude = new Set(spec.documents.exclude ?? [])
  const dirs = spec.documents.dirs ?? [spec.documents.dir]
  return dirs.flatMap((d) => {
    const dir = resolve(ROOT, d)
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md') && !exclude.has(f))
      .sort()
      .map((f) => join(dir, f))
  })
}

/** Copies of `files` in `dir` with simulated names (#283); reference/ keeps the source material. */
export function simulatedCopies(files, dir) {
  mkdirSync(dir, { recursive: true })
  return files.map((file) => {
    const copy = join(dir, file.split(/[\\/]/).pop())
    writeFileSync(copy, simulateNames(readFileSync(file, 'utf8')))
    return copy
  })
}

function readState(out) {
  const file = join(out, 'state.json')
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { scenarios: {} }
}

const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2))
}

async function openOrCreateProject(invoke, spec, out, state) {
  const existing = state.projectPath && join(out, state.projectPath)
  if (existing && existsSync(join(existing, 'project.json'))) {
    log(`reopening ${existing}`)
    await invoke('project:open', { path: existing })
    return existing
  }
  mkdirSync(out, { recursive: true })
  const { path } = await invoke('project:create', {
    parentDir: out,
    name: spec.project.name,
    orgName: spec.project.orgName,
    orgType: spec.project.orgType ?? spec.domainProfile,
  })
  state.projectPath = relative(out, path)
  writeJson(join(out, 'state.json'), state)
  await invoke('project:update', {
    path,
    patch: { name: spec.project.name, brand: spec.project.brand ?? {} },
  })
  const files = simulatedCopies(documentFiles(spec), join(out, 'sources'))
  log(`importing ${files.length} documents`)
  await invoke('documents:import', { projectPath: path, filePaths: files })
  for (let i = 0; i < 120; i++) {
    const docs = await invoke('documents:list', { projectPath: path })
    if (docs.length === files.length && docs.every((d) => d.status === 'ok')) break
    if (docs.some((d) => d.status === 'error'))
      throw new Error(`document failed: ${docs.find((d) => d.status === 'error')?.error}`)
    await sleep(2000)
  }
  return path
}

async function routeToLocalStack(invoke) {
  const lm = await invoke('providers:upsert', { config: TEXT_PROVIDER })
  const comfy = await invoke('providers:upsert', { config: IMAGE_PROVIDER })
  const tts = await invoke('providers:upsert', { config: TTS_PROVIDER })
  await invoke('routing:set', {
    scope: 'global',
    routing: {
      ideate: { providerId: lm.id },
      draft: { providerId: lm.id },
      critique: { providerId: lm.id },
      image: { providerId: comfy.id },
      video: { providerId: comfy.id },
      audio: { providerId: tts.id },
    },
  })
}

/** Inject ids for the bounded AI slice: up to `n` with an ai_image path, up to `m` with tts. */
function aiSlice(injects, n, m) {
  const withPath = (p) => injects.filter((i) => i.mediaBrief?.paths?.includes(p))
  const images = withPath('ai_image').slice(0, n)
  const voices = withPath('tts')
    .filter((i) => !images.includes(i))
    .slice(0, m)
  return { images: images.map((i) => i.id), voices: voices.map((i) => i.id) }
}

async function renderMedia(invoke, projectPath, scenarioId, injects, media) {
  const { images, voices } = aiSlice(injects, media.aiImagesPerScenario, media.ttsPerScenario)
  const all = injects.map((i) => i.id)
  const run = async (injectIds, paths, label) => {
    if (!injectIds.length) return
    const { jobId } = await invoke('generate:media', { projectPath, scenarioId, injectIds, paths })
    await waitForJob(invoke, jobId, label, 40 * 60_000)
  }
  await run(all, ['template'], 'templates')
  await run(images, ['template', 'ai_image'], 'AI stills')
  await run(voices, ['template', 'tts'], 'voice clips')
}

const byTag = (rows) =>
  rows.reduce((m, r) => ({ ...m, [r.purposeTag]: (m[r.purposeTag] ?? 0) + 1 }), {})
const byCode = (ws) => ws.reduce((m, w) => ({ ...m, [w.code]: (m[w.code] ?? 0) + 1 }), {})

async function reviewMaterial(invoke, projectPath, scenarioId, injects, lints, timing) {
  const s = await invoke('scenarios:get', { projectPath, scenarioId })
  const docs = {}
  for (const kind of ['overview', 'handbook', 'briefing', 'hotwash'])
    docs[kind] = (await invoke('scenarios:doc-get', { projectPath, scenarioId, kind })).markdown
  const assets = injects.flatMap((i) => i.assets)
  const summary = {
    scenarioId,
    title: s.title,
    threatFamily: s.brief.threatFamily,
    threat: s.overview?.threat,
    location: s.overview?.location,
    roles: s.roles.map((r) => `${r.id}: ${r.name}`),
    phases: s.phases.map((p) => p.title),
    rows: s.msel.length,
    tags: byTag(s.msel),
    decisionPoints: s.msel
      .filter((r) => r.purposeTag === 'DECISION_POINT')
      .map((r) => `${r.id}: ${r.event.slice(0, 160)}`),
    lintCodes: byCode(lints),
    critiqueCount: s.warnings.filter((w) => w.code === 'CRITIQUE').length,
    injectTypes: injects.map((i) => `${i.mselRowId}: ${i.type}`),
    assets: {
      rendered: assets.filter((a) => a.role === 'rendered' || a.role === 'composite').length,
      aiImages: assets.filter((a) => a.role === 'generated' && a.kind === 'image').length,
      audio: assets.filter((a) => a.kind === 'audio').length,
    },
    timing,
  }
  return { scenario: s, docs, summary }
}

async function exportScenario(invoke, projectPath, scenarioId, dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const { jobId } = await invoke('export:run', {
    projectPath,
    scenarioId,
    outDir: dir,
    targets: EXPORT_TARGETS,
  })
  await waitForJob(invoke, jobId, 'export', 20 * 60_000)
}

async function generateScenario(invoke, projectPath, entry) {
  const { jobId, scenarioId } = await invoke('generate:scenario', {
    projectPath,
    brief: {
      userPrompt: entry.userPrompt,
      audience: entry.audience,
      durationHours: entry.durationHours ?? 4,
      phaseCount: entry.phaseCount ?? 4,
      learningObjectives: entry.learningObjectives ?? [],
      constraints: entry.constraints ?? [],
      startWallClock: entry.startWallClock ?? '09:00',
      threatFamily: entry.threatFamily,
    },
  })
  await waitForJob(invoke, jobId, `scenario ${entry.key}`, 60 * 60_000)
  return scenarioId
}

/** The markdown section under the first heading matching `heading` (case-insensitive),
 *  down to the next heading of the same or a higher level. Throws when there is none. */
export function markdownSection(md, heading) {
  const lines = md.split('\n')
  const want = new RegExp(heading, 'i')
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && want.test(l))
  if (start < 0) throw new Error(`no heading matching "${heading}"`)
  const level = /^#+/.exec(lines[start])[0].length
  const higher = new RegExp(`^#{1,${level}}\\s`)
  const end = lines.findIndex((l, i) => i > start && higher.test(l))
  return (
    lines
      .slice(start, end < 0 ? undefined : end)
      .join('\n')
      .trim() + '\n'
  )
}

/**
 * The markdown a seed document entry names: a file, `{ file, section }` (one section of it,
 * e.g. the hot wash guide of a handbook) or a list of those joined in order (handouts).
 */
export function seedMarkdown(value, root = ROOT) {
  if (Array.isArray(value))
    return value.map((v) => seedMarkdown(v, root).trim()).join('\n\n') + '\n'
  const file = typeof value === 'string' ? value : value.file
  const md = simulateNames(readFileSync(resolve(root, file), 'utf8'))
  return typeof value === 'object' && value.section ? markdownSection(md, value.section) : md
}

/** A hand-authored scenario (entry.seed.scenario JSON + markdown documents) instead of a
 *  generated one: only injects and media are generated for it. */
async function seedScenario(invoke, projectPath, entry) {
  const authored = JSON.parse(
    simulateNames(readFileSync(resolve(ROOT, entry.seed.scenario), 'utf8')),
  )
  const empty = await invoke('scenarios:create-empty', { projectPath, title: authored.title })
  await invoke('scenarios:save', {
    projectPath,
    scenario: { ...authored, id: empty.id, projectId: empty.projectId, documents: {} },
    note: 'Hand-authored scenario (example seed)',
  })
  for (const [kind, value] of Object.entries(entry.seed.documents ?? {}))
    await invoke('scenarios:doc-save', {
      projectPath,
      scenarioId: empty.id,
      kind,
      markdown: seedMarkdown(value),
      note: 'Hand-authored document (example seed)',
    })
  log(`${entry.key}: seeded "${authored.title}" (${authored.msel.length} rows)`)
  return empty.id
}

async function generateOne(invoke, spec, out, projectPath, entry, state) {
  const previous = state.scenarios[entry.key]
  if (previous) {
    log(`deleting the previous "${entry.key}" scenario ${previous.scenarioId}`)
    await invoke('scenarios:delete', { projectPath, scenarioId: previous.scenarioId })
  }
  const t0 = Date.now()
  const scenarioId = entry.seed
    ? await seedScenario(invoke, projectPath, entry)
    : await generateScenario(invoke, projectPath, entry)
  const scenarioSecs = Math.round((Date.now() - t0) / 1000)
  const t1 = Date.now()
  const injectJob = await invoke('generate:injects', { projectPath, scenarioId })
  await waitForJob(invoke, injectJob.jobId, `injects ${entry.key}`, 60 * 60_000)
  const injectSecs = Math.round((Date.now() - t1) / 1000)
  let injects = await invoke('injects:list', { projectPath, scenarioId })
  const t2 = Date.now()
  await renderMedia(invoke, projectPath, scenarioId, injects, entry.media ?? spec.media ?? {})
  injects = await invoke('injects:list', { projectPath, scenarioId })
  const mediaSecs = Math.round((Date.now() - t2) / 1000)
  const lints = await invoke('scenarios:lint', { projectPath, scenarioId })
  const { scenario, docs, summary } = await reviewMaterial(
    invoke,
    projectPath,
    scenarioId,
    injects,
    lints,
    { scenarioSecs, injectSecs, mediaSecs },
  )
  const review = join(out, 'review', entry.key)
  writeJson(join(review, 'summary.json'), summary)
  writeJson(join(review, 'scenario.json'), scenario)
  writeJson(join(review, 'injects.json'), injects)
  writeJson(join(review, 'lints.json'), lints)
  for (const [k, md] of Object.entries(docs)) writeFileSync(join(review, `${k}.md`), md)
  await exportScenario(invoke, projectPath, scenarioId, join(out, 'exports', entry.key))
  state.scenarios[entry.key] = {
    scenarioId,
    title: scenario.title,
    threatFamily: entry.threatFamily,
  }
  writeJson(join(out, 'state.json'), state)
  log(
    `${entry.key}: "${scenario.title}" — ${summary.rows} rows, ${injects.length} injects, ` +
      `${summary.assets.rendered} rendered, ${summary.assets.aiImages} stills, ${summary.assets.audio} clips ` +
      `(${scenarioSecs}s + ${injectSecs}s + ${mediaSecs}s)`,
  )
}

async function generate(args) {
  const spec = loadSpec(args.spec)
  const out = resolve(args.out ?? join(ROOT, '.tmp/examples-release', spec.id))
  const { app, invoke } = await launchApp()
  try {
    const state = readState(out)
    const projectPath = await openOrCreateProject(invoke, spec, out, state)
    await routeToLocalStack(invoke)
    const wanted = spec.scenarios.filter((s) => !args.only.length || args.only.includes(s.key))
    for (const entry of wanted) {
      if (state.scenarios[entry.key] && !args.replace) {
        log(
          `${entry.key}: already generated (${state.scenarios[entry.key].scenarioId}); use --replace`,
        )
        continue
      }
      await generateOne(invoke, spec, out, projectPath, entry, state)
    }
  } finally {
    await app.close()
  }
}

// ---- repair ------------------------------------------------------------------------------------

/** sha256 of every file under `dir`, by path relative to it. */
export function hashTree(dir) {
  const out = new Map()
  if (!existsSync(dir)) return out
  for (const rel of walk(dir))
    out.set(
      rel,
      createHash('sha256')
        .update(readFileSync(join(dir, rel)))
        .digest('hex'),
    )
  return out
}

/** Files changed, added, removed and byte-identical between two hashTree results. */
export function treeDiff(before, after) {
  const changed = []
  const added = []
  const removed = []
  let identical = 0
  for (const [rel, h] of after) {
    if (!before.has(rel)) added.push(rel)
    else if (before.get(rel) !== h) changed.push(rel)
    else identical++
  }
  for (const rel of before.keys()) if (!after.has(rel)) removed.push(rel)
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort(), identical }
}

const RECORD_FILES = /(^|\/)history\//

async function repairOne(invoke, spec, out, projectPath, entry, state) {
  const { scenarioId } = state.scenarios[entry.key]
  const dir = join(projectPath, 'scenarios', scenarioId)
  const keep = (m) => new Map([...m].filter(([rel]) => !RECORD_FILES.test(rel)))
  const before = await invoke('scenarios:get', { projectPath, scenarioId })
  const hashesBefore = keep(hashTree(dir))
  const t0 = Date.now()
  const { jobId } = await invoke('generate:repair', {
    projectPath,
    scenarioId,
    aiStills: spec.media?.aiImagesPerScenario ?? 2,
  })
  const job = await waitForJob(invoke, jobId, `repair ${entry.key}`, 90 * 60_000)
  const repairSecs = Math.round((Date.now() - t0) / 1000)
  const injects = await invoke('injects:list', { projectPath, scenarioId })
  const lints = await invoke('scenarios:lint', { projectPath, scenarioId })
  const { scenario, docs, summary } = await reviewMaterial(
    invoke,
    projectPath,
    scenarioId,
    injects,
    lints,
    { repairSecs },
  )
  const diff = treeDiff(hashesBefore, keep(hashTree(dir)))
  const review = join(out, 'review', entry.key)
  const report = {
    scenarioId,
    warningsBefore: byCode(before.warnings),
    warningsAfter: byCode(scenario.warnings),
    repair: job.result,
    files: diff,
  }
  writeJson(join(review, 'repair.json'), report)
  const { entries } = await invoke('jobs:log', { jobId })
  writeJson(join(review, 'repair-log.json'), entries)
  writeJson(join(review, 'summary.json'), summary)
  writeJson(join(review, 'scenario.json'), scenario)
  writeJson(join(review, 'injects.json'), injects)
  writeJson(join(review, 'lints.json'), lints)
  for (const [k, md] of Object.entries(docs)) writeFileSync(join(review, `${k}.md`), md)
  await exportScenario(invoke, projectPath, scenarioId, join(out, 'exports', entry.key))
  log(
    `${entry.key}: repaired in ${repairSecs}s — ${diff.changed.length} file(s) changed, ` +
      `${diff.added.length} added, ${diff.removed.length} removed, ${diff.identical} identical`,
  )
}

/** Open the generated project in `out` and run `each` for every wanted scenario of the spec. */
async function forEachGenerated(args, label, each, route = routeToLocalStack) {
  const spec = loadSpec(args.spec)
  const out = resolve(args.out ?? join(ROOT, '.tmp/examples-release', spec.id))
  const state = readState(out)
  if (!state.projectPath) throw new Error(`${label}: nothing generated in ${out}`)
  const { app, invoke } = await launchApp()
  try {
    const projectPath = join(out, state.projectPath)
    await invoke('project:open', { path: projectPath })
    await route(invoke)
    const wanted = spec.scenarios.filter((s) => !args.only.length || args.only.includes(s.key))
    for (const entry of wanted) {
      if (!state.scenarios[entry.key])
        throw new Error(`${label}: "${entry.key}" was never generated`)
      await each({ invoke, spec, out, projectPath, entry, state })
    }
  } finally {
    await app.close()
  }
}

const repair = (args) =>
  forEachGenerated(args, 'repair', (c) =>
    repairOne(c.invoke, c.spec, c.out, c.projectPath, c.entry, c.state),
  )

/** The PDF set, DOCX and distribution ZIP of every scenario again, into <out>/exports/<key>/. */
const exportAll = (args) =>
  forEachGenerated(args, 'export', async (c) => {
    const { scenarioId } = c.state.scenarios[c.entry.key]
    await exportScenario(c.invoke, c.projectPath, scenarioId, join(c.out, 'exports', c.entry.key))
    log(`${c.entry.key}: exported to ${join(c.out, 'exports', c.entry.key)}`)
  })

// ---- refresh -----------------------------------------------------------------------------------

/** Every task routed to a provider nobody listens on: a refresh never reaches a model. */
async function routeOffline(invoke, { voices = false } = {}) {
  const offline = { label: 'Offline (example refresh)', options: {}, enabled: true }
  const text = await invoke('providers:upsert', {
    config: {
      ...offline,
      kind: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:9/v1',
      defaultModel: 'none',
    },
  })
  const image = await invoke('providers:upsert', {
    config: { ...offline, kind: 'comfyui', baseUrl: 'http://127.0.0.1:9' },
  })
  const on = (id) => ({ providerId: id })
  await invoke('routing:set', {
    scope: 'global',
    routing: {
      ideate: on(text.id),
      draft: on(text.id),
      critique: on(text.id),
      image: on(image.id),
      video: on(image.id),
      audio: on(voices ? (await invoke('providers:upsert', { config: TTS_PROVIDER })).id : text.id),
    },
  })
}

/** What a hand edit of an inject changes (the parts its template card is drawn from). */
export const injectContent = (i) =>
  JSON.stringify([i.type, i.title, i.variant ?? null, i.deliveryMode, i.instructorNote, i.fields])

/** What a hand edit of a scenario changes (not its warnings, provenance or bookkeeping). */
export const scenarioContent = (s) =>
  JSON.stringify([
    s.title,
    s.subtitle,
    s.brief,
    s.overview,
    s.objectives,
    s.roles,
    s.phases,
    s.msel,
  ])

function shippedJson(spec, rel) {
  const file = join(exampleDir(spec), 'project', rel)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
}

/** Seed documents that differ from what the scenario has (the spec gained a hot wash, handouts…). */
async function refreshDocuments(invoke, projectPath, scenarioId, entry) {
  const seeded = []
  for (const [kind, value] of Object.entries(entry.seed?.documents ?? {})) {
    const markdown = seedMarkdown(value)
    const doc = await invoke('scenarios:doc-get', { projectPath, scenarioId, kind })
    if (doc.markdown === markdown) continue
    await invoke('scenarios:doc-save', {
      projectPath,
      scenarioId,
      kind,
      markdown,
      note: 'Hand-authored document (example seed)',
    })
    seeded.push(kind)
  }
  return seeded
}

/** Record hand-edited injects as user saves; returns the ids whose content changed. */
async function recordInjectEdits(invoke, spec, projectPath, scenarioId) {
  const changed = []
  for (const inject of await invoke('injects:list', { projectPath, scenarioId })) {
    const shipped = shippedJson(spec, `scenarios/${scenarioId}/injects/${inject.id}.json`)
    if (shipped && injectContent(shipped) === injectContent(inject)) continue
    const last = inject.versions.at(-1)?.snapshot
    const recorded = last && injectContent({ ...inject, ...last }) === injectContent(inject)
    if (!recorded)
      await invoke('injects:save', {
        projectPath,
        scenarioId,
        inject,
        note: 'Corrected by hand for the shipped example',
      })
    changed.push(inject.id)
  }
  return changed
}

/** Inject warnings a hand correction answers (the content checks re-run in the example test). */
const CORRECTED_CODES = new Set(['INJECT_CONTENT_ISSUE', 'INJECT_FIELDS_INVALID'])

/**
 * A hand-authored scenario is never repaired (the repair's MSEL passes would rewrite the
 * authored rows): the content warnings of the injects corrected by hand are dropped instead.
 * tests/scripts/example-content.test.ts runs the same content checks on every shipped inject.
 */
async function dropCorrectedWarnings(invoke, projectPath, scenarioId, injectIds) {
  const scenario = await invoke('scenarios:get', { projectPath, scenarioId })
  const corrected = (w) => injectIds.includes(w.injectId) && CORRECTED_CODES.has(w.code)
  if (!scenario.warnings.some(corrected)) return
  await invoke('scenarios:save', {
    projectPath,
    scenario: { ...scenario, warnings: scenario.warnings.filter((w) => !corrected(w)) },
    note: 'Content warnings of the injects corrected by hand',
  })
}

/** The repair must not have needed a model: nothing rewritten, nothing regenerated. */
export function assertNoRewrite(result, key) {
  const rewrites = [
    ...(result.msel?.textChanged ?? []),
    ...(result.injectRows ?? []),
    ...(result.recheck?.regenerate ?? []),
    ...(result.stillInjects ?? []),
  ]
  if (rewrites.length)
    throw new Error(
      `refresh ${key}: the repair wanted to rewrite ${[...new Set(rewrites)].join(', ')}; fix them by hand first`,
    )
}

/** Voice clips again for the edited injects that carry one (refresh --voices). */
async function revoice(invoke, projectPath, scenarioId, changed) {
  const injects = await invoke('injects:list', { projectPath, scenarioId })
  const injectIds = injects
    .filter((i) => changed.includes(i.id) && i.assets.some((a) => a.kind === 'audio'))
    .map((i) => i.id)
  if (!injectIds.length) return 0
  const { jobId } = await invoke('generate:media', {
    projectPath,
    scenarioId,
    injectIds,
    paths: ['tts'],
  })
  await waitForJob(invoke, jobId, `voice clips ${scenarioId}`, 40 * 60_000)
  return injectIds.length
}

async function refreshOne({ invoke, spec, projectPath, entry, state, voices }) {
  const { scenarioId } = state.scenarios[entry.key]
  const seeded = await refreshDocuments(invoke, projectPath, scenarioId, entry)
  const scenario = await invoke('scenarios:get', { projectPath, scenarioId })
  const shipped = shippedJson(spec, `scenarios/${scenarioId}/scenario.json`)
  const edited = !shipped || scenarioContent(shipped) !== scenarioContent(scenario)
  if (edited)
    await invoke('scenarios:save', {
      projectPath,
      scenario,
      note: 'Corrected by hand for the shipped example',
    })
  const changed = await recordInjectEdits(invoke, spec, projectPath, scenarioId)
  if (changed.length) {
    const { jobId } = await invoke('generate:media', {
      projectPath,
      scenarioId,
      injectIds: changed,
      paths: ['template'],
    })
    await waitForJob(invoke, jobId, `templates ${entry.key}`, 20 * 60_000)
  }
  const voiced = voices ? await revoice(invoke, projectPath, scenarioId, changed) : 0
  if (entry.seed) await dropCorrectedWarnings(invoke, projectPath, scenarioId, changed)
  else {
    const { jobId } = await invoke('generate:repair', { projectPath, scenarioId, aiStills: 0 })
    const job = await waitForJob(invoke, jobId, `relint ${entry.key}`, 20 * 60_000)
    assertNoRewrite(job.result ?? {}, entry.key)
  }
  const after = await invoke('scenarios:get', { projectPath, scenarioId })
  const lints = entry.seed ? [] : await invoke('scenarios:lint', { projectPath, scenarioId })
  const open = blockingWarnings(after.warnings, lints)
  const detail = open.map((w) => `\n    ${w.code} ${w.rowId ?? ''} ${w.message.split('\n')[0]}`)
  log(
    `${entry.key}: ${edited ? 'scenario edited, ' : ''}${changed.length} inject(s) re-rendered, ` +
      `${voiced ? `${voiced} re-voiced, ` : ''}` +
      `${seeded.length ? `seeded ${seeded.join(', ')}, ` : ''}${open.length} warning(s) open` +
      detail.join(''),
  )
}

const refresh = (args) =>
  forEachGenerated(
    args,
    'refresh',
    (c) => refreshOne({ ...c, voices: args.voices }),
    (invoke) => routeOffline(invoke, { voices: args.voices }),
  )

// ---- package -----------------------------------------------------------------------------------

/** Files and folders of a generated project that never ship: derived, transient, or local. */
export function isDerived(rel) {
  const top = rel.split('/')[0]
  return (
    top === '.cache' ||
    top === 'index.sqlite' ||
    top.startsWith('index.sqlite-') ||
    top === 'jobs.json' ||
    top === '.gitignore' ||
    /(^|\/)(?:jobs?|logs?)\.(?:json|jsonl|log)$/.test(rel) ||
    /(^|\/)[^/]+\.(?:log|jsonl)$/.test(rel) ||
    /^scenarios\/[^/]+\/history\//.test(rel) ||
    /(^|\/)\.DS_Store$/.test(rel)
  )
}

// Paths that reveal the author's machine, and key-shaped strings. Story content such as
// "/var/log/scada.log" or "/tmp/auto_cleaner.py" inside a system-log inject is exactly what
// those injects should carry (#347): only a user's home, the per-user temp folder and the
// author's own folders (home, project, output) count.
const AUTHOR_PATH =
  /(?:^|["'\s(=:])((?:\/Users\/|\/(?:private\/)?var\/folders\/|[A-Za-z]:\\+Users\\+(?!\\*Public\\))[^"'\s)]*)/g
const PATH_TOKEN = /(?:^|["'\s(=:])(\/[^"'\s)]+)/g
const SECRET_HINT = /\b(?:sk-[A-Za-z0-9]{8,}|api[_-]?key\s*[:=]|Bearer\s+[A-Za-z0-9._-]{16,})/g

/** Author-machine paths (a home, the per-user temp folder, one of `roots`) or secret-looking strings. */
export function findLeaks(text, roots = [homedir()]) {
  const found = new Set()
  for (const m of text.matchAll(AUTHOR_PATH)) found.add(m[1])
  const mine = roots.filter((r) => r.length > 1).map((r) => r.replace(/\/+$/, ''))
  for (const m of text.matchAll(PATH_TOKEN))
    if (mine.some((r) => m[1] === r || m[1].startsWith(`${r}/`))) found.add(m[1])
  for (const m of text.matchAll(SECRET_HINT)) found.add(m[0])
  return [...found]
}

/** Every text file of the packaged project that still carries a leak, with what it carries. */
export function leaksIn(dest, roots = [homedir()]) {
  const leaks = []
  for (const rel of walk(dest)) {
    if (!/\.(?:json|md|txt)$/.test(rel)) continue
    const found = findLeaks(readFileSync(join(dest, rel), 'utf8'), roots)
    if (found.length) leaks.push(`${rel}: ${found.join(', ')}`)
  }
  return leaks
}

function walk(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, base))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

/** Strip provider ids and absolute paths from a JSON value, recursively. */
export function scrub(value, absolute) {
  if (Array.isArray(value)) return value.map((v) => scrub(v, absolute))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === 'providerRef' || k === 'providerId') continue
      if (k === 'providerRouting') {
        out[k] = {}
        continue
      }
      out[k] = scrub(v, absolute)
    }
    return out
  }
  if (typeof value === 'string') {
    let s = value
    for (const a of absolute) s = s.split(a).join('')
    return s.replace(/\/Users\/[^/\s"]+/g, '~').replace(/\/home\/[^/\s"]+/g, '~')
  }
  return value
}

/** Rendered PNGs ship; a composite carries its AI still, so the raw still does not. */
const KEEP_ASSET = (a) =>
  (a.role === 'rendered' || a.role === 'composite') && a.path.endsWith('.png')

/** The longest voice clip an example ships (seconds); longer ones stay in the release bundle. */
const MAX_CLIP_SEC = 45
const CLIP_KBPS = 48

let lame
/** lamejs's self-contained bundle, evaluated in a function scope (as the app's exporter does). */
function loadLame() {
  if (lame) return lame
  const path = createRequire(import.meta.url).resolve('lamejs/lame.all.js')
  const source = readFileSync(path, 'utf8')
  lame = runInThisContext(`(function () {\n${source}\nreturn lamejs;\n})()`, { filename: path })
  return lame
}

/** Interleaved 16-bit samples averaged down to one channel. */
function toMono(samples, channels) {
  if (channels === 1) return samples
  const mono = new Int16Array(Math.floor(samples.length / channels))
  for (let i = 0; i < mono.length; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += samples[i * channels + c]
    mono[i] = Math.round(sum / channels)
  }
  return mono
}

/** A WAV as a mono MP3 at a voice bitrate: the shipped copy of a voice clip. */
export function shippedMp3(wav) {
  const w = new WaveFile(wav)
  if (w.bitDepth !== '16') w.toBitDepth('16')
  const samples = toMono(w.getSamples(true, Int16Array), w.fmt.numChannels)
  const encoder = new (loadLame().Mp3Encoder)(1, w.fmt.sampleRate, CLIP_KBPS)
  const chunks = []
  const push = (c) => c.length && chunks.push(Buffer.from(c.buffer, c.byteOffset, c.length))
  for (let i = 0; i < samples.length; i += 1152)
    push(encoder.encodeBuffer(samples.subarray(i, i + 1152)))
  push(encoder.flush())
  return Buffer.concat(chunks)
}

/** The one voice clip an example ships: the first by tag priority and MSEL order, short enough. */
export function chooseClip(projectDir, scenarios) {
  for (const { scenario, injects } of scenarios) {
    const order = new Map(scenario.msel.map((r, i) => [r.id, i]))
    const rank = (inj) => {
      const row = scenario.msel.find((r) => r.id === inj.mselRowId)
      const p = TAG_PRIORITY.indexOf(row?.purposeTag ?? '')
      return (p === -1 ? TAG_PRIORITY.length : p) * 1000 + (order.get(inj.mselRowId) ?? 999)
    }
    const clip = [...injects]
      .sort((a, b) => rank(a) - rank(b))
      .flatMap((inj) =>
        inj.assets.filter((a) => a.kind === 'audio' && /\.(?:wav|mp3)$/.test(a.path)),
      )
      .find(
        (a) => (a.durationSec ?? Infinity) <= MAX_CLIP_SEC && existsSync(join(projectDir, a.path)),
      )
    if (!clip) continue
    // A project rebuilt from a shipped example already carries the clip as MP3.
    const bytes = readFileSync(join(projectDir, clip.path))
    return { asset: clip, buffer: clip.path.endsWith('.mp3') ? bytes : shippedMp3(bytes) }
  }
  return undefined
}

/** Templates render at 2×; the bundled copy is 1× (each pixel the mean of a 2×2 block). */
export function shippedPng(buffer) {
  const src = PNG.sync.read(buffer)
  if (src.width < 1600) return { buffer, width: src.width, height: src.height }
  const width = Math.floor(src.width / 2)
  const height = Math.floor(src.height / 2)
  const dst = new PNG({ width, height })
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 4; c++) {
        const at = (dx, dy) => src.data[((2 * y + dy) * src.width + 2 * x + dx) * 4 + c]
        dst.data[(y * width + x) * 4 + c] = Math.round(
          (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4,
        )
      }
  return { buffer: PNG.sync.write(dst, { deflateLevel: 9 }), width, height }
}

/**
 * Which assets each scenario keeps in git: at most two composites with an AI still first (the
 * scarce media the example shows off, #185), then rendered PNGs in MSEL order by tag priority,
 * round-robin across scenarios until the budget is spent. Returns the shipped (1×) image per
 * kept asset id.
 */
export function chooseAssets(projectDir, scenarios, reserved = 0) {
  const queues = scenarios.map(({ scenario, injects }) => {
    const order = new Map(scenario.msel.map((r, i) => [r.id, i]))
    const rank = (inj) => {
      const row = scenario.msel.find((r) => r.id === inj.mselRowId)
      const p = TAG_PRIORITY.indexOf(row?.purposeTag ?? '')
      return (p === -1 ? TAG_PRIORITY.length : p) * 1000 + (order.get(inj.mselRowId) ?? 999)
    }
    const sorted = [...injects].sort((a, b) => rank(a) - rank(b))
    const assets = sorted.flatMap((inj) => inj.assets.filter(KEEP_ASSET))
    const composites = assets.filter((a) => a.role === 'composite').slice(0, 2)
    return [...composites, ...assets.filter((a) => a.role !== 'composite')]
  })
  const kept = new Map()
  let total = reserved
  while (queues.some((q) => q.length)) {
    for (const q of queues) {
      const asset = q.shift()
      if (!asset) continue
      const shipped = shippedPng(readFileSync(join(projectDir, asset.path)))
      if (total + shipped.buffer.byteLength > MEDIA_BUDGET_BYTES) continue
      total += shipped.buffer.byteLength
      kept.set(asset.id, shipped)
    }
  }
  return { kept, total }
}

function scenarioBundles(projectDir, scenarioIds) {
  return scenarioIds.map((id) => {
    const dir = join(projectDir, 'scenarios', id)
    const scenario = JSON.parse(readFileSync(join(dir, 'scenario.json'), 'utf8'))
    const injectsDir = join(dir, 'injects')
    const injects = existsSync(injectsDir)
      ? readdirSync(injectsDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => JSON.parse(readFileSync(join(injectsDir, f), 'utf8')))
      : []
    return { id, dir, scenario, injects }
  })
}

/** An inject's asset record as shipped: 1× size for a PNG, the MP3 path and hash for a clip. */
function shippedAsset(asset, shipped) {
  if (!shipped.ext) return { ...asset, width: shipped.width, height: shipped.height }
  return {
    ...asset,
    path: asset.path.replace(/\.[a-z0-9]+$/, `.${shipped.ext}`),
    sha256: createHash('sha256').update(shipped.buffer).digest('hex'),
  }
}

/** Build `dest` (default examples/<id>/project) from the generated project in `out`. */
export function packageProject(spec, out, dest = join(exampleDir(spec), 'project')) {
  const state = readState(out)
  if (!state.projectPath) throw new Error('package: nothing generated in ' + out)
  const src = join(out, state.projectPath)
  const ids = spec.scenarios.map((s) => state.scenarios[s.key]?.scenarioId).filter(Boolean)
  if (ids.length !== spec.scenarios.length)
    throw new Error('package: every scenario in the spec must be generated first')
  rmSync(dest, { recursive: true, force: true })
  const bundles = scenarioBundles(src, ids)
  const clip = chooseClip(src, bundles)
  const { kept, total } = chooseAssets(src, bundles, clip?.buffer.byteLength ?? 0)
  if (clip) kept.set(clip.asset.id, { buffer: clip.buffer, ext: 'mp3' })
  const absolute = [src, out, ROOT, homedir()]
  let files = 0
  const shipped = new Set(ids)
  for (const rel of walk(src)) {
    if (isDerived(rel)) continue
    const scenarioOf = /^scenarios\/([^/]+)\//.exec(rel)?.[1]
    if (scenarioOf && !shipped.has(scenarioOf)) continue
    const mediaId = /\/media\/[^/]+\/([^/]+)\.[a-z0-9]+$/.exec(rel)?.[1]
    if (rel.includes('/media/') && !(mediaId && kept.has(mediaId))) continue
    const ext = mediaId && kept.get(mediaId).ext
    const target = join(dest, ext ? rel.replace(/\.[a-z0-9]+$/, `.${ext}`) : rel)
    mkdirSync(dirname(target), { recursive: true })
    if (rel.endsWith('.json')) {
      const value = JSON.parse(readFileSync(join(src, rel), 'utf8'))
      if (rel === 'project.json')
        value.scenarios = (value.scenarios ?? []).filter((s) => shipped.has(s.id))
      writeFileSync(target, JSON.stringify(scrub(value, absolute), null, 2) + '\n')
    } else if (mediaId) writeFileSync(target, kept.get(mediaId).buffer)
    else cpSync(join(src, rel), target)
    files++
  }
  // Inject asset lists only name files that shipped.
  for (const b of bundles)
    for (const inj of b.injects) {
      const file = join(dest, 'scenarios', b.id, 'injects', `${inj.id}.json`)
      if (!existsSync(file)) continue
      const value = JSON.parse(readFileSync(file, 'utf8'))
      value.assets = (value.assets ?? [])
        .filter((a) => kept.has(a.id))
        .map((a) => shippedAsset(a, kept.get(a.id)))
      writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
    }
  writeFileSync(
    join(dest, '.gitignore'),
    ['index.sqlite', 'index.sqlite-*', '.cache/', ''].join('\n'),
  )
  const leaks = leaksIn(dest, absolute)
  if (leaks.length)
    throw new Error(`package: author paths or secrets in the example:\n  ${leaks.join('\n  ')}`)
  return { files, kept: kept.size, mediaBytes: total, bundles, clip: clip?.asset.id }
}

/** example.json for the spec's scenarios (ids from `out`'s state), into `dir`. */
export function writeManifest(spec, out, bundles, dir = exampleDir(spec)) {
  const state = readState(out)
  const manifest = {
    id: spec.id,
    title: spec.title,
    domainProfile: spec.domainProfile,
    summary: spec.summary,
    fictional: true,
    notice: spec.notice,
    scenarios: spec.scenarios.map((s) => {
      const b = bundles.find((x) => x.id === state.scenarios[s.key].scenarioId)
      return {
        id: b.id,
        title: b.scenario.title,
        threatFamily: s.threatFamily,
        summary: s.summary ?? b.scenario.overview?.threat ?? '',
      }
    }),
  }
  writeJson(join(dir, 'example.json'), manifest)
  return manifest
}

function packageExample(args) {
  const spec = loadSpec(args.spec)
  const out = resolve(args.out ?? join(ROOT, '.tmp/examples-release', spec.id))
  const { files, kept, mediaBytes, bundles, clip } = packageProject(spec, out)
  const manifest = writeManifest(spec, out, bundles)
  log(
    `packaged examples/${spec.id}: ${files} files, ${kept} media assets ` +
      `(${clip ? 'one voice clip' : 'no voice clip'}), ` +
      `${(mediaBytes / 1024 / 1024).toFixed(2)} MB media, ${manifest.scenarios.length} scenarios`,
  )
}

// ---- verify ------------------------------------------------------------------------------------

/** Warnings a shipped example may not carry: anything but CRITIQUE notes and info, once each. */
export function blockingWarnings(stored, recomputed = []) {
  const seen = new Set()
  return [...stored, ...recomputed].filter((w) => {
    if (w.code === 'CRITIQUE' || w.severity === 'info') return false
    const key = `${w.code}|${w.rowId ?? ''}|${w.injectId ?? ''}|${w.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function verify(args) {
  const spec = loadSpec(args.spec)
  const manifest = JSON.parse(readFileSync(join(exampleDir(spec), 'example.json'), 'utf8'))
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-example-verify-'))
  const { app, invoke } = await launchApp()
  try {
    // The app's own gallery path (#172): examples:list must show it, examples:open copies it.
    const listed = await invoke('examples:list')
    if (!listed.some((e) => e.slug === spec.id))
      throw new Error(
        `examples:list does not show "${spec.id}" (${listed.map((e) => e.slug).join(', ')})`,
      )
    const { path: copy, project } = await invoke('examples:open', { slug: spec.id, parentDir })
    const marker = await invoke('examples:marker', { projectPath: copy })
    if (marker?.slug !== spec.id) throw new Error('examples:marker does not name this example')
    const { jobId } = await invoke('index:rebuild', { projectPath: copy })
    await waitForJob(invoke, jobId, 'index rebuild', 10 * 60_000)
    const docs = await invoke('documents:list', { projectPath: copy })
    const hits = await invoke('retrieve:search', { projectPath: copy, query: 'lost link', k: 3 })
    let injectCount = 0
    let assetCount = 0
    const problems = []
    for (const [index, s] of manifest.scenarios.entries()) {
      const scenario = await invoke('scenarios:get', { projectPath: copy, scenarioId: s.id })
      const injects = await invoke('injects:list', { projectPath: copy, scenarioId: s.id })
      const lints = spec.scenarios[index]?.seed
        ? []
        : await invoke('scenarios:lint', { projectPath: copy, scenarioId: s.id })
      for (const w of blockingWarnings(scenario.warnings, lints))
        problems.push(`${scenario.title}: ${w.code} ${w.rowId ?? ''} ${w.message.split('\n')[0]}`)
      injectCount += injects.length
      for (const a of injects.flatMap((i) => i.assets)) {
        if (!existsSync(join(copy, a.path))) throw new Error(`missing asset ${a.path}`)
        assetCount++
      }
      log(`${s.id}: "${scenario.title}" ${scenario.msel.length} rows, ${injects.length} injects`)
    }
    const facts = await invoke('project:facility-facts', { path: copy })
    log(
      `verified "${project.name}" (${project.orgType}): ${docs.length} documents, ` +
        `${hits.length} search hits, ${injectCount} injects, ${assetCount} assets, ` +
        `${facts.categories.filter((c) => c.entries.length).length} fact categories`,
    )
    if (!docs.every((d) => d.status === 'ok')) throw new Error('a document is not ok after reindex')
    if (!hits.length) throw new Error('search returned nothing after the index rebuild')
    if (problems.length)
      throw new Error(
        `${problems.length} lint warning(s) in the shipped example; fix them in place, then ` +
          `refresh and package:\n  ${problems.join('\n  ')}`,
      )
  } finally {
    await app.close()
    rmSync(parentDir, { recursive: true, force: true })
  }
}

// ---- main --------------------------------------------------------------------------------------

// Only the CLI runs the command; tests import the functions above.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  Promise.resolve()
    .then(() => {
      const args = parseArgs(process.argv.slice(2))
      return {
        generate,
        repair,
        refresh,
        export: exportAll,
        package: packageExample,
        verify,
      }[args.command](args)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
