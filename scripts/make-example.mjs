#!/usr/bin/env node
// Builds a bundled example project (examples/<id>/, the example contract of #169, #157, #158)
// from a build spec by driving the built app headless against the local provider stack, then
// strips and trims the generated project folder for git.
//
//   node scripts/make-example.mjs generate --spec examples/<id>/build.json --out .tmp/examples-release/<id> [--only key,…] [--replace]
//   node scripts/make-example.mjs package  --spec examples/<id>/build.json --out .tmp/examples-release/<id>
//   node scripts/make-example.mjs verify   --spec examples/<id>/build.json
//
// generate: creates (or reopens) <out>/project, imports the spec's documents, routes every
//   task to the local providers (LM Studio text, ComfyUI images, mlx-audio TTS), generates one
//   scenario per spec entry (scenario → injects → template media for every inject, a bounded
//   number of AI stills and voice clips), exports the PDF set and a ZIP per scenario to
//   <out>/exports/<key>/ and writes review material (summary, scenario, injects, documents)
//   to <out>/review/<key>/. <out>/state.json maps scenario keys to ids so a key can be
//   regenerated alone (--only key --replace). Needs `pnpm build:app` first.
// package: copies <out>/project to examples/<id>/project without index.sqlite*, .cache, job
//   or log files, provider ids and absolute paths, keeps only the most useful rendered PNGs
//   and at most two AI stills per scenario within the git media budget (6 MB), drops audio,
//   video and PDFs from the project (the full set stays in <out>), and writes
//   examples/<id>/example.json.
// verify: copies examples/<id>/project to a temp folder, opens it in the built app, rebuilds
//   the index and checks that every scenario, inject and kept asset loads.
import { _electron as electron } from '@playwright/test'
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
import pngjs from 'pngjs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { PNG } = pngjs
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
  const args = { command, only: [], replace: false }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--spec') args.spec = rest[++i]
    else if (a === '--out') args.out = rest[++i]
    else if (a === '--only') args.only = rest[++i].split(',').map((s) => s.trim())
    else if (a === '--replace') args.replace = true
    else throw new Error(`Unknown argument ${a}`)
  }
  if (!['generate', 'package', 'verify'].includes(command ?? ''))
    throw new Error(
      'Usage: make-example.mjs generate|package|verify --spec <build.json> [--out <dir>]',
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
    args: [join(ROOT, 'out/main/index.js')],
    env: { ...process.env, TTX_USER_DATA: userData, TTX_HEADLESS: '1', NODE_ENV: 'test' },
  })
  const page = await app.firstWindow()
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
  const dir = resolve(ROOT, spec.documents.dir)
  const exclude = new Set(spec.documents.exclude ?? [])
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !exclude.has(f))
    .sort()
    .map((f) => join(dir, f))
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
  const files = documentFiles(spec)
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

async function generateOne(invoke, spec, out, projectPath, entry, state) {
  const previous = state.scenarios[entry.key]
  if (previous) {
    log(`deleting the previous "${entry.key}" scenario ${previous.scenarioId}`)
    await invoke('scenarios:delete', { projectPath, scenarioId: previous.scenarioId })
  }
  const t0 = Date.now()
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
  const scenarioSecs = Math.round((Date.now() - t0) / 1000)
  const t1 = Date.now()
  const injectJob = await invoke('generate:injects', { projectPath, scenarioId })
  await waitForJob(invoke, injectJob.jobId, `injects ${entry.key}`, 60 * 60_000)
  const injectSecs = Math.round((Date.now() - t1) / 1000)
  let injects = await invoke('injects:list', { projectPath, scenarioId })
  const t2 = Date.now()
  await renderMedia(invoke, projectPath, scenarioId, injects, spec.media ?? {})
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

// ---- package -----------------------------------------------------------------------------------

/** Files and folders of a generated project that never ship: derived, transient, or local. */
function isDerived(rel) {
  const top = rel.split('/')[0]
  return (
    top === '.cache' ||
    top === 'index.sqlite' ||
    top.startsWith('index.sqlite-') ||
    top === 'jobs.json' ||
    top === '.gitignore' ||
    /(^|\/)(?:jobs?|logs?)\.(?:json|jsonl|log)$/.test(rel) ||
    /(^|\/)[^/]+\.log$/.test(rel)
  )
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
function scrub(value, absolute) {
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

/** Templates render at 2×; the bundled copy is 1× (each pixel the mean of a 2×2 block). */
function shippedPng(buffer) {
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
 * Which assets each scenario keeps in git: rendered/composite PNGs in MSEL order by tag
 * priority, at most two composites with an AI still, round-robin across scenarios until the
 * budget is spent. Returns the shipped (1×) image per kept asset id.
 */
function chooseAssets(projectDir, scenarios) {
  const queues = scenarios.map(({ scenario, injects }) => {
    const order = new Map(scenario.msel.map((r, i) => [r.id, i]))
    const rank = (inj) => {
      const row = scenario.msel.find((r) => r.id === inj.mselRowId)
      const p = TAG_PRIORITY.indexOf(row?.purposeTag ?? '')
      return (p === -1 ? TAG_PRIORITY.length : p) * 1000 + (order.get(inj.mselRowId) ?? 999)
    }
    const sorted = [...injects].sort((a, b) => rank(a) - rank(b))
    let stills = 0
    const queue = []
    for (const inj of sorted)
      for (const a of inj.assets.filter(KEEP_ASSET)) {
        if (a.role === 'composite') {
          if (stills >= 2) continue
          stills++
        }
        queue.push(a)
      }
    return queue
  })
  const kept = new Map()
  let total = 0
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

function packageProject(spec, out) {
  const state = readState(out)
  if (!state.projectPath) throw new Error('package: nothing generated in ' + out)
  const src = join(out, state.projectPath)
  const ids = spec.scenarios.map((s) => state.scenarios[s.key]?.scenarioId).filter(Boolean)
  if (ids.length !== spec.scenarios.length)
    throw new Error('package: every scenario in the spec must be generated first')
  const dest = join(exampleDir(spec), 'project')
  rmSync(dest, { recursive: true, force: true })
  const bundles = scenarioBundles(src, ids)
  const { kept, total } = chooseAssets(src, bundles)
  const absolute = [src, out, ROOT, homedir()]
  let files = 0
  const shipped = new Set(ids)
  for (const rel of walk(src)) {
    if (isDerived(rel)) continue
    const scenarioOf = /^scenarios\/([^/]+)\//.exec(rel)?.[1]
    if (scenarioOf && !shipped.has(scenarioOf)) continue
    const mediaId = /\/media\/[^/]+\/([^/]+)\.[a-z0-9]+$/.exec(rel)?.[1]
    if (rel.includes('/media/') && !(mediaId && kept.has(mediaId))) continue
    const target = join(dest, rel)
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
        .map((a) => ({ ...a, width: kept.get(a.id).width, height: kept.get(a.id).height }))
      writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
    }
  writeFileSync(
    join(dest, '.gitignore'),
    ['index.sqlite', 'index.sqlite-*', '.cache/', ''].join('\n'),
  )
  return { files, kept: kept.size, mediaBytes: total, bundles }
}

function writeManifest(spec, out, bundles) {
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
  writeJson(join(exampleDir(spec), 'example.json'), manifest)
  return manifest
}

function packageExample(args) {
  const spec = loadSpec(args.spec)
  const out = resolve(args.out ?? join(ROOT, '.tmp/examples-release', spec.id))
  const { files, kept, mediaBytes, bundles } = packageProject(spec, out)
  const manifest = writeManifest(spec, out, bundles)
  log(
    `packaged examples/${spec.id}: ${files} files, ${kept} media assets, ` +
      `${(mediaBytes / 1024 / 1024).toFixed(2)} MB media, ${manifest.scenarios.length} scenarios`,
  )
}

// ---- verify ------------------------------------------------------------------------------------

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
    for (const s of manifest.scenarios) {
      const scenario = await invoke('scenarios:get', { projectPath: copy, scenarioId: s.id })
      const injects = await invoke('injects:list', { projectPath: copy, scenarioId: s.id })
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
  } finally {
    await app.close()
    rmSync(parentDir, { recursive: true, force: true })
  }
}

// ---- main --------------------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2))
const run = { generate, package: packageExample, verify }[args.command]
Promise.resolve()
  .then(() => run(args))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
