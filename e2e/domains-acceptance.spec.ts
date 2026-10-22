// Domain-profile acceptance (#156, ADR-0014): build a project from each new fictional document
// set with the matching profile in the built app against the real local stack — LM Studio
// (text), ComfyUI SDXL (photos), mlx-audio (TTS) — generate a scenario of the requested
// threat family, expand the injects, render a bounded slice of the media, and check that
// no airport vocabulary leaks, that facility identifiers come from the project's documents,
// and that the tag mix and decision point fit the threat family. Opt-in, slow:
//   LIVE=1 pnpm exec playwright test e2e/domains-acceptance.spec.ts
//   DOMAINS=transit,dam,uas,uas-ops   (default: all four)   MEDIA=0 skips image/TTS rendering
//   DOMAINS=water             the City of Millbrook pack (#158) as shipped: water-chem.
//                             The other Millbrook runs (water-ransomware, water-tank,
//                             water-main) are defined below and selectable by id.
//   PROJECT_DIR=<folder>      reuse one project folder across runs (documents imported once;
//                             every run adds its scenario) — how example packs are built
//   EXPORT_DIR=<folder>       after each run, export every target to <folder>/<run>/
// Outputs (summaries, documents, copied media) go to .tmp/domains-acceptance/<run>/ and the
// small review fixtures to tests/fixtures/domains/<run>/ (or the run's fixtureDir) when
// SAVE_FIXTURES=1.
import { expect, test } from '@playwright/test'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { invoker, launch, mdFiles, waitForJob } from './helpers'

test.skip(!process.env.LIVE, 'Live domain acceptance runs only with LIVE=1')
test.setTimeout(90 * 60_000)

const OUT = resolve('.tmp/domains-acceptance')
const FIXTURES = resolve('tests/fixtures/domains')
/** Group names that stand for several runs. */
const GROUPS: Record<string, string[]> = {
  water: ['water-chem'],
}
const WANT = (process.env.DOMAINS ?? 'transit,dam,uas,uas-ops')
  .split(',')
  .map((s) => s.trim())
  .flatMap((s) => GROUPS[s] ?? [s])
const MEDIA = process.env.MEDIA !== '0'
const PROJECT_DIR = process.env.PROJECT_DIR ? resolve(process.env.PROJECT_DIR) : undefined
const EXPORT_DIR = process.env.EXPORT_DIR ? resolve(process.env.EXPORT_DIR) : undefined
const EXPORT_TARGETS = [
  'msel_pdf',
  'deck_pdf',
  'handbook_pdf',
  'briefing_pdf',
  'exercise_plan_pdf',
  'media',
  'json',
  'markdown',
  'docx',
  'zip',
]
/** Airport words that must not appear unless the project's own documents use them. */
const AIRPORT_WORDS =
  /\b(?:runways?|taxiways?|concourses?|FIDS|AODB|BHS|TSA|airlines?|airport|terminal building|gate agents?|jet ?bridge|flights?)\b/gi

interface Run {
  id: string
  dir: string
  /** Files in `dir` that are not project documents (a sources list). */
  exclude?: string[]
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
  /** Where SAVE_FIXTURES writes this run (relative to tests/fixtures/domains); default: id. */
  fixtureDir?: string
}

/** The City of Millbrook pack (#158): one organization, four threat families. */
const MILLBROOK = {
  dir: 'reference/city-water',
  exclude: ['SOURCES.md'],
  orgType: 'water_utility',
  name: 'City of Millbrook Water',
  orgName: 'City of Millbrook Department of Water & Sewer',
  city: 'Millbrook',
  region: 'Carver County, Ohio',
  aliases: {
    org: 'City of Millbrook Department of Water & Sewer',
    orgShort: 'Millbrook DWS',
    orgDomain: 'millbrook-oh.example',
    localTv: 'Channel 4',
    airport: 'Riverside Water Treatment Plant',
  },
  audience: [
    'Water Operations',
    'SCADA / IT',
    'Public Information',
    'Water Quality / Lab',
    'Security',
  ],
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
  {
    // The unmanned-systems pack (#157): the operator's own aircraft, GCS and links.
    id: 'uas-ops',
    dir: 'reference/uas-ops',
    exclude: ['SOURCES.md'],
    orgType: 'unmanned_systems',
    name: 'Harwick UAS Operations Group',
    orgName: 'Harwick UAS Operations Group',
    city: 'Harwick',
    region: 'Calder County, New York',
    aliases: {
      org: 'Harwick UAS Operations Group',
      orgShort: 'HUOG',
      orgDomain: 'huog.example',
      localTv: 'Channel 10',
      airport: 'Horton Field',
    },
    threatFamily: 'cyber_physical',
    userPrompt:
      "A multispectral sensor campaign at the Lakeshore Flight Area of the Birch Hollow Range (UAS-01 with PL-01, UAS-11 with PL-03, GCS-01 and GCS-02, RTK-1) is disrupted by a C2-link hijack and GNSS spoofing: UAS-11's 915 MHz telemetry shows a second ground station, the aircraft execute waypoints nobody loaded, RTK-1 and the aircraft lose fix together under a clear sky, and the home point moves. The crew must land in attitude mode, preserve the GCS state, decide whether to call HWK Tower, re-key the links, work with CCSO and the managed security provider, and tell the CP&L client whether Deliverable D-3 data is intact.",
    audience: [
      'Flight Operations',
      'Systems / Cybersecurity',
      'Aviation Safety',
      'Corporate Communications',
      'Security / CCSO liaison',
    ],
    // ATC, LAANC and Class C airspace are this operator's own vocabulary.
    allowedWords: ['flight', 'flights', 'airport'],
    expectIdentifiers:
      /\bUAS-(?:0\d|1[0-2])\b|\bGCS-0[1-6]\b|\bRTK-[12]\b|\bPL-0[1-7]\b|HUOG-[A-Z0-9]+|Lakeshore Flight Area|Horton Field|Birch Hollow Range|\b915 MHz\b/,
  },
  {
    ...MILLBROOK,
    id: 'water-chem',
    fixtureDir: 'city-water/chem',
    threatFamily: 'cyber_physical',
    userPrompt:
      'At 02:40 a remote-support session through the DosaTech ScreenBridge agent on MBW-HMI-02 in the Chemical Building raises the Caustic Feed System dose setpoint (NAOH-FC-203) step by step toward 40 mg/L while the single night operator is on rounds; finished-water pH climbs on AIT-302, the hard-wired high-high switch PSH-302 and a grab sample disagree with what the HMI trend shows. Vendor remote access, manual chemical feed, isolating the control network, Ohio EPA notification and the Do Not Drink decision for Zone 1.',
    decisionMustMatch:
      /manual|local control|isolat|disconnect|do not drink|advisory|notif|DDAGW|Ohio EPA/i,
    expectIdentifiers:
      /NAOH-FC-203|MBW-HMI-02|PLC-02|PSH-302|AIT-302|ScreenBridge|Clearwell [12]\b|MBW-JUMP-01|dosatech_svc|CODE CLEARWATER|Zone [123]\b|MBW-FW-01/,
  },
  {
    ...MILLBROOK,
    id: 'water-ransomware',
    fixtureDir: 'city-water/ransomware',
    threatFamily: 'cyber',
    userPrompt:
      'Ransomware detonates on the business network at City Hall on a Monday morning: the billing system MBW-CIS-01, the AMI head-end MBW-AMI-01 and the file server MBW-FS-01 are encrypted and a ransom note names the city. The SCADA domain MBWSCADA trusts the business domain and firewall rule FW-R-17 carries SMB from the engineering workstation to the backup server MBW-BKP-01, so City IT wants to island the control network while the plant decides whether to go to manual operations, customer service loses billing and the outage map, and the mayor asks whether the water is safe.',
    decisionMustMatch: /island|isolat|manual|disconnect|trust|FW-R-17|segment/i,
    expectIdentifiers:
      /MBW-CIS-01|MBW-AMI-01|MBW-FS-01|MBW-BKP-01|FW-R-17|MBWSCADA|MBW-SCADA-SRV0[12]|MBW-EWS-01|PLC-0[1-6]\b|HSP-[123]\b|Clearwell [12]\b|MBW-DC-0[12]|MBW-FW-01/,
  },
  {
    ...MILLBROOK,
    id: 'water-tank',
    fixtureDir: 'city-water/tank',
    threatFamily: 'physical_security',
    userPrompt:
      'On a Saturday night the fence-gate contact ZS-612 at Orchard Standpipe trips and clears twice and CAM-13 shows a figure near the ladder cage; the roof hatch switch ZS-611 has been out of service since 2024 so RTU-02 keeps reporting the hatch closed, the site is not due for a visit until Tuesday, and the outlet chlorine residual AIT-611 drifts down over the following hours. The crew finds the hatch padlock cut. Sampling, isolating the standpipe from Zone 2, police and FBI, Ohio EPA consultation and the precautionary boil-water advisory for the Hilltop area.',
    decisionMustMatch: /boil|advisory|isolat|sampl|police|notif|DDAGW|Ohio EPA/i,
    expectIdentifiers:
      /Orchard Standpipe|ZS-61[12]|CAM-13|AIT-611|RTU-02|Zone 2\b|Hilltop Tank|Orchard Wellfield|Wells? W-[123]\b|LIT-611|DDAGW|MillbrookAlert/,
  },
  {
    ...MILLBROOK,
    id: 'water-main',
    fixtureDir: 'city-water/main',
    threatFamily: 'infrastructure_failure',
    userPrompt:
      'During a July heat wave with demand near 14 MGD the Hilltop Tank radio repeater RP-1 fails at 05:30, so Orchard Standpipe, Northgate and Mill Road telemetry go stale on the HMI and the operators acknowledge the stale-data flags; at 06:10 the 24-inch Hilltop Transmission Main breaks near Summit Drive and Hilltop Tank begins to drain with no remote levels visible. Isolation valves V-2410 and V-2418, Mill Road Booster Station, the Carver County Water District interconnect IC-1, pressure at Millbrook General Hospital, and the boil-water decision for the depressurized part of Zone 2.',
    decisionMustMatch: /boil|advisory|interconnect|IC-1|isolat|valve|manual|mutual aid|OHWARN/i,
    expectIdentifiers:
      /Hilltop Tank|Hilltop Transmission Main|RP-1|V-241[08]|Mill Road Booster Station|IC-1\b|Zone [12]\b|RTU-0[1-4]\b|LIT-60[12]|BP-40[12]|Summit Drive|Northgate (?:Reservoir|Booster Station)|Orchard Wellfield/,
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

type Invoke = ReturnType<typeof invoker>

/** Wait until every document of the project has been parsed and embedded. */
async function waitForDocuments(invoke: Invoke, projectPath: string): Promise<void> {
  await expect
    .poll(
      async () =>
        (await invoke<{ status: string }[]>('documents:list', { projectPath })).every(
          (d) => d.status === 'ok',
        ),
      { timeout: 120_000 },
    )
    .toBe(true)
}

/**
 * A fresh project for the run, or — with PROJECT_DIR — the one shared project folder: created
 * and populated by the first run that needs it, reopened (documents already imported) by the
 * next ones, so one example project carries several scenarios.
 */
async function projectFor(invoke: Invoke, run: Run, files: string[]): Promise<string> {
  if (PROJECT_DIR && existsSync(join(PROJECT_DIR, 'project.json'))) {
    const { path } = await invoke<{ path: string }>('project:open', { path: PROJECT_DIR })
    await waitForDocuments(invoke, path)
    return path
  }
  const parentDir = PROJECT_DIR
    ? resolve(PROJECT_DIR, '..')
    : mkdtempSync(join(tmpdir(), `ttx-dom-${run.id}-`))
  mkdirSync(parentDir, { recursive: true })
  const { path: projectPath } = await invoke<{ path: string }>('project:create', {
    parentDir,
    name: run.name,
    orgName: run.orgName,
    orgType: run.orgType,
  })
  if (PROJECT_DIR && resolve(projectPath) !== PROJECT_DIR)
    throw new Error(`PROJECT_DIR must be ${projectPath} for the name "${run.name}"`)
  await invoke('project:update', {
    path: projectPath,
    patch: { brand: { city: run.city, region: run.region, aliases: run.aliases } },
  })
  await invoke('documents:import', { projectPath, filePaths: files })
  await waitForDocuments(invoke, projectPath)
  return projectPath
}

/** Export every target of the scenario to EXPORT_DIR/<run>/ (the release bundle). */
async function exportAll(invoke: Invoke, run: Run, projectPath: string, scenarioId: string) {
  if (!EXPORT_DIR) return
  const outDir = join(EXPORT_DIR, run.id)
  mkdirSync(outDir, { recursive: true })
  const { jobId } = await invoke<{ jobId: string }>('export:run', {
    projectPath,
    scenarioId,
    outDir,
    targets: EXPORT_TARGETS,
  })
  await waitForJob(invoke, jobId, 20 * 60_000, [5000])
}

for (const run of RUNS.filter((r) => WANT.includes(r.id))) {
  test(`domain acceptance: ${run.id} (${run.orgType} / ${run.threatFamily})`, async () => {
    const out = join(OUT, run.id)
    mkdirSync(join(out, 'media'), { recursive: true })
    const { app, page } = await launch()
    const invoke = invoker(page)
    try {
      const files = mdFiles(run.dir).filter((f) => !run.exclude?.includes(basename(f)))
      const projectPath = await projectFor(invoke, run, files)
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
      await exportAll(invoke, run, projectPath, scenarioId)
      if (process.env.SAVE_FIXTURES === '1') {
        const fixtureDir = join(FIXTURES, run.fixtureDir ?? run.id)
        mkdirSync(fixtureDir, { recursive: true })
        writeFileSync(join(fixtureDir, 'summary.json'), JSON.stringify(summary, null, 2))
        writeFileSync(
          join(fixtureDir, 'msel.md'),
          typeof docs.overview === 'string' ? docs.overview : '',
        )
        writeFileSync(
          join(fixtureDir, 'injects-sample.json'),
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
