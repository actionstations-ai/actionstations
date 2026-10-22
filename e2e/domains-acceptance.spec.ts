// Domain-profile acceptance (#156, ADR-0014): build a project from each new fictional document
// set with the matching profile in the built app against the real local stack — LM Studio
// (text), ComfyUI SDXL (photos), mlx-audio (TTS) — generate a scenario of the requested
// threat family, expand the injects, render a bounded slice of the media, and check that
// no airport vocabulary leaks, that facility identifiers come from the project's documents,
// and that the tag mix and decision point fit the threat family. Opt-in, slow:
//   LIVE=1 pnpm exec playwright test e2e/domains-acceptance.spec.ts
//   DOMAINS=transit,dam,uas   (default: all three)   MEDIA=0 skips image/TTS rendering
// Outputs (summaries, documents, copied media) go to .tmp/domains-acceptance/<run>/ and the
// small review fixtures to tests/fixtures/domains/<run>/ when SAVE_FIXTURES=1.
import { expect, test } from '@playwright/test'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { invoker, launch, mdFiles, waitForJob } from './helpers'

test.skip(!process.env.LIVE, 'Live domain acceptance runs only with LIVE=1')
test.setTimeout(90 * 60_000)

const OUT = resolve('.tmp/domains-acceptance')
const FIXTURES = resolve('tests/fixtures/domains')
const WANT = (process.env.DOMAINS ?? 'transit,dam,uas').split(',').map((s) => s.trim())
const MEDIA = process.env.MEDIA !== '0'
/** Airport words that must not appear unless the project's own documents use them. */
const AIRPORT_WORDS =
  /\b(?:runways?|taxiways?|concourses?|FIDS|AODB|BHS|TSA|airlines?|airport|terminal building|gate agents?|jet ?bridge|flights?)\b/gi

interface Run {
  id: string
  dir: string
  orgType: string
  name: string
  orgName: string
  city: string
  region: string
  aliases: Record<string, string>
  threatFamily: string
  userPrompt: string
  audience: string[]
  /** What the decision point must involve (a regex over event + expected action). */
  decisionMustMatch?: RegExp
  /** Identifier regex that generated rows should use (from the documents). */
  expectIdentifiers: RegExp
  /** Airport-list words that are this scenario's own vocabulary ("flights" of a drone). */
  allowedWords?: string[]
}

const RUNS: Run[] = [
  {
    id: 'transit',
    dir: 'reference/transit',
    orgType: 'transit',
    name: 'Riverbend Regional Transit Authority',
    orgName: 'Riverbend Regional Transit Authority',
    city: 'Riverbend',
    region: 'Harlan County, Ohio',
    aliases: {
      org: 'Riverbend Regional Transit Authority',
      orgShort: 'RRTA',
      orgDomain: 'rrta.example',
      localTv: 'Channel 8',
    },
    threatFamily: 'cyber_physical',
    userPrompt:
      'The CAD/AVL dispatch system is compromised through the integrator VPN: vehicle positions and run assignments are falsified, buses are dispatched to wrong routes and the rider app shows ghost buses, while the OCC must fall back to voice dispatch.',
    audience: [
      'Operations / OCC',
      'IT/OT',
      'Communications',
      'Transit Police',
      'Fleet Maintenance',
    ],
    expectIdentifiers:
      /\bRoute \d{1,2}\b|\bBus \d{4}\b|\b(?:Blue|Green) Line\b|Northside Depot|RRTA-[A-Z]+-[A-Z0-9]+/,
  },
  {
    id: 'dam',
    dir: 'reference/dam',
    orgType: 'water_dam',
    name: 'Cedar Ridge Dam',
    orgName: 'Cedar Valley Water Authority',
    city: 'Milford',
    region: 'Pike County, Ohio',
    aliases: {
      org: 'Cedar Valley Water Authority',
      orgShort: 'CVWA',
      orgDomain: 'cvwa.example',
      localTv: 'Channel 12',
      airport: 'Cedar Ridge Dam',
    },
    threatFamily: 'physical_security',
    userPrompt:
      'A cut fence and a tailgated door at the spillway hoist house during a night with the on-call operator off site; the intruder reaches the gate PLC cabinet, and SCADA then reports a spillway gate opening that no one commanded. Physical security and SCADA integrity together.',
    audience: [
      'Dam Operations',
      'SCADA / IT',
      'Public Affairs',
      'Security',
      'Dam Safety Engineering',
      'County EMA',
    ],
    expectIdentifiers:
      /\bSpillway Gates? \d\b|\bRTU-0\d\b|\bPLC-[12]\b|\bUnit [12]\b|\bZone [ABC]\b|CRD-[A-Z]+-[A-Z0-9]+|Door P-\d/,
  },
  {
    id: 'uas',
    dir: 'reference/dam',
    orgType: 'water_dam',
    name: 'Cedar Ridge Dam (UAS)',
    orgName: 'Cedar Valley Water Authority',
    city: 'Milford',
    region: 'Pike County, Ohio',
    aliases: {
      org: 'Cedar Valley Water Authority',
      orgShort: 'CVWA',
      orgDomain: 'cvwa.example',
      localTv: 'Channel 12',
      airport: 'Cedar Ridge Dam',
    },
    threatFamily: 'uas_drone',
    userPrompt:
      'A private drone repeatedly overflies the crest and the spillway gates during a weekend with the public overlook and boat ramp full of visitors; the AeroSentry detection system shows a Remote ID track and an operator estimate near the boat ramp. Staff may not interfere with the aircraft and must work with the Sheriff and the FAA.',
    audience: ['Dam Operations', 'Security', 'Public Affairs', 'SCADA / IT', 'County EMA'],
    decisionMustMatch: /law enforcement|police|sheriff|FAA|airspace|deput/i,
    allowedWords: ['flight', 'flights'],
    expectIdentifiers:
      /\bSpillway Gates? \d\b|\bRTU-0\d\b|CAM-\d\d|AeroSentry|boat ramp|Zone [ABC]\b/i,
  },
]

interface Row {
  id: string
  from: string
  event: string
  expectedAction: string
  purposeTag: string
  format?: string
  phaseId: string
}
interface Warning {
  code: string
  severity: string
  message: string
  rowId?: string
}
interface Scenario {
  id: string
  title: string
  brief: { threatFamily?: string }
  overview?: { threat: string; location: string }
  roles: { id: string; name: string }[]
  phases: { id: string; title: string; goal: string }[]
  msel: Row[]
  warnings: Warning[]
  status: string
}
interface Asset {
  id: string
  kind: string
  role: string
  path: string
}
interface Inject {
  id: string
  mselRowId: string
  type: string
  title: string
  fields: Record<string, unknown>
  mediaBrief?: { paths: string[]; imagePrompt?: string }
  assets: Asset[]
}

const strings = (v: unknown): string[] =>
  typeof v === 'string'
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(strings)
      : v && typeof v === 'object'
        ? Object.values(v).flatMap(strings)
        : []

/** Airport words in `text` that the run's own documents never use. */
function leaks(text: string, documentsText: string, extra: string[] = []): string[] {
  const allowed = new Set([
    ...(documentsText.match(AIRPORT_WORDS) ?? []).map((w) => w.toLowerCase()),
    ...extra,
  ])
  return [...new Set((text.match(AIRPORT_WORDS) ?? []).map((w) => w.toLowerCase()))].filter(
    (w) => !allowed.has(w),
  )
}

for (const run of RUNS.filter((r) => WANT.includes(r.id))) {
  test(`domain acceptance: ${run.id} (${run.orgType} / ${run.threatFamily})`, async () => {
    const out = join(OUT, run.id)
    mkdirSync(join(out, 'media'), { recursive: true })
    const { app, page } = await launch()
    const invoke = invoker(page)
    try {
      const parentDir = mkdtempSync(join(tmpdir(), `ttx-dom-${run.id}-`))
      const { path: projectPath } = await invoke<{ path: string }>('project:create', {
        parentDir,
        name: run.name,
        orgName: run.orgName,
        orgType: run.orgType,
      })
      await invoke('project:update', {
        path: projectPath,
        patch: { brand: { city: run.city, region: run.region, aliases: run.aliases } },
      })
      const files = mdFiles(run.dir)
      await invoke('documents:import', { projectPath, filePaths: files })
      await expect
        .poll(
          async () =>
            (await invoke<{ status: string }[]>('documents:list', { projectPath })).every(
              (d) => d.status === 'ok',
            ),
          { timeout: 120_000 },
        )
        .toBe(true)
      const documentsText = files.map((f) => readFileSync(f, 'utf8')).join('\n')

      const lm = await invoke<{ id: string }>('providers:upsert', {
        config: {
          kind: 'openai-compatible',
          label: 'LM Studio',
          baseUrl: 'http://127.0.0.1:1234/v1',
          defaultModel: 'qwen3-30b-a3b-2507',
          options: {},
          enabled: true,
        },
      })
      const routing: Record<string, { providerId: string }> = {
        ideate: { providerId: lm.id },
        draft: { providerId: lm.id },
        critique: { providerId: lm.id },
      }
      if (MEDIA) {
        const comfy = await invoke<{ id: string }>('providers:upsert', {
          config: {
            kind: 'comfyui',
            label: 'ComfyUI',
            baseUrl: 'http://127.0.0.1:8188',
            options: {},
            enabled: true,
          },
        })
        const tts = await invoke<{ id: string }>('providers:upsert', {
          config: {
            kind: 'openai-compatible',
            label: 'Local TTS (mlx-audio)',
            baseUrl: 'http://127.0.0.1:8765',
            defaultModel: 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16',
            options: { ttsModel: 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16' },
            enabled: true,
          },
        })
        Object.assign(routing, {
          image: { providerId: comfy.id },
          video: { providerId: comfy.id },
          audio: { providerId: tts.id },
        })
      }
      await invoke('routing:set', { scope: 'global', routing })

      // ---- facility facts the profile extracted
      const facts = await invoke<{
        categories: { id: string; label: string; entries: string[] }[]
      }>('project:facility-facts', { path: projectPath })
      writeFileSync(join(out, 'facility-facts.json'), JSON.stringify(facts.categories, null, 2))
      expect(facts.categories.some((c) => c.id === 'runways')).toBe(false)

      // ---- scenario
      const t0 = Date.now()
      const { jobId, scenarioId } = await invoke<{ jobId: string; scenarioId: string }>(
        'generate:scenario',
        {
          projectPath,
          brief: {
            userPrompt: run.userPrompt,
            audience: run.audience,
            durationHours: 4,
            phaseCount: 4,
            learningObjectives: [],
            constraints: [],
            startWallClock: '09:00',
            threatFamily: run.threatFamily,
          },
        },
      )
      const job = await waitForJob(invoke, jobId, 40 * 60_000, [5000])
      const scenarioSecs = Math.round((Date.now() - t0) / 1000)
      const s = await invoke<Scenario>('scenarios:get', { projectPath, scenarioId })
      const docs: Record<string, string> = {}
      for (const kind of ['overview', 'handbook', 'briefing', 'hotwash'] as const) {
        docs[kind] = (
          await invoke<{ markdown: string }>('scenarios:doc-get', { projectPath, scenarioId, kind })
        ).markdown
      }
      const lints = await invoke<Warning[]>('scenarios:lint', { projectPath, scenarioId })

      // ---- injects (text) and a bounded media slice
      const t1 = Date.now()
      await waitForJob(
        invoke,
        (await invoke<{ jobId: string }>('generate:injects', { projectPath, scenarioId })).jobId,
        40 * 60_000,
        [5000],
      )
      const injectSecs = Math.round((Date.now() - t1) / 1000)
      let injects = await invoke<Inject[]>('injects:list', { projectPath, scenarioId })
      let mediaSecs = 0
      if (MEDIA) {
        const photoIds = injects
          .filter(
            (i) => i.mediaBrief?.paths.includes('ai_image') || i.mediaBrief?.paths.includes('tts'),
          )
          .slice(0, 4)
          .map((i) => i.id)
        const templateIds = injects.filter((i) => !photoIds.includes(i.id)).map((i) => i.id)
        const t2 = Date.now()
        if (templateIds.length)
          await waitForJob(
            invoke,
            (
              await invoke<{ jobId: string }>('generate:media', {
                projectPath,
                scenarioId,
                injectIds: templateIds,
                paths: ['template'],
              })
            ).jobId,
            30 * 60_000,
            [5000],
          )
        if (photoIds.length)
          await waitForJob(
            invoke,
            (
              await invoke<{ jobId: string }>('generate:media', {
                projectPath,
                scenarioId,
                injectIds: photoIds,
              })
            ).jobId,
            30 * 60_000,
            [5000],
          )
        mediaSecs = Math.round((Date.now() - t2) / 1000)
        injects = await invoke<Inject[]>('injects:list', { projectPath, scenarioId })
        for (const inj of injects) {
          for (const a of inj.assets) {
            try {
              copyFileSync(
                join(projectPath, a.path),
                join(out, 'media', `${inj.mselRowId}-${inj.type}-${a.role}-${basename(a.path)}`),
              )
            } catch {
              // a missing file is reported through the assets list, not the copy
            }
          }
        }
      }

      // ---- measurements
      const mselText = s.msel.map((r) => `${r.from} ${r.event} ${r.expectedAction}`).join('\n')
      const injectText = injects.map((i) => [i.title, ...strings(i.fields)].join('\n')).join('\n')
      const docText = Object.values(docs).join('\n')
      const promptText = injects.map((i) => i.mediaBrief?.imagePrompt ?? '').join('\n')
      const mselLeaks = leaks(mselText, documentsText, run.allowedWords)
      const injectLeaks = leaks(injectText, documentsText, run.allowedWords)
      const docLeaks = leaks(docText, documentsText, run.allowedWords)
      const promptLeaks = leaks(promptText, documentsText, run.allowedWords)
      const rowsWithIds = s.msel.filter((r) =>
        run.expectIdentifiers.test(`${r.event} ${r.expectedAction}`),
      ).length
      const byCode = (ws: Warning[]) =>
        ws.reduce<Record<string, number>>((m, w) => ({ ...m, [w.code]: (m[w.code] ?? 0) + 1 }), {})
      const dps = s.msel.filter((r) => r.purposeTag === 'DECISION_POINT')
      const tags = s.msel.reduce<Record<string, number>>(
        (m, r) => ({ ...m, [r.purposeTag]: (m[r.purposeTag] ?? 0) + 1 }),
        {},
      )
      const summary = {
        run: run.id,
        orgType: run.orgType,
        threatFamily: s.brief.threatFamily,
        title: s.title,
        threat: s.overview?.threat,
        location: s.overview?.location,
        roles: s.roles.map((r) => `${r.id}: ${r.name}`),
        phases: s.phases.map((p) => p.title),
        rows: s.msel.length,
        rowsWithDocumentIdentifiers: rowsWithIds,
        tags,
        decisionPoints: dps.map((r) => `${r.id}: ${r.event.slice(0, 120)}`),
        lintCodes: byCode(lints),
        warningCodes: byCode(s.warnings),
        critiqueCount: s.warnings.filter((w) => w.code === 'CRITIQUE').length,
        facilityUnknown: lints.filter((w) => w.code === 'FACILITY_UNKNOWN_ID').length,
        leaks: {
          msel: mselLeaks,
          injects: injectLeaks,
          documents: docLeaks,
          imagePrompts: promptLeaks,
        },
        injectTypes: injects.map((i) => `${i.mselRowId}: ${i.type}`),
        assets: {
          rendered: injects
            .flatMap((i) => i.assets)
            .filter((a) => a.role === 'rendered' || a.role === 'composite').length,
          aiImages: injects
            .flatMap((i) => i.assets)
            .filter((a) => a.role === 'generated' && a.kind === 'image').length,
          audio: injects.flatMap((i) => i.assets).filter((a) => a.kind === 'audio').length,
        },
        timing: { scenarioSecs, injectSecs, mediaSecs, job: job.status },
        facilityCategories: facts.categories
          .filter((c) => c.entries.length)
          .map((c) => `${c.label}: ${c.entries.length}`),
      }
      console.log(JSON.stringify(summary, null, 2))
      writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2))
      writeFileSync(join(out, 'scenario.json'), JSON.stringify(s, null, 2))
      writeFileSync(join(out, 'injects.json'), JSON.stringify(injects, null, 2))
      for (const [k, md] of Object.entries(docs))
        writeFileSync(join(out, `${k}.md`), typeof md === 'string' ? md : JSON.stringify(md))
      if (process.env.SAVE_FIXTURES === '1') {
        mkdirSync(join(FIXTURES, run.id), { recursive: true })
        writeFileSync(join(FIXTURES, run.id, 'summary.json'), JSON.stringify(summary, null, 2))
        writeFileSync(
          join(FIXTURES, run.id, 'msel.md'),
          typeof docs.overview === 'string' ? docs.overview : '',
        )
        writeFileSync(
          join(FIXTURES, run.id, 'injects-sample.json'),
          JSON.stringify(
            injects.slice(0, 6).map((i) => ({
              row: i.mselRowId,
              type: i.type,
              title: i.title,
              fields: i.fields,
              imagePrompt: i.mediaBrief?.imagePrompt,
            })),
            null,
            2,
          ),
        )
      }

      // ---- the acceptance criteria
      expect(s.brief.threatFamily).toBe(run.threatFamily)
      expect(s.msel.length).toBeGreaterThanOrEqual(20)
      expect(mselLeaks, `airport words in the MSEL: ${mselLeaks.join(', ')}`).toEqual([])
      expect(docLeaks, `airport words in the documents: ${docLeaks.join(', ')}`).toEqual([])
      expect(
        injectLeaks.length,
        `airport words in injects: ${injectLeaks.join(', ')}`,
      ).toBeLessThanOrEqual(1)
      expect(promptLeaks, `airport words in image prompts: ${promptLeaks.join(', ')}`).toEqual([])
      expect(rowsWithIds, 'rows using identifiers from the documents').toBeGreaterThanOrEqual(6)
      expect(dps.length).toBeGreaterThanOrEqual(1)
      if (run.decisionMustMatch)
        expect(
          dps.some((r) => run.decisionMustMatch!.test(`${r.event}\n${r.expectedAction}`)),
        ).toBe(true)
      expect(lints.filter((w) => w.severity === 'error')).toEqual([])
      expect(
        lints.filter(
          (w) =>
            w.code.startsWith('MIX_') ||
            w.code === 'NO_DECISION_POINT' ||
            w.code === 'DECISION_POINT_SCOPE',
        ).length,
      ).toBeLessThanOrEqual(3)
      // The injects job tolerates a failed row (recorded on the scenario); one is acceptable here.
      expect(injects.length).toBeGreaterThanOrEqual(s.msel.length - 1)
      expect(injects.some((i) => i.type === 'fids_board' || i.type === 'bhs_scada_screen')).toBe(
        false,
      )
      if (MEDIA) expect(summary.assets.rendered).toBeGreaterThan(0)
    } finally {
      await app.close()
    }
  })
}
