// Mock-provider responders for the inject stages: schema-valid fields per fixture template
// (tests/fixtures/injects/templates) keyed by the type the prompt asks for, plus a test
// resources folder (shipped prompts + fixture templates) and a renderer that writes PNGs.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { ulid } from 'ulid'
import type { InjectTextOutput, MediaAsset, MediaBriefOutput } from '../../../src/shared/schemas'
import type { InjectRenderer } from '../../../src/main/generate/injects/deps'
import type { ChatRequest } from '../../../src/main/providers/types'

export const FIXTURE_TEMPLATES = resolve(import.meta.dirname, 'templates')

/** A resources dir with the real prompts/ and _shared/ but only the fixture templates. */
export function makeTestResources(): string {
  const root = mkdtempSync(join(tmpdir(), 'ttx-inj-res-'))
  cpSync(resolve('prompts'), join(root, 'prompts'), { recursive: true })
  mkdirSync(join(root, 'templates'), { recursive: true })
  cpSync(resolve('templates/_shared'), join(root, 'templates/_shared'), { recursive: true })
  cpSync(FIXTURE_TEMPLATES, join(root, 'templates/injects'), { recursive: true })
  return root
}

export const FIELDS: Record<string, Record<string, unknown>> = {
  tweet: {
    handle: '@TravelGuy99',
    displayName: 'Travel Guy',
    text: 'NCIA is a joke! Boards say Gate A1, app says A12. #Fail #NCIA',
    timestampRel: '4m',
    metrics: { replies: 3, reposts: 12, likes: 45 },
    imageBrief: 'A FIDS screen listing SX 1245 Atlanta Gate A1 next to an empty gate area',
  },
  facebook_post: {
    groupName: 'Lakeport Moms Group',
    authorName: 'Karen S.',
    text: 'My sister works at the airport. ISIS has the control tower! GET OUT NOW!',
    shares: 400,
    reactions: 120,
    imageBrief: 'Blurry phone photo of the control tower from the parking deck',
  },
  helpdesk_ticket: {
    ticketNo: '4492',
    priority: 'Low',
    requester: 'Concourse B Maintenance',
    subject: 'Vending Machines in Concourse B',
    description:
      'The Coke machines at Gate B2 and B6 just spit out all their cans. Is this a cyber thing?',
    status: 'Open',
    assignee: 'IT Helpdesk',
  },
  radio_call: {
    channel: 'Ops 1',
    callsign: 'Parking 3',
    transcript: [
      { speaker: 'Parking 3', text: 'Ops, Parking 3. Fire alarm in the Long Term deck, Level 3.' },
      { speaker: 'Ops', text: 'Copy Parking 3. Fire is en route.' },
    ],
    background: 'vehicle',
  },
  memo: {
    from: 'BHS Control Room (Duty Manager)',
    to: 'Airport Operations Center',
    subject: 'URGENT: BHS CRITICAL FAILURE',
    body: 'The Sortation Allocation Controller is routing all Concourse A bags to Manual Encode.',
    signatureBlock: '— BHS Duty Manager',
  },
  system_log: {
    systemName: 'AODB_SQL_MASTER',
    host: 'AODB_SQL_MASTER',
    ip: '10.66.0.10',
    os: 'Windows Server 2019',
    lines: [
      {
        ts: '10:03:12',
        level: 'WARN',
        msg: "Failed Login: User 'ADMIN' from 192.168.1.55 (OPS_INTERN_03)",
      },
      { ts: '10:03:15', level: 'INFO', msg: "Successful Login: User 'ADMIN' from 192.168.1.55" },
      { ts: '10:04:05', level: 'INFO', msg: "FILE UPLOAD: 'random_gate_generator.ps1'" },
      {
        ts: '10:05:00',
        level: 'CRIT',
        msg: "EXEC: UPDATE flight_schedule SET gate = RAND(), dest = 'PURGATORY'",
      },
    ],
  },
  media_inquiry_phone_slip: {
    to: 'Public Information Officer',
    fromName: 'Assignment Desk',
    outlet: 'Channel 5 News',
    time: '11:45 AM',
    message: 'Going live at Noon with CYBER TERROR AT NCIA. We need a statement NOW.',
    deadline: '12:00 PM',
  },
  fids_board: {
    rows: [
      {
        flight: 'HW 666',
        dest: 'PURGATORY',
        time: 'NOW',
        gate: 'ALL',
        status: 'BOARDING',
        anomaly: true,
      },
      { flight: 'SX 1245', dest: 'ATLANTA', time: '09:40', gate: 'A1', status: 'ON TIME' },
      {
        flight: 'LS 123',
        dest: 'DALLAS',
        time: '10:00',
        gate: 'Z99',
        status: 'CANCELLED',
        anomaly: true,
      },
      { flight: 'PX 455', dest: 'CHICAGO', time: '10:10', gate: 'B4', status: 'ON TIME' },
    ],
    boardStyle: 'led',
  },
  time_jump_card: {
    newTime: '10:00 AM',
    narration: 'We jump forward one hour.',
    worldState: ['20% of flights wrong'],
  },
  startex_card: {
    narration: 'It is 09:00 on a busy Thursday. All systems normal.',
    weather: 'Clear',
  },
  endex_card: { narration: 'ENDEX. Screens restored.', resolution: 'AODB restored from backup' },
}

/** "Inject type: tweet (…" from the rendered user prompt. */
export function typeAskedFor(req: ChatRequest): string {
  const user = req.messages.find((m) => m.role === 'user')?.content ?? ''
  return /Inject type: ([a-z0-9_]+)/.exec(user)?.[1] ?? 'scenario_update'
}

export const rowAskedFor = (req: ChatRequest): string =>
  /- id: (\S+) ·/.exec(req.messages.find((m) => m.role === 'user')?.content ?? '')?.[1] ?? '?'

export const isRepair = (req: ChatRequest): boolean => (req.system ?? '').includes('REPAIR:')

/** Valid fields for the asked type; free-form text for types without a fixture template. */
export function injectTextResponder(req: ChatRequest): InjectTextOutput {
  const type = typeAskedFor(req)
  const row = rowAskedFor(req)
  return {
    type,
    title: `${row} ${type}`,
    deliveryMode: 'hand_to_role',
    fields: FIELDS[type] ?? { narration: `Free text for ${row}` },
    instructorNote: `Watch ${row}.`,
    citations: ['C1'],
  }
}

export function mediaBriefResponder(req: ChatRequest): MediaBriefOutput {
  const user = req.messages.find((m) => m.role === 'user')?.content ?? ''
  const paths = (/PLAN \(fixed\): paths ([^.\n]+)\./.exec(user)?.[1] ?? 'template')
    .split(/,\s*/)
    .map((p) => p.trim()) as MediaBriefOutput['paths']
  const out: MediaBriefOutput = { paths }
  if (paths.includes('ai_image') || paths.includes('ai_video')) {
    out.imagePrompt =
      'Phone snapshot inside a busy airport concourse, crowd of travellers looking up at dark powered-off departure screens, no readable text, no logos, late morning light'
    out.negativePrompt = 'empty terminal'
    out.imageStyle = 'phone'
  }
  if (paths.includes('tts')) {
    out.voiceLines = [
      {
        speaker: 'Parking 3',
        voiceStyle: 'tired male parking supervisor, hurried',
        text: 'Ops, Parking 3. Fire alarm Level 3.',
      },
      {
        speaker: 'Ops',
        voiceStyle: 'calm female dispatcher in her 40s',
        text: 'Copy. Fire is en route.',
      },
    ]
    out.postFx = ['radio']
  }
  return out
}

/** Stands in for render/inject.ts renderInjectAssets: writes a small PNG (and a PDF stub for
 *  paper types) without Electron, composite when a slot asset is present. */
export const fakeRenderer: InjectRenderer = async (root, scenarioId, inject) => {
  const dir = join(root, 'scenarios', scenarioId, 'media', inject.id)
  mkdirSync(dir, { recursive: true })
  const slotted = inject.assets.find((a) => a.role === 'generated' && a.kind === 'image')
  const png = new PNG({ width: 4, height: 4 })
  png.data.fill(slotted ? 0x40 : 0xc0)
  const role = slotted ? 'composite' : 'rendered'
  const provenance = {
    provider: 'template',
    templateId: inject.type,
    templateVersion: '1',
    createdAt: new Date().toISOString(),
  }
  const id = ulid()
  writeFileSync(join(dir, `${id}.png`), PNG.sync.write(png))
  const assets: MediaAsset[] = [
    {
      id,
      kind: 'image',
      role,
      path: `scenarios/${scenarioId}/media/${inject.id}/${id}.png`,
      width: 8,
      height: 8,
      provenance,
    },
  ]
  const t = JSON.parse(readFileSync(join(FIXTURE_TEMPLATES, inject.type, 'meta.json'), 'utf8')) as {
    paper?: boolean
  }
  if (t.paper) {
    const pid = ulid()
    writeFileSync(join(dir, `${pid}.pdf`), '%PDF-1.4 stub')
    assets.push({
      id: pid,
      kind: 'pdf',
      role,
      path: `scenarios/${scenarioId}/media/${inject.id}/${pid}.pdf`,
      provenance,
    })
  }
  const old = inject.assets.filter((a) => a.role === 'rendered' || a.role === 'composite')
  for (const a of old) rmSync(join(root, a.path), { force: true })
  const kept = inject.assets.filter((a) => !old.includes(a))
  return { inject: { ...inject, assets: [...kept, ...assets] }, assets }
}
