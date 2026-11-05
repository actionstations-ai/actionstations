// What a toolkit adds to evaluation (spec 0457 FR-13, FR-14): critical tasks and framework
// mappings per Core Capability, and the program exercise tags a scenario can carry. Pure
// functions over parsed toolkits, shared by main and the renderer.
import { capabilityName } from '../core-capabilities'
import { drillRecordMarkdown, type DrillContext } from './drill-record'
import type { TagCapabilityRow } from './program-tags'
import type { Toolkit, ToolkitCapabilityNote, ToolkitExerciseTag } from './schema'

/** The notes for one Core Capability from every toolkit, tasks and mappings merged, no repeats. */
export function capabilityNotesFor(
  toolkits: readonly Toolkit[],
  coreCapability: string,
): ToolkitCapabilityNote {
  const tasks = new Set<string>()
  const mappings = new Map<string, Set<string>>()
  for (const t of toolkits)
    for (const note of t.capabilities) {
      if (note.coreCapability !== coreCapability) continue
      for (const task of note.criticalTasks) tasks.add(task)
      for (const m of note.mappings) {
        const ids = mappings.get(m.framework) ?? new Set<string>()
        for (const id of m.ids) ids.add(id)
        mappings.set(m.framework, ids)
      }
    }
  return {
    coreCapability,
    criticalTasks: [...tasks],
    mappings: [...mappings].map(([framework, ids]) => ({ framework, ids: [...ids] })),
  }
}

/** The exercise tags of `toolkits`, one per id (the first toolkit to define an id wins). */
export function exerciseTagsOf(toolkits: readonly Toolkit[]): ToolkitExerciseTag[] {
  const byId = new Map<string, ToolkitExerciseTag>()
  for (const t of toolkits)
    for (const tag of t.exerciseTags) if (!byId.has(tag.id)) byId.set(tag.id, tag)
  return [...byId.values()]
}

/** The tags `ids` name, in that order; unknown ids (a removed pack) are left out. */
export function tagsByIds(
  toolkits: readonly Toolkit[],
  ids: readonly string[],
): ToolkitExerciseTag[] {
  const all = new Map(exerciseTagsOf(toolkits).map((t) => [t.id, t]))
  return ids.flatMap((id) => {
    const t = all.get(id)
    return t ? [t] : []
  })
}

/** The day improvement plan data is due: the exercise date plus the program's days (ISO date), or undefined. */
export function improvementPlanDueDate(
  exerciseDate: string | undefined,
  tag: Pick<ToolkitExerciseTag, 'improvementPlanDueDays'>,
): string | undefined {
  if (!exerciseDate || tag.improvementPlanDueDays === undefined) return undefined
  const t = Date.parse(`${exerciseDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(t)) return undefined
  return new Date(t + tag.improvementPlanDueDays * 86_400_000).toISOString().slice(0, 10)
}

/** One corrective action of the improvement plan, in plain text, as the AAR keeps it. */
export interface ImprovementRow {
  capability: string
  finding: string
  action: string
  element: string
  owner: string
  poc: string
  start: string
  due: string
}

export const TAG_IP_COLUMNS = [
  'Program exercise',
  'Program text dated',
  'Capability',
  'Issue or area for improvement',
  'Corrective action',
  'Capability element',
  'Responsible organization',
  'Point of contact',
  'Start date',
  'Completion date',
] as const

/** The improvement plan rows with the program exercise named on every row, for entry into the program's system. */
export function tagImprovementRows(
  tag: Pick<ToolkitExerciseTag, 'label' | 'version'>,
  rows: readonly ImprovementRow[],
): string[][] {
  return rows.map((r) => [
    tag.label,
    tag.version,
    r.capability,
    r.finding,
    r.action,
    r.element,
    r.owner,
    r.poc,
    r.start,
    r.due,
  ])
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const table = (cols: readonly string[], rows: readonly string[][]): string =>
  [
    `| ${cols.map(cell).join(' | ')} |`,
    `| ${cols.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n')

/** A tag as the AAR receives it: with its program capabilities mapped to Core Capabilities. */
export type ProgramTag = ToolkitExerciseTag & { capabilityMap?: readonly TagCapabilityRow[] }

/** What the AAR passes besides the rows: the drill record's context and the confirmed ratings. */
export interface ProgramTagContext extends DrillContext {
  /** Core Capability id → its rating as printed ("Performed with Some Challenges (S)", "Rating pending"). */
  ratings?: Readonly<Record<string, string>>
}

export const TAG_CAPABILITY_COLUMNS = ['Program capability', 'Core Capability', 'Rating'] as const

/** One row per program capability and Core Capability it maps to, with the AAR's rating. */
export function tagCapabilityTable(
  map: readonly TagCapabilityRow[],
  ratings: Readonly<Record<string, string>> = {},
): string[][] {
  return map.flatMap((r) =>
    r.coreCapabilities.length
      ? r.coreCapabilities.map((c) => [
          r.label,
          capabilityName(c),
          ratings[c] ?? 'Not evaluated in this exercise',
        ])
      : [[r.label, 'No Core Capability mapped', '']],
  )
}

function capabilityMapMarkdown(tag: ProgramTag, ctx?: ProgramTagContext): string[] {
  if (!tag.capabilityMap?.length) return []
  return [
    `#### Program capabilities: ${tag.label}`,
    '',
    `The ${tag.capabilityFramework ?? 'program'} capabilities this exercise addresses, with the Core Capabilities they map to and the rating each received in this report.`,
    '',
    table(TAG_CAPABILITY_COLUMNS, tagCapabilityTable(tag.capabilityMap, ctx?.ratings)),
    '',
  ]
}

/**
 * The Markdown the AAR adds under the improvement plan for each tag: the exercise, the program
 * text's date, the due date for improvement plan data and the rows, then the program
 * capabilities mapped to the rated Core Capabilities. The app submits nothing: the heading says
 * the data is for the person to enter in the program's own system.
 */
export function programTagMarkdown(
  tags: readonly ProgramTag[],
  rows: readonly ImprovementRow[],
  exerciseDate?: string,
  drill?: ProgramTagContext,
): string {
  const out: string[] = []
  for (const tag of tags) {
    const due = improvementPlanDueDate(exerciseDate, tag)
    out.push(
      `### ${tag.program}: ${tag.label}`,
      '',
      `Program text dated ${tag.version} (${tag.source}). Improvement plan data is for entry into the program's own reporting system; this app submits nothing.` +
        (tag.improvementPlanDueDays !== undefined
          ? ` The program asks for it within ${tag.improvementPlanDueDays} days of the exercise${due ? `, by ${due}` : ''}.`
          : ''),
      '',
      rows.length
        ? table(TAG_IP_COLUMNS, tagImprovementRows(tag, rows))
        : '_No corrective actions yet._',
      '',
      ...capabilityMapMarkdown(tag, drill),
    )
    if (tag.drillRecord) out.push(drillRecordMarkdown(tag, rows, exerciseDate, drill), '')
  }
  return out.join('\n').trimEnd()
}
