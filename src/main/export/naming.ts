// File names for everything an export writes. Media follow FR-7: S<scenario>-I<id>-<type>.<ext>
// (e.g. S3-I05b-radio_call.wav); documents are <Title>-<Document>.pdf.
import { extname } from 'node:path'
import type { Inject, MediaAsset, Scenario, ScenarioMeta } from '@shared/schemas'

/** "Flight to Nowhere: Data & FIDS" → "Flight-to-Nowhere-Data-FIDS" (case kept, ≤ 60 chars). */
export function fileTitle(title: string): string {
  const s = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return s || 'Scenario'
}

/**
 * The scenario number used in media names: "Scenario 3" in the title or subtitle wins,
 * otherwise the scenario's position in the project (1-based).
 */
export function scenarioNumber(
  scenario: Pick<Scenario, 'id' | 'title' | 'subtitle'>,
  projectScenarios: Pick<ScenarioMeta, 'id'>[] = [],
): string {
  for (const text of [scenario.title, scenario.subtitle ?? '']) {
    const m = /\bscenario\s*#?\s*(\d{1,3})\b/i.exec(text)
    if (m?.[1]) return String(Number(m[1]))
  }
  const i = projectScenarios.findIndex((s) => s.id === scenario.id)
  return String(i >= 0 ? i + 1 : 1)
}

/** MSEL row id → the inject part of a media name: "I-05b" → "I05b", "START" → "START". */
export function rowCode(rowId: string): string {
  const clean = rowId.replace(/[^A-Za-z0-9]+/g, '')
  if (/^I\d/i.test(clean)) return `I${clean.slice(1)}`
  return clean.toUpperCase() || 'ROW'
}

export const mediaBaseName = (scenarioNo: string, rowId: string, type: string): string =>
  `S${scenarioNo}-${rowCode(rowId)}-${type.replace(/[^A-Za-z0-9_]+/g, '_')}`

const SLOT_PREFIX = /^([a-z][a-z0-9_]*)-[0-9A-HJKMNP-TV-Z]{26}$/

/** Suffix that tells an inject's files apart (the primary picture and its PDF have none). */
function assetSuffix(asset: MediaAsset): string {
  if (asset.role === 'source') return '-source'
  if (asset.role === 'generated' && asset.kind === 'image') {
    const slot = SLOT_PREFIX.exec(asset.id)?.[1]
    return `-${slot ?? 'image'}`
  }
  return ''
}

export interface PlannedMedia {
  inject: Inject
  asset: MediaAsset
  /** Export file name for the asset itself. */
  fileName: string
  /** Export file name for the video poster, if the asset has one. */
  posterName?: string
  /** For WAV audio: the MP3 sibling written next to it. */
  mp3Name?: string
}

function extOf(asset: MediaAsset): string {
  const ext = extname(asset.path).toLowerCase().replace(/^\./, '')
  if (ext) return ext
  return { image: 'png', video: 'mp4', audio: 'wav', pdf: 'pdf' }[asset.kind]
}

/** Give every asset of every inject a unique export name, in MSEL order. */
export function planMediaFiles(scenarioNo: string, injects: Inject[]): PlannedMedia[] {
  const used = new Set<string>()
  const unique = (name: string, ext: string): string => {
    let candidate = `${name}.${ext}`
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${name}-${n}.${ext}`
    used.add(candidate.toLowerCase())
    return candidate
  }
  const out: PlannedMedia[] = []
  for (const inject of injects) {
    const base = mediaBaseName(scenarioNo, inject.mselRowId, inject.type)
    const hasMp3 = inject.assets.some((a) => extOf(a) === 'mp3')
    for (const asset of inject.assets) {
      const stem = `${base}${assetSuffix(asset)}`
      const ext = extOf(asset)
      const planned: PlannedMedia = { inject, asset, fileName: unique(stem, ext) }
      if (asset.posterPath) planned.posterName = unique(`${stem}-poster`, 'png')
      if (asset.kind === 'audio' && ext === 'wav' && !hasMp3) planned.mp3Name = unique(stem, 'mp3')
      out.push(planned)
    }
  }
  return out
}

/**
 * Short, file-safe tag from a scenario id (last 6 letters/digits), so two scenarios with the
 * same title never share an export folder or ZIP (#213).
 */
export function scenarioTag(scenarioId: string): string {
  return scenarioId.replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'x'
}

/**
 * Document file names inside the export folder. With the scenario, the folder and ZIP are
 * `<Title>-S<number>-<id tag>` so they are unique per scenario.
 */
export function documentFileNames(
  title: string,
  scenario?: { scenarioNo: string; scenarioId: string },
) {
  const t = fileTitle(title)
  const base = scenario ? `${t}-S${scenario.scenarioNo}-${scenarioTag(scenario.scenarioId)}` : t
  return {
    msel: `${t}-MSEL.pdf`,
    deck: `${t}-Master-Inject-Deck.pdf`,
    handbook: `${t}-Controller-Evaluator-Handbook.pdf`,
    briefing: `${t}-Player-Briefing-Packet.pdf`,
    exercisePlan: `${t}-Exercise-Plan.pdf`,
    handbookDocx: `${t}-Controller-Evaluator-Handbook.docx`,
    briefingDocx: `${t}-Player-Briefing-Packet.docx`,
    handouts: `${t}-Player-Handouts.pdf`,
    controllerHandouts: `${t}-Controller-Materials.pdf`,
    ics201: 'ICS-201-Incident-Briefing-blank.pdf',
    ics203: 'ICS-203-Organization-Assignment-List-blank.pdf',
    folder: base,
    zip: `${base}-distribution.zip`,
  }
}
export type DocumentFileNames = ReturnType<typeof documentFileNames>
