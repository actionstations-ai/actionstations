// View models for the export templates: plain data derived from the scenario, injects and
// documents. All strings stay raw here; the templates escape them.
import { pathToFileURL } from 'node:url'
import { capabilityName } from '@shared/core-capabilities'
import { mediaUrl } from '@shared/media-url'
import type { Inject, MediaAsset, MselRow, Phase, Scenario } from '@shared/schemas'
import { injectTypeInfo, PURPOSE_TAG_INFO, type PurposeTag } from '@shared/taxonomy'
import { safeJoin } from '../lib/fs'
import type { ExportModel } from './model'
import type { PlannedMedia } from './naming'

export type RenderMode = 'pdf' | 'preview'

const TAG_CLASS: Record<PurposeTag, string> = {
  STARTEX: 'control',
  CORE_NARRATIVE: 'core',
  NOISE: 'noise',
  RED_HERRING: 'herring',
  PRESSURE: 'pressure',
  MISINFORMATION: 'misinfo',
  CLUE: 'clue',
  TECH_HURDLE: 'hurdle',
  DECISION_POINT: 'decision',
  OPERATIONAL_FRICTION: 'pressure',
  CONFUSION: 'misinfo',
  DISTRACTION: 'noise',
  TIME_JUMP: 'control',
  END_GAME: 'core',
  ENDEX: 'control',
}

export function tagView(tag: PurposeTag) {
  const info = PURPOSE_TAG_INFO[tag]
  return {
    cls: TAG_CLASS[tag] ?? 'control',
    label: info?.label ?? tag,
    meaning: info?.meaning ?? '',
  }
}

/** "Scenario 3: "Flight to Nowhere"" — the heading every document uses. */
export function scenarioHeading(model: ExportModel): string {
  const { title } = model.scenario
  return /\bscenario\s*\d/i.test(title) ? title : `Scenario ${model.scenarioNo}: "${title}"`
}

export function locationText(s: Scenario): string {
  return s.overview?.location ?? ''
}

export const durationText = (s: Scenario): string =>
  `${s.brief.durationHours} ${s.brief.durationHours === 1 ? 'Hour' : 'Hours'}`

function audienceText(s: Scenario): string {
  return s.overview?.targetAudience || s.brief.audience.join(', ')
}

/** "To" column: the row's label, else its role names, else "All". */
export function toText(row: MselRow, s: Scenario): string {
  if (row.toLabel) return row.toLabel
  const names = row.toRoleIds.map((id) => s.roles.find((r) => r.id === id)?.name ?? id)
  return names.join(', ') || 'All'
}

const citationText = (row: { citations: { headingPath: string }[] }): string =>
  row.citations.map((c) => c.headingPath).join('; ')

/**
 * The row's evaluation reference (#421): the critical task ids that name it and their
 * capabilities ("T-05, T-07 · Operational Coordination"); '' when no task does.
 */
export function evaluationText(s: Scenario, rowId: string): string {
  const tasks = s.evaluation.eegs
    .flatMap((e) => e.criticalTasks)
    .filter((t) => t.rowIds.includes(rowId))
  if (!tasks.length) return ''
  const capabilities = [...new Set(tasks.map((t) => capabilityName(t.capability)))]
  return `${tasks.map((t) => t.id).join(', ')} · ${capabilities.join(', ')}`
}

function phaseHours(p: Phase): string {
  return `(Hour ${p.startTime} – ${p.endTime})`
}

export function phaseHeading(p: Phase): string {
  return `Phase ${p.index + 1}: ${p.title}`
}

export interface Fact {
  label: string
  value: string
}

function facts(entries: [string, string][]): Fact[] {
  return entries.filter(([, v]) => v).map(([label, value]) => ({ label, value }))
}

/** Phases with their rows; rows whose phase is missing land in a trailing group. */
export function groupRows(s: Scenario): { phase: Phase | undefined; rows: MselRow[] }[] {
  const phases = [...s.phases].sort((a, b) => a.index - b.index)
  const groups = phases.map((phase) => ({
    phase: phase as Phase | undefined,
    rows: s.msel.filter((r) => r.phaseId === phase.id),
  }))
  const known = new Set(phases.map((p) => p.id))
  const orphans = s.msel.filter((r) => !known.has(r.phaseId))
  if (orphans.length) groups.push({ phase: undefined, rows: orphans })
  return groups
}

export function mselView(model: ExportModel, prefix: string) {
  const s = model.scenario
  return {
    prefix,
    title: {
      id: `${prefix}msel-title`,
      eyebrow: 'Master Scenario Events List (MSEL)',
      heading: scenarioHeading(model),
      sub: s.subtitle ?? '',
      facts: facts([
        ['Location', locationText(s)],
        ['Duration', durationText(s)],
        ['STARTEX', s.brief.startWallClock ?? ''],
        ['Target audience', audienceText(s)],
      ]),
    },
    overview: s.overview && {
      theme: s.overview.theme,
      threat: s.overview.threat,
      impact: s.overview.operationalImpact,
      sections: s.overview.coreSectionsTested.map((c) => c.headingPath),
    },
    objectives: s.objectives,
    roles: s.roles.map((r) => ({
      name: r.abbreviation ? `${r.name} (${r.abbreviation})` : r.name,
      description: r.description,
    })),
    phases: groupRows(s).map(({ phase, rows }) => ({
      heading: phase ? phaseHeading(phase) : 'Additional events',
      hours: phase ? phaseHours(phase) : '',
      goal: phase?.goal ?? '',
      rows: rows.map((r) => ({
        time: r.time,
        wallClock: r.wallClock ?? '',
        id: r.id,
        from: r.from,
        to: toText(r, s),
        event: r.event,
        expectedAction: r.expectedAction,
        refs: citationText(r),
        evaluation: evaluationText(s, r.id),
        tag: tagView(r.purposeTag),
        rowClass: r.purposeTag === 'DECISION_POINT' ? 'is-decision' : '',
      })),
    })),
  }
}

/** Where an image file is loaded from: file: URL for the PDF window, ttx-media: for preview. */
export function assetSrc(model: ExportModel, relPath: string, mode: RenderMode): string {
  if (mode === 'preview') return mediaUrl(model.root, relPath)
  return pathToFileURL(safeJoin(model.root, relPath)).toString()
}

const latest = <T>(list: T[]): T | undefined => list[list.length - 1]

/** The picture a deck page shows: composite > rendered > generated image > video poster. */
export function primaryImage(inject: Inject, available?: Set<string>): MediaAsset | undefined {
  const images = inject.assets.filter(
    (a) => a.kind === 'image' && (!available || available.has(a.path)),
  )
  return (
    latest(images.filter((a) => a.role === 'composite')) ??
    latest(images.filter((a) => a.role === 'rendered')) ??
    latest(images.filter((a) => a.role === 'generated' || a.role === 'source'))
  )
}

export function deliveryText(inject: Inject | undefined, to: string): string {
  switch (inject?.deliveryMode ?? 'hand_to_role') {
    case 'display_main_screen':
      return 'Display on main screen'
    case 'play_audio':
      return `Play audio for ${to}`
    case 'read_aloud':
      return 'Facilitator reads aloud'
    default:
      return `Hand to ${to}`
  }
}

const formatDuration = (sec: number | undefined): string => {
  if (!sec || sec <= 0) return ''
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function formatLabel(row: MselRow, inject: Inject | undefined): string {
  const type = inject?.type ?? row.format
  return (type && injectTypeInfo(type)?.label) || type || 'Verbal / text inject'
}

function mediaSummary(planned: PlannedMedia[], inject: Inject | undefined): string {
  if (!inject) return 'Text page'
  if (!inject.includeInDeck) return 'Not in deck (turned off)'
  const kinds = new Set(planned.map((p) => p.asset.kind))
  const parts = [
    kinds.has('image') && 'image',
    kinds.has('audio') && 'audio',
    kinds.has('video') && 'video',
  ].filter(Boolean)
  return parts.length ? parts.join(' + ') : 'Text page'
}

export function deckView(model: ExportModel, prefix: string, mode: RenderMode) {
  const s = model.scenario
  const byRow = new Map(model.injects.map((i) => [i.mselRowId, i]))
  const phaseOf = new Map(s.phases.map((p) => [p.id, p]))
  const rows = groupRows(s).flatMap((g) => g.rows)
  const plannedFor = (inject: Inject | undefined) =>
    inject ? model.media.filter((m) => m.inject.id === inject.id) : []

  const index = rows.map((row) => {
    const inject = byRow.get(row.id)
    return {
      time: row.time,
      id: row.id,
      delivery: deliveryText(inject, toText(row, s)),
      tag: tagView(row.purposeTag),
      format: formatLabel(row, inject),
      media: mediaSummary(plannedFor(inject), inject),
      excluded: inject?.includeInDeck === false,
    }
  })

  const pages = rows
    .filter((row) => byRow.get(row.id)?.includeInDeck !== false)
    .map((row) => deckPage(model, row, byRow.get(row.id), plannedFor(byRow.get(row.id)), mode))
    .map((page, i, all) => ({ ...page, phase: phaseLabel(rows, all[i]!.rowId, phaseOf) }))

  return {
    prefix,
    title: {
      id: `${prefix}deck-title`,
      eyebrow: 'Master Inject Deck',
      heading: scenarioHeading(model),
      sub: s.subtitle ?? '',
      facts: facts([
        ['Location', locationText(s)],
        ['Duration', durationText(s)],
        ['Inject pages', String(pages.length)],
      ]),
    },
    index,
    pages,
  }
}

function phaseLabel(rows: MselRow[], rowId: string, phases: Map<string, Phase>): string {
  const row = rows.find((r) => r.id === rowId)
  const phase = row ? phases.get(row.phaseId) : undefined
  return phase ? `${phaseHeading(phase)} ${phaseHours(phase)}` : 'Additional events'
}

function deckPage(
  model: ExportModel,
  row: MselRow,
  inject: Inject | undefined,
  planned: PlannedMedia[],
  mode: RenderMode,
) {
  const s = model.scenario
  const to = toText(row, s)
  const present = planned.filter((p) => model.available.has(p.asset.path))
  const image = inject ? primaryImage(inject, model.available) : undefined
  const video = present.find((p) => p.asset.kind === 'video')
  const audio = present.find((p) => p.asset.kind === 'audio')
  const poster = video?.asset.posterPath
  const imagePath = image?.path ?? (poster && model.available.has(poster) ? poster : undefined)
  const format = formatLabel(row, inject)
  return {
    rowId: row.id,
    id: row.id,
    title: inject?.title || row.event.split(/(?<=[.!?])\s/)[0] || row.id,
    time: row.time,
    wallClock: row.wallClock ?? '',
    delivery: deliveryText(inject, to),
    tag: tagView(row.purposeTag),
    format,
    from: row.from,
    to,
    event: row.event,
    textLabel: inject ? 'Message' : `${format} — message text`,
    image: imagePath && {
      src: assetSrc(model, imagePath, mode),
      alt: `${format} for inject ${row.id}: ${inject?.title ?? row.event}`,
    },
    audio: audio && {
      fileName: audio.fileName,
      mp3Name: audio.mp3Name ?? '',
      duration: formatDuration(audio.asset.durationSec),
    },
    video: video && {
      fileName: video.fileName,
      duration: formatDuration(video.asset.durationSec),
    },
    note: inject?.instructorNote ?? '',
    refs: citationText(inject ?? row),
    expectedAction: row.expectedAction,
    evaluation: evaluationText(s, row.id),
  }
}

export function teamRows(s: Scenario) {
  return s.roles.map((r) => ({
    team: r.team || r.name,
    role: r.team ? `${r.name}${r.description ? ` — ${r.description}` : ''}` : r.description,
    orders: r.standingOrders,
  }))
}

export function titleFacts(model: ExportModel, extra: [string, string][] = []): Fact[] {
  const s = model.scenario
  return facts([['Location', locationText(s)], ['Duration', durationText(s)], ...extra])
}
