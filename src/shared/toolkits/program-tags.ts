// What a program exercise tag brings into a scenario (spec 0457 FR-14), and the field critical
// tasks the toolkits give the Exercise Evaluation Guides (spec 0457 FR-13). Pure functions over
// parsed toolkits, shared by main (generation, AAR) and the renderer (exercise details).
import { capabilityName, isCoreCapability } from '../core-capabilities'
import { capabilityNotesFor } from './evaluation'
import type { Toolkit, ToolkitExerciseTag } from './schema'

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** "Laboratory: the role of …" → a short name and the text; no colon → no name. */
const LEAD = /^([^:]{2,60}):\s+([\s\S]+)$/

const capitalized = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The tag's label without its kind in parentheses: "PHEP Capstone 300". */
const shortLabel = (tag: Pick<ToolkitExerciseTag, 'label'>): string =>
  tag.label.replace(/\s*\([^)]*\)\s*$/, '').trim() || tag.label

export interface ObjectiveDraft {
  name: string
  text: string
}

/** The tag's suggested objectives as scenario objectives: the lead words before a colon name it. */
export function tagObjectiveDrafts(
  tag: Pick<ToolkitExerciseTag, 'label' | 'objectives'>,
): ObjectiveDraft[] {
  return tag.objectives.map((o) => {
    const m = LEAD.exec(o.trim())
    return m
      ? { name: m[1]!.trim(), text: capitalized(m[2]!.trim()) }
      : { name: '', text: o.trim() }
  })
}

interface ObjectiveLike {
  id: string
  name: string
  text: string
}

/** Whether `objectives` already holds the draft, in its split or original form. */
function hasObjective(objectives: readonly ObjectiveLike[], d: ObjectiveDraft): boolean {
  const forms = new Set([norm(d.text), norm(d.name ? `${d.name}: ${d.text}` : d.text)])
  return objectives.some(
    (o) => forms.has(norm(o.text)) || forms.has(norm(o.name ? `${o.name}: ${o.text}` : o.text)),
  )
}

/** `name`, or `name (2)`, `name (3)`… so no two objectives share a name (the EEG matches by name). */
function uniqueName(name: string, taken: Set<string>): string {
  let out = name
  for (let n = 2; taken.has(norm(out)); n++) out = `${name} (${n})`
  taken.add(norm(out))
  return out
}

/**
 * The scenario's objectives with each tag's suggested objectives appended, skipping one already
 * there. An objective without lead words is named after the tag ("PHEP Capstone 300").
 */
export function mergeTagObjectives<O extends ObjectiveLike>(
  objectives: readonly O[],
  tags: readonly Pick<ToolkitExerciseTag, 'label' | 'objectives'>[],
  newId: () => string,
): { objectives: (O | ObjectiveLike)[]; added: ObjectiveLike[] } {
  const out: (O | ObjectiveLike)[] = [...objectives]
  const added: ObjectiveLike[] = []
  const taken = new Set(objectives.map((o) => norm(o.name)).filter(Boolean))
  for (const tag of tags)
    for (const d of tagObjectiveDrafts(tag)) {
      if (hasObjective(out, d)) continue
      const o = { id: newId(), name: uniqueName(d.name || shortLabel(tag), taken), text: d.text }
      out.push(o)
      added.push(o)
    }
  return { objectives: out, added }
}

/** One program capability of a tag and the Core Capabilities the toolkits map it to. */
export interface TagCapabilityRow {
  /** As the tag lists it: "Capability 8: Medical Countermeasure Dispensing and Administration". */
  label: string
  coreCapabilities: string[]
}

/** "Capability 8: …" or "8: …" → "8". */
const capabilityNumber = (label: string): string | undefined =>
  /^(?:capability\s+)?([\w.-]+)\s*:/i.exec(label.trim())?.[1]

/**
 * Each program capability of the tag with the Core Capabilities whose toolkit mappings (in the
 * tag's `capabilityFramework`) name its number. Empty when the tag names no framework.
 */
export function tagCapabilityRows(
  tag: Pick<ToolkitExerciseTag, 'capabilities' | 'capabilityFramework'>,
  toolkits: readonly Toolkit[],
): TagCapabilityRow[] {
  const framework = tag.capabilityFramework
  if (!framework) return []
  return tag.capabilities.map((label) => {
    const id = capabilityNumber(label)
    const cores = new Set<string>()
    if (id)
      for (const t of toolkits)
        for (const note of t.capabilities)
          if (note.mappings.some((m) => m.framework === framework && m.ids.includes(id)))
            cores.add(note.coreCapability)
    return { label, coreCapabilities: [...cores] }
  })
}

/** Field critical tasks for one Core Capability, for the eeg stage's prompt. */
export interface FieldTaskGroup {
  capability: string
  name: string
  tasks: string[]
  /** "CDC PHEP capabilities (2018) 8, 9, 13"; empty when none. */
  mappings: string
}

/** Tasks per capability the prompt shows; the guide has room for six. */
const FIELD_TASKS_PER_CAPABILITY = 12

/**
 * The toolkits' critical tasks grouped by Core Capability, in the order the toolkits list them,
 * merged across toolkits without repeats. Capabilities outside the 32 are left out.
 */
export function fieldTaskGroups(toolkits: readonly Toolkit[]): FieldTaskGroup[] {
  const ids = [...new Set(toolkits.flatMap((t) => t.capabilities.map((c) => c.coreCapability)))]
  return ids.filter(isCoreCapability).flatMap((id) => {
    const note = capabilityNotesFor(toolkits, id)
    if (!note.criticalTasks.length) return []
    return [
      {
        capability: id,
        name: capabilityName(id),
        tasks: note.criticalTasks.slice(0, FIELD_TASKS_PER_CAPABILITY),
        mappings: note.mappings.map((m) => `${m.framework} ${m.ids.join(', ')}`).join('; '),
      },
    ]
  })
}
