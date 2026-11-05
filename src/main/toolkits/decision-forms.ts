// A scenario's toolkit decision forms for live play and Facilitate (spec 0448 FR-14). A toolkit
// defines its forms as data (`decisionForms`); this converts them to the live form schema and is
// installed as the provider `provideDecisionForms` calls, so players and the facilitator get
// the forms of whatever toolkits the scenario has on right now. The provider runs on every
// request, so a change to the scenario's toolkits shows up the next time the forms are read.
import { DECISION_LIMITS, type DecisionForm as LiveForm } from '@shared/schemas/decisions'
import type { DecisionField, DecisionForm, Toolkit } from '@shared/toolkits'
import { caseDir, readManifest } from '../case-data/store'
import { readModeledSeries } from '../evaluation/metrics/inputs'
import { provideDecisionForms, type DecisionFormContext } from '../live/decision-forms'
import { getScenario } from '../scenario/store'
import { resolveToolkits } from './registry'

const DEFAULT_AREA = 'Exercise area'

const slug = (text: string, fallback: string): string => {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return s || fallback
}

/** Option ids from labels: a slug of each, numbered when two labels would share one. */
function named(labels: readonly string[], limit: number): { id: string; label: string }[] {
  const seen = new Set<string>()
  return labels.slice(0, limit).map((label, i) => {
    let id = slug(label, `o${i + 1}`)
    if (seen.has(id)) id = `${id}_${i + 1}`
    seen.add(id)
    return { id, label: label.slice(0, 80) }
  })
}

type LiveField = LiveForm['fields'][number]

function convertField(f: DecisionField, defaultAreas: readonly string[]): LiveField {
  const base = { id: f.id, label: f.label.slice(0, 120), required: f.required }
  switch (f.kind) {
    case 'choice':
      return { ...base, type: 'choice', options: named(f.choices, DECISION_LIMITS.options) }
    case 'area':
      return {
        ...base,
        type: 'area',
        areas: named(f.areas.length ? f.areas : defaultAreas, DECISION_LIMITS.areas),
        draw: f.draw,
      }
    case 'number':
      return { ...base, type: 'number', integer: false }
    case 'time':
      return { ...base, type: 'time' }
    case 'text':
      return { ...base, type: 'text', maxLength: 500 }
  }
}

/** One toolkit form as the live schema; the form id doubles as its kind for the metrics. */
export function toLiveForm(
  form: DecisionForm,
  defaultArea: string | readonly string[] = DEFAULT_AREA,
): unknown {
  const defaultAreas = typeof defaultArea === 'string' ? [defaultArea] : defaultArea
  return {
    id: form.id,
    title: form.label.slice(0, 120),
    ...(form.description ? { description: form.description.slice(0, 300) } : {}),
    // A form with no fields cannot be filled in; the live schema's own check skips it.
    fields: form.fields.slice(0, DECISION_LIMITS.fields).map((f) => convertField(f, defaultAreas)),
  }
}

/** The forms of these toolkits, in toolkit order, as unchecked live-form data. */
export function liveFormsOf(
  toolkits: readonly Toolkit[],
  defaultArea: string | readonly string[] = DEFAULT_AREA,
): unknown[] {
  return toolkits.flatMap((t) => t.decisionForms.map((f) => toLiveForm(f, defaultArea)))
}

/**
 * The places a form's area field offers when the toolkit lists none: the zones of the scenario's
 * modeled series (the sensitive areas an oil spill reaches), else the case data's area label.
 */
async function caseAreaNames(root: string, scenarioId: string): Promise<string[]> {
  const manifest = await readManifest(root, scenarioId).catch(() => undefined)
  const zones = new Set<string>()
  for (const d of manifest?.datasets ?? []) {
    if (d.shape !== 'modeled-series' || !d.file) continue
    const series = await readModeledSeries(caseDir(root, scenarioId), d.file).catch(() => [])
    for (const s of series) zones.add(s.zone)
  }
  if (zones.size) return [...zones]
  return [manifest?.datasets.find((d) => d.area?.label)?.area?.label || DEFAULT_AREA]
}

/** The provider: the decision forms of the toolkits the scenario has on. */
export async function toolkitDecisionForms(ctx: DecisionFormContext): Promise<unknown[]> {
  const scenario = await getScenario(ctx.root, ctx.scenarioId)
  if (!scenario.toolkits.length) return []
  const toolkits = await resolveToolkits(scenario.toolkits)
  if (!toolkits.some((t) => t.decisionForms.length)) return []
  return liveFormsOf(toolkits, await caseAreaNames(ctx.root, ctx.scenarioId))
}

/** Make toolkit forms the source of decision forms (once, at startup). */
export function installToolkitDecisionForms() {
  return provideDecisionForms(toolkitDecisionForms)
}
