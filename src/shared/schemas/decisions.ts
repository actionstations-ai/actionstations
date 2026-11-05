/**
 * Structured decisions (spec 0448 FR-14): forms a toolkit defines, the value a player or the
 * facilitator submits, and the record the metrics builder reads. Data only: a form says what to
 * ask, never what to do with the answer. The caps keep a whole form (and a whole submission)
 * inside one relay frame.
 */
import { z } from 'zod'
import { ExerciseTime, IsoDateTime, SafeId } from './common'

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'Invalid id')

export const DECISION_LIMITS = {
  fields: 10,
  options: 12,
  areas: 40,
  polygonPoints: 40,
  textMax: 1_000,
  formsPerSession: 20,
  /** Decisions one device may submit in a session. */
  perDevice: 60,
  /** Decisions a session keeps. */
  perSession: 1_000,
} as const

const Named = z.strictObject({ id: Id, label: z.string().min(1).max(80) })

const FieldBase = {
  id: Id,
  label: z.string().min(1).max(120),
  help: z.string().max(240).optional(),
  required: z.boolean().default(false),
}

export const TextField = z.strictObject({
  ...FieldBase,
  type: z.literal('text'),
  maxLength: z.number().int().min(1).max(DECISION_LIMITS.textMax).default(500),
})
export const ChoiceField = z.strictObject({
  ...FieldBase,
  type: z.literal('choice'),
  options: z.array(Named).min(2).max(DECISION_LIMITS.options),
})
export const NumberField = z.strictObject({
  ...FieldBase,
  type: z.literal('number'),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  integer: z.boolean().default(false),
  unit: z.string().max(20).optional(),
})
/** An exercise-clock time ("H:MM"), such as when an order takes effect. */
export const TimeField = z.strictObject({ ...FieldBase, type: z.literal('time') })
/**
 * A place: picked from the named areas, and, when `draw` is set and the screen has a map that
 * can be drawn on, drawn as a polygon. A screen without drawing support offers the list.
 */
export const AreaField = z.strictObject({
  ...FieldBase,
  type: z.literal('area'),
  areas: z.array(Named).min(1).max(DECISION_LIMITS.areas),
  draw: z.boolean().default(false),
})

export const DecisionField = z.discriminatedUnion('type', [
  TextField,
  ChoiceField,
  NumberField,
  TimeField,
  AreaField,
])
export type DecisionField = z.infer<typeof DecisionField>
export type DecisionFieldType = DecisionField['type']

const duplicates = (ids: string[]) => ids.length !== new Set(ids).size

export const DecisionForm = z
  .strictObject({
    id: Id,
    title: z.string().min(1).max(120),
    /** What the decision is, for metrics (for example `tornado-warning`); defaults to the form id. */
    kind: Id.optional(),
    description: z.string().max(300).optional(),
    fields: z.array(DecisionField).min(1).max(DECISION_LIMITS.fields),
    /** Seats (role ids) that may use the form; absent means every player seat. */
    seats: z.array(SafeId).min(1).max(64).optional(),
    /**
     * Regulatory clock triggers a recorded decision fires: the regulation and trigger ids, and,
     * with `fieldId` and `optionId`, only when that choice was made.
     */
    fires: z
      .array(
        z
          .strictObject({
            regulationId: Id,
            triggerId: Id,
            fieldId: Id.optional(),
            optionId: Id.optional(),
          })
          .refine((t) => (t.fieldId === undefined) === (t.optionId === undefined), {
            message: 'fieldId and optionId go together',
          }),
      )
      .max(10)
      .optional(),
  })
  .superRefine((form, ctx) => {
    if (duplicates(form.fields.map((f) => f.id)))
      ctx.addIssue({ code: 'custom', path: ['fields'], message: 'field ids must be unique' })
    if (form.fields.filter((f) => f.type === 'area').length > 1)
      ctx.addIssue({ code: 'custom', path: ['fields'], message: 'a form has at most one area' })
    form.fields.forEach((f, i) => {
      const list = f.type === 'choice' ? f.options : f.type === 'area' ? f.areas : []
      if (duplicates(list.map((o) => o.id)))
        ctx.addIssue({ code: 'custom', path: ['fields', i], message: 'option ids must be unique' })
      if (f.type === 'number' && f.min !== undefined && f.max !== undefined && f.min > f.max)
        ctx.addIssue({ code: 'custom', path: ['fields', i], message: 'min is above max' })
    })
  })
export type DecisionForm = z.infer<typeof DecisionForm>

// ---- a submitted decision ----

export const LatLon = z.strictObject({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
})

/** What a submission says about the place: a named area, or a drawn polygon. */
export const AreaValue = z.union([
  z.strictObject({ areaId: Id }),
  z.strictObject({ polygon: z.array(LatLon).min(3).max(DECISION_LIMITS.polygonPoints) }),
])
export type AreaValue = z.infer<typeof AreaValue>

export const DecisionValue = z.union([z.string().max(DECISION_LIMITS.textMax), z.number().finite()])
export type DecisionValue = z.infer<typeof DecisionValue>

export const SubmittedField = z.strictObject({ fieldId: Id, value: DecisionValue })

/** The seat a decision belongs to. A name appears only when the session is named. */
export const DecisionSeat = z.strictObject({
  kind: z.enum(['player', 'facilitator']),
  roleId: SafeId.optional(),
  teamId: SafeId.optional(),
  label: z.string().max(80).optional(),
  name: z.string().max(60).optional(),
})
export type DecisionSeat = z.infer<typeof DecisionSeat>

export const RecordedArea = z.strictObject({
  id: Id.optional(),
  name: z.string().max(80),
  polygon: z.array(LatLon).max(DECISION_LIMITS.polygonPoints).optional(),
})
export type RecordedArea = z.infer<typeof RecordedArea>

/**
 * The decision record the metrics builder and the after-action report read. `time` is the
 * moment the controller took it in (ISO); `exerciseTime` is the exercise clock then. `fields`
 * is keyed by field id: a choice holds the option id, a time the "H:MM", a number the number.
 */
export const DecisionRecord = z.strictObject({
  id: z.string().min(1).max(40),
  time: IsoDateTime,
  exerciseTime: ExerciseTime.optional(),
  kind: Id,
  formId: Id,
  title: z.string().max(120),
  area: RecordedArea.optional(),
  fields: z.record(Id, DecisionValue),
  seat: DecisionSeat,
  source: z.enum(['device', 'facilitator']),
})
export type DecisionRecord = z.infer<typeof DecisionRecord>

// ---- checking a submission against its form ----

export interface Submission {
  fields: Readonly<Record<string, DecisionValue | undefined>>
  area?: AreaValue | undefined
}

export type Checked =
  | { ok: true; fields: Record<string, DecisionValue>; area?: RecordedArea }
  | { ok: false; error: string }

const TIME = /^\d{1,2}:[0-5]\d$/
const bad = (error: string): Checked => ({ ok: false, error })
const blank = (v: DecisionValue | undefined) =>
  v === undefined || (typeof v === 'string' && !v.trim())

function checkValue(f: DecisionField, v: DecisionValue): string | undefined {
  switch (f.type) {
    case 'text':
      return typeof v === 'string' && v.length <= f.maxLength ? undefined : `${f.label} is too long`
    case 'choice':
      return typeof v === 'string' && f.options.some((o) => o.id === v)
        ? undefined
        : `${f.label} is not one of the choices`
    case 'number':
      if (typeof v !== 'number') return `${f.label} must be a number`
      if (f.integer && !Number.isInteger(v)) return `${f.label} must be a whole number`
      if (f.min !== undefined && v < f.min) return `${f.label} is below ${f.min}`
      if (f.max !== undefined && v > f.max) return `${f.label} is above ${f.max}`
      return undefined
    case 'time':
      return typeof v === 'string' && TIME.test(v) ? undefined : `${f.label} must be H:MM`
    case 'area':
      return 'an area is not a field value'
  }
}

/** What is wrong with one field's value (required, type, range, choice), if anything. */
export function fieldProblem(f: DecisionField, v: DecisionValue | undefined): string | undefined {
  if (f.type === 'area') return undefined
  if (blank(v)) return f.required ? `${f.label} is required` : undefined
  return checkValue(f, v!)
}

function checkArea(f: DecisionField | undefined, area: AreaValue | undefined) {
  if (!f || f.type !== 'area') {
    return area ? bad('This form has no area') : { ok: true as const, area: undefined }
  }
  if (!area) {
    return f.required ? bad(`${f.label} is required`) : { ok: true as const, area: undefined }
  }
  if ('areaId' in area) {
    const hit = f.areas.find((a) => a.id === area.areaId)
    if (!hit) return bad(`${f.label} is not one of the areas`)
    return { ok: true as const, area: { id: hit.id, name: hit.label } }
  }
  if (!f.draw) return bad(`${f.label} must be picked from the list`)
  return { ok: true as const, area: { name: 'Drawn area', polygon: area.polygon } }
}

/** Check a submission against its form: required, types, ranges, choices, areas, unknown ids. */
export function checkSubmission(form: DecisionForm, input: Submission): Checked {
  const known = new Set(form.fields.filter((f) => f.type !== 'area').map((f) => f.id))
  for (const id of Object.keys(input.fields)) if (!known.has(id)) return bad(`Unknown field ${id}`)
  const fields: Record<string, DecisionValue> = {}
  for (const f of form.fields) {
    if (f.type === 'area') continue
    const v = input.fields[f.id]
    const error = fieldProblem(f, v)
    if (error) return bad(error)
    if (blank(v)) continue
    fields[f.id] = typeof v === 'string' ? v.trim() : v!
  }
  const placed = checkArea(
    form.fields.find((f) => f.type === 'area'),
    input.area,
  )
  if (!placed.ok) return placed
  return { ok: true, fields, ...(placed.area ? { area: placed.area } : {}) }
}

/** Forms a seat may use: every form with no seat list, and those that name its role. */
export function formsForSeat(forms: readonly DecisionForm[], roleId: string | undefined) {
  return forms.filter((f) => !f.seats || (roleId !== undefined && f.seats.includes(roleId)))
}

/** Turn the checked pieces into the record (the caller supplies who, when and the id). */
export function buildDecisionRecord(args: {
  id: string
  form: DecisionForm
  checked: Extract<Checked, { ok: true }>
  seat: DecisionSeat
  source: DecisionRecord['source']
  time: string
  exerciseTime?: string | undefined
}): DecisionRecord {
  const { form, checked } = args
  return {
    id: args.id,
    time: args.time,
    ...(args.exerciseTime ? { exerciseTime: args.exerciseTime } : {}),
    kind: form.kind ?? form.id,
    formId: form.id,
    title: form.title,
    ...(checked.area ? { area: checked.area } : {}),
    fields: checked.fields,
    seat: args.seat,
    source: args.source,
  }
}
