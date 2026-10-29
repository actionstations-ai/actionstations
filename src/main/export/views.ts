// View models for the export templates: plain data derived from the scenario, injects and
// documents. All strings stay raw here; the templates escape them.
import { pathToFileURL } from 'node:url'
import { capabilityName } from '@shared/core-capabilities'
import { mediaUrl } from '@shared/media-url'
import type { Inject, MediaAsset, MselRow, Phase, Scenario } from '@shared/schemas'
import { effectiveDecisions } from '@shared/branching/active-path'
import { defaultDecisions } from '@shared/branching/default-path'
import { buildGraph, hasBranches, pathOrder, type BranchNode } from '@shared/branching/graph'
import { injectTypeInfo, PURPOSE_TAG_INFO, type PurposeTag } from '@shared/taxonomy'
import { safeJoin } from '../lib/fs'
import { loadTemplate } from '../render/templates'
import { isControllerOnlyRow } from '../translate/scope'
import { localizeRendition, tr, type DocLang } from './lang'
import type { ExportModel } from './model'
import { injectText } from './text-rendition'
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

export const durationText = (s: Scenario, lang?: DocLang): string =>
  `${s.brief.durationHours} ${tr(lang, s.brief.durationHours === 1 ? 'Hour' : 'Hours')}`

function audienceText(s: Scenario): string {
  return s.overview?.targetAudience || s.brief.audience.join(', ')
}

/** "To" column: the row's label, else its role names, else "All". */
export function toText(row: MselRow, s: Scenario): string {
  if (row.toLabel) return row.toLabel
  const names = row.toRoleIds.map((id) => s.roles.find((r) => r.id === id)?.name ?? id)
  return names.join(', ') || 'All'
}

/** The Source check cell: the grounding label, and "Seam" on a row that tests a plan seam (#427). */
const checkCell = (label: string | undefined, row: { seamId?: string | undefined }): string =>
  [label, row.seamId ? 'Seam' : ''].filter(Boolean).join(' · ')

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
    showCheck: !!model.sourceCheck,
    phases: groupRows(s).map(({ phase, rows }) => ({
      showCheck: !!model.sourceCheck,
      columns: model.sourceCheck ? 8 : 7,
      heading: phase ? phaseHeading(phase) : 'Additional events',
      hours: phase ? phaseHours(phase) : '',
      goal: phase?.goal ?? '',
      rows: rows.filter((r) => !r.branchId || !hasBranches(s)).map((r) => mselRowView(model, r)),
      branches: branchSections(model, rows),
    })),
  }
}

/** One MSEL row as the templates read it. */
export function mselRowView(model: ExportModel, r: MselRow) {
  const s = model.scenario
  return {
    time: r.time,
    wallClock: r.wallClock ?? '',
    id: r.id,
    from: r.from,
    to: toText(r, s),
    event: r.event,
    options: decisionOptions(r),
    expectedAction: r.expectedAction,
    refs: citationText(r),
    evaluation: evaluationText(s, r.id),
    tag: tagView(r.purposeTag),
    check: checkCell(model.sourceCheck?.[r.id], r),
    showCheck: !!model.sourceCheck,
    rowClass: r.purposeTag === 'DECISION_POINT' ? 'is-decision' : '',
  }
}

/** A decision row lists its options and where each leads: "Pay → Branch B1". */
function decisionOptions(r: MselRow): string[] {
  const d = r.decision
  if (!d) return []
  const dflt = d.options.find((o) => o.id === d.defaultOptionId)?.label
  return [
    ...d.options.map(
      (o) => `${o.label} → ${o.branchId ? `Branch ${o.branchId.toUpperCase()}` : 'continue'}`,
    ),
    `Rule: ${d.rule.kind}${dflt ? `; default ${dflt}` : ''}`,
  ]
}

/** "Branch B1 — Pay the ransom (rows I-12a…I-15a; rejoins I-16)" */
export function branchTitle(node: BranchNode): string {
  const { branch, rows } = node
  const span = rows.length
    ? rows.length === 1
      ? `rows ${rows[0]!.id}`
      : `rows ${rows[0]!.id}…${rows[rows.length - 1]!.id}`
    : 'no rows'
  const end = branch.rejoinRowId ? `rejoins ${branch.rejoinRowId}` : 'ends the exercise'
  return `Branch ${branch.id.toUpperCase()} — ${branch.label} (${span}; ${end})`
}

/**
 * The branches whose decision row is in `phaseRows`, each as a shaded sub-table printed after
 * the phase's trunk table; branches of a branch follow their parent (depth-first).
 */
function branchSections(model: ExportModel, phaseRows: MselRow[]) {
  const s = model.scenario
  if (!hasBranches(s)) return []
  const graph = buildGraph(s)
  const out: {
    title: string
    depth: number
    showCheck: boolean
    columns: number
    rows: ReturnType<typeof mselRowView>[]
  }[] = []
  const visit = (rows: MselRow[], depth: number) => {
    for (const r of rows)
      for (const o of r.decision?.options ?? []) {
        const node = o.branchId ? graph.branches.get(o.branchId) : undefined
        if (!node || out.some((x) => x.title === branchTitle(node))) continue
        out.push({
          title: branchTitle(node),
          depth,
          showCheck: !!model.sourceCheck,
          columns: model.sourceCheck ? 8 : 7,
          rows: node.rows.map((x) => mselRowView(model, x)),
        })
        visit(node.rows, depth + 1)
      }
  }
  visit(
    phaseRows.filter((r) => !r.branchId),
    1,
  )
  return out
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

/** The inject's words, one line per paragraph (spec 0435 FR-15, spec 0432 FR-13). */
export function renditionLines(model: ExportModel, inject: Inject): string[] {
  let schema: Record<string, unknown> | undefined
  try {
    schema = loadTemplate(inject.type, model.root).schema
  } catch {
    schema = undefined
  }
  const text = localizeRendition(injectText(inject, schema), model.lang)
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Cards of the injects that go to players: not the rows only controllers or the SimCell see. */
export function playerInjectsView(model: ExportModel, prefix: string, mode: RenderMode) {
  const s = model.scenario
  const byRow = new Map(model.injects.map((i) => [i.mselRowId, i]))
  const rows = groupRows(s)
    .flatMap((g) => g.rows)
    .filter((row) => {
      const inject = byRow.get(row.id)
      return !!inject && inject.includeInDeck !== false && !isControllerOnlyRow(row, s)
    })
  const cards = rows.map((row) => {
    const inject = byRow.get(row.id)!
    const image = primaryImage(inject, model.available)
    return {
      title: inject.title || row.event.split(/(?<=[.!?])\s/)[0] || row.id,
      from: row.from,
      to: toText(row, s),
      lines: renditionLines(model, inject),
      image: image && {
        src: assetSrc(model, image.path, mode),
        alt: `${formatLabel(row, inject)}: ${inject.title}`,
      },
    }
  })
  return {
    prefix,
    title: {
      id: `${prefix}player-injects-title`,
      eyebrow: tr(model.lang, 'Player Injects'),
      heading: scenarioHeading(model),
      sub: s.subtitle ?? '',
      facts: titleFacts(model),
    },
    cards,
    endNote: tr(model.lang, 'End of Player Injects'),
  }
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
      // The words of the picture as real text, read by a screen reader after the image.
      lines: inject ? renditionLines(model, inject) : [],
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
  const lang = model.lang
  return facts([
    [tr(lang, 'Location'), locationText(s)],
    [tr(lang, 'Duration'), durationText(s, lang)],
    ...extra,
  ])
}

const RULE_WORDS: Record<string, string> = {
  plurality: 'most votes',
  majority: 'majority',
  threshold: 'threshold',
  controller: 'controller',
  unanimous: 'unanimous',
}

/**
 * The linear MSEL of one path (spec 0430): the path the recorded decisions led to when the
 * exercise was run, else the default path with the branches it leaves out listed.
 */
export function pathView(model: ExportModel, prefix: string) {
  const s = model.scenario
  const graph = buildGraph(s)
  const played = [...effectiveDecisions(model.decisions ?? []).values()]
  const chosen = new Map(played.map((r) => [r.decisionId, r.optionId]))
  const rows = pathOrder(s, played.length ? chosen : defaultDecisions(s))
  const onPath = new Set(rows.map((r) => r.id))
  return {
    prefix,
    title: {
      id: `${prefix}path-title`,
      eyebrow: played.length ? 'MSEL: path played' : 'MSEL: default path',
      heading: scenarioHeading(model),
      sub: s.subtitle ?? '',
      facts: facts([
        ['Location', locationText(s)],
        ['Duration', durationText(s)],
      ]),
    },
    heading: played.length ? 'Events on the path played' : 'Events on the default path',
    rows: rows.map((r) => mselRowView(model, r)),
    taken: played.map((rec) => {
      const d = graph.decisions.get(rec.decisionId)?.decision
      const votes = Object.entries(rec.input.tally)
        .map(([id, n]) => `${d?.options.find((o) => o.id === id)?.label ?? id}: ${n}`)
        .join(', ')
      return {
        time: rec.exerciseTime,
        question: d?.question ?? rec.decisionId,
        chosen: d?.options.find((o) => o.id === rec.optionId)?.label ?? rec.optionId,
        by: rec.by === 'vote' ? (RULE_WORDS[rec.rule.kind] ?? rec.rule.kind) : rec.by,
        note: rec.note,
        votes: rec.input.cast ? votes : '',
      }
    }),
    alternatives: played.length
      ? []
      : [...graph.branches.values()]
          .filter((n) => n.rows.length && n.rows.every((r) => !onPath.has(r.id)))
          .map(branchTitle),
  }
}
