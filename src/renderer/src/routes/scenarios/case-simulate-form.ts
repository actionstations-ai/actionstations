// The simulation form's values and the inputs it sends (#1141). Main describes each top-level
// input (text, date and time, number, checkbox, choice, list of choices, lines, JSON); this turns
// the generator's example into editable values and the edited values back into inputs, or says
// in words what is wrong. Times are UTC.
import type { GeneratorInfo, GeneratorInput } from '@shared/ipc/case-data'

export type SimValue = string | boolean | string[]
export type SimValues = Record<string, SimValue>

function toValue(input: GeneratorInput, v: unknown): SimValue {
  if (input.kind === 'boolean') return v === true
  if (input.kind === 'choices') return Array.isArray(v) ? v.map(String) : []
  if (v === undefined || v === null) return ''
  if (input.kind === 'datetime') return typeof v === 'string' ? v.slice(0, 16) : ''
  if (input.kind === 'lines') return Array.isArray(v) ? v.map(String).join('\n') : ''
  if (input.kind === 'json') return JSON.stringify(v, null, 2)
  return String(v)
}

/** Editable values from a set of inputs (the generator's example when the form opens). */
export function valuesFrom(info: GeneratorInfo, inputs = info.example): SimValues {
  return Object.fromEntries(info.inputs.map((i) => [i.key, toValue(i, inputs[i.key])]))
}

function readNumber(i: GeneratorInput, raw: string, errors: string[]): number | undefined {
  const n = Number(raw.trim())
  if (!Number.isFinite(n)) return void errors.push(`${i.label} must be a number.`)
  if (i.integer && !Number.isInteger(n))
    return void errors.push(`${i.label} must be a whole number.`)
  if (i.min !== undefined && n < i.min)
    return void errors.push(`${i.label} must be at least ${i.min}.`)
  if (i.max !== undefined && n > i.max)
    return void errors.push(`${i.label} must be at most ${i.max}.`)
  return n
}

function readJson(i: GeneratorInput, raw: string, errors: string[]): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    errors.push(`${i.label} is not valid JSON. Check the brackets, quotes and commas.`)
    return undefined
  }
}

function fromValue(i: GeneratorInput, v: SimValue, errors: string[]): unknown {
  if (i.kind === 'boolean') return v === true
  if (i.kind === 'choices') return v
  const raw = typeof v === 'string' ? v : ''
  if (raw.trim() === '') return undefined
  switch (i.kind) {
    case 'datetime':
      return `${raw}:00Z`
    case 'number':
      return readNumber(i, raw, errors)
    case 'choice':
      return i.choices?.find((c) => String(c.value) === raw)?.value ?? raw
    case 'lines':
      return raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    case 'json':
      return readJson(i, raw, errors)
    default:
      return raw
  }
}

/** The inputs for `case:generate`, or the problems in words. Empty optional inputs are left out. */
export function toInputs(
  info: GeneratorInfo,
  values: SimValues,
): { inputs: Record<string, unknown>; errors: string[] } {
  const errors: string[] = []
  const inputs: Record<string, unknown> = {}
  for (const i of info.inputs) {
    const v = fromValue(i, values[i.key] ?? '', errors)
    if (v === undefined) {
      if (i.required && !errors.some((e) => e.startsWith(i.label)))
        errors.push(`${i.label} is needed.`)
      continue
    }
    inputs[i.key] = v
  }
  return { inputs, errors }
}
