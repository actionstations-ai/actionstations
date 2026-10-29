/**
 * Facilitator-facing delivery (spec 0412): turn an MSEL row into a release, stage its media as
 * sealed blobs, and report staging progress. `session.ts` owns the running session; this module
 * works on the small host shape it hands over, so it runs in tests without Electron or a LAN.
 */
import { randomBytes } from 'node:crypto'
import type { LiveClient } from '@shared/live/client'
import type { BlobRef, ClockState, Destination, InjectReleasePayload } from '@shared/live/schemas'
import type { Inject } from '@shared/schemas/inject'
import type { ReleaseSummary, StageStatus } from '@shared/schemas/live'
import type { MselRow, Scenario } from '@shared/schemas/scenario'
import { injectTypeInfo } from '@shared/taxonomy'
import { AppError } from '../lib/errors'
import { loadTemplate } from '../render/templates'
import { getScenario, listInjects } from '../scenario/store'
import { planMedia, stageInject, type StagedMedia } from './assets'
import { captionsFromVoiceLines, injectText, resolveTargets } from './deliver'
import type { Delivery } from './releases'

export interface StageState {
  staged: number
  total: number
  running: boolean
  failed: { injectId: string; reason: string }[]
}

export interface DeliveryHost {
  root: string
  scenarioId: string
  client: Pick<LiveClient, 'putBlob' | 'limits'>
  delivery: Delivery
  stage: StageState
  mediaCache: Map<string, BlobRef>
  clock: () => Promise<ClockState>
  /** The session is still running (staging stops when it ends). */
  alive: () => boolean
  staging: () => void
}

export const emptyStage = (): StageState => ({ staged: 0, total: 0, running: false, failed: [] })

const NO_RESPONSE_TAGS = new Set([
  'NOISE',
  'RED_HERRING',
  'DISTRACTION',
  'TIME_JUMP',
  'END_GAME',
  'ENDEX',
])

/** The purpose-tag default for `expectsResponse` until rows carry their own (spec 0428). */
export const expectsResponse = (row: Pick<MselRow, 'expectedAction' | 'purposeTag'>): boolean =>
  row.expectedAction.trim() !== '' && !NO_RESPONSE_TAGS.has(row.purposeTag)

function formatClock(c: ClockState, now: number): string {
  const running =
    c.runningSince === undefined ? 0 : ((now - c.runningSince) / 60_000) * (c.rate || 1)
  const whole = Math.max(0, Math.floor(c.elapsedMin + Math.max(0, running)))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

const injectFor = (row: MselRow, injects: readonly Inject[]): Inject | undefined =>
  injects.find((i) => i.id === row.injectId) ?? injects.find((i) => i.mselRowId === row.id)

function templateParts(inject: Inject, root: string) {
  try {
    const t = loadTemplate(inject.type, root)
    return {
      schema: t.schema as { properties?: Record<string, { title?: unknown }> },
      slots: t.meta.imageSlots,
    }
  } catch {
    return { schema: {}, slots: [] as string[] }
  }
}

const MEDIA_WORD = { image: 'Image', video: 'Video', audio: 'Audio' } as const

function omittedNote(inject: Inject, staged: StagedMedia): string {
  if (!staged.omitted.length) return ''
  const names = new Set(staged.omitted.map((o) => o.name))
  const kinds = planMedia(inject)
    .filter((p) => names.has(p.name))
    .map((p) => MEDIA_WORD[p.kind])
  return `\n\n${[...new Set(kinds)].join(' and ')} shown on the main screen.`
}

export interface ReleaseRequest {
  rowId: string
  targets?: Destination[]
  showExpected?: boolean
}

function payloadFor(
  host: { scenario: Scenario; root: string },
  row: MselRow,
  inject: Inject | undefined,
  staged: StagedMedia,
  extra: { exerciseTime: string; targets: Destination[] },
): InjectReleasePayload {
  const parts = inject ? templateParts(inject, host.root) : undefined
  const text = inject
    ? injectText(inject, parts!.schema, parts!.slots, row)
    : { headline: row.id, body: row.event, altText: `${row.id}: ${row.event}`.slice(0, 2_000) }
  const captions = inject?.mediaBrief?.voiceLines
    ? captionsFromVoiceLines(
        inject.mediaBrief.voiceLines.map((l) => ({
          text: l.speaker ? `${l.speaker}: ${l.text}` : l.text,
        })),
      )
    : undefined
  const typeId = inject?.type ?? row.format ?? 'note'
  return {
    releaseId: randomBytes(16).toString('base64url'),
    mselRowId: row.id,
    ...(inject ? { injectId: inject.id } : {}),
    title: (inject?.title || row.id).slice(0, 200),
    injectType: (injectTypeInfo(typeId)?.label ?? typeId).slice(0, 60),
    deliveryMode: inject?.deliveryMode ?? 'hand_to_role',
    ...(row.from ? { sender: row.from.slice(0, 120) } : {}),
    text: {
      headline: text.headline.slice(0, 300),
      body: (text.body + (inject ? omittedNote(inject, staged) : '')).slice(0, 20_000),
      altText: text.altText,
    },
    ...(captions ? { captionsVtt: captions } : {}),
    exerciseTime: extra.exerciseTime,
    targets: extra.targets as InjectReleasePayload['targets'],
    media: staged.refs,
    expectsResponse: expectsResponse(row),
  }
}

/** FR-1, FR-4: release a row; a row already out and not withdrawn is not sent twice. */
export async function releaseRow(host: DeliveryHost, req: ReleaseRequest): Promise<ReleaseSummary> {
  const existing = host.delivery.activeFor(req.rowId)
  if (existing) return host.delivery.summary(existing)
  const scenario = await getScenario(host.root, host.scenarioId)
  const row = scenario.msel.find((r) => r.id === req.rowId)
  if (!row) throw new AppError('NOT_FOUND', `No MSEL row ${req.rowId}`)
  const inject = injectFor(row, await listInjects(host.root, host.scenarioId))
  const staged: StagedMedia = inject
    ? await stageInject(stageContext(host), inject)
    : { refs: [], omitted: [] }
  const targets = req.targets ?? resolveTargets(row, inject?.deliveryMode, scenario.roles)
  const payload = payloadFor({ scenario, root: host.root }, row, inject, staged, {
    exerciseTime: formatClock(await host.clock(), Date.now()),
    targets,
  })
  return host.delivery.release(payload, {
    ...(req.showExpected && row.expectedAction.trim()
      ? { expectedAction: row.expectedAction.slice(0, 2_000) }
      : {}),
  })
}

function stageContext(host: DeliveryHost) {
  return {
    root: host.root,
    limits: host.client.limits,
    putBlob: (meta: Parameters<LiveClient['putBlob']>[0], bytes: Uint8Array) =>
      host.client.putBlob(meta, bytes),
    cache: host.mediaCache,
  }
}

/** FR-8: upload every inject's media in the background; releases wait for nothing here. */
export async function stageAll(host: DeliveryHost): Promise<void> {
  const injects = (await listInjects(host.root, host.scenarioId)).filter(
    (i) => planMedia(i).length > 0,
  )
  host.stage = { staged: 0, total: injects.length, running: true, failed: [] }
  host.staging()
  for (const inject of injects) {
    if (!host.alive()) break
    const result = await stageInject(stageContext(host), inject)
    if (result.omitted.length) {
      host.stage.failed.push({ injectId: inject.id, reason: result.omitted[0]!.reason })
    }
    host.stage.staged += 1
    host.staging()
  }
  host.stage.running = false
  host.staging()
}

export const stageStatus = (host: Pick<DeliveryHost, 'stage'>): StageStatus => ({
  ...host.stage,
  failed: host.stage.failed.map((f) => ({ ...f })),
})
