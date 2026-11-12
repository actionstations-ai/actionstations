// The simulation form (#1141), built from a generator's input schema: each top-level input
// becomes one field the renderer knows how to draw, labeled from the generator's `fields`.
// Nested objects and lists of objects are edited as JSON; the generator's schema checks them
// when the simulation runs.
import { z } from 'zod'
import type { GeneratorInfo, GeneratorInput } from '@shared/ipc/case-data'
import type { SimulatedGenerator } from './generators'

type Json = Record<string, unknown>

/** Bounds wider than this are the schema's "any integer", not a limit worth showing. */
const SHOWN_BOUND = 1e12

const humanize = (key: string): string => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function bounds(p: Json): Pick<GeneratorInput, 'min' | 'max'> {
  const lo = (p.minimum ?? p.exclusiveMinimum) as number | undefined
  const hi = (p.maximum ?? p.exclusiveMaximum) as number | undefined
  return {
    ...(lo !== undefined && Math.abs(lo) < SHOWN_BOUND ? { min: lo } : {}),
    ...(hi !== undefined && Math.abs(hi) < SHOWN_BOUND ? { max: hi } : {}),
  }
}

const enumChoices = (values: unknown[]) =>
  values
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map((v) => ({ value: v, label: String(v).replace(/_/g, ' ') }))

/** The kind of field for one property of the input schema. */
function kindOf(p: Json): Omit<GeneratorInput, 'key' | 'label' | 'required' | 'help'> {
  const anyOf = p.anyOf as Json[] | undefined
  if (anyOf?.every((a) => 'const' in a))
    return { kind: 'choice', choices: enumChoices(anyOf.map((a) => a.const)) }
  if (Array.isArray(p.enum)) return { kind: 'choice', choices: enumChoices(p.enum) }
  if (p.type === 'boolean') return { kind: 'boolean' }
  if (p.type === 'integer') return { kind: 'number', integer: true, ...bounds(p) }
  if (p.type === 'number') return { kind: 'number', ...bounds(p) }
  if (p.type === 'string') return { kind: p.format === 'date-time' ? 'datetime' : 'text' }
  if (p.type === 'array') {
    const items = (p.items ?? {}) as Json
    if (Array.isArray(items.enum)) return { kind: 'choices', choices: enumChoices(items.enum) }
    if (items.type === 'string') return { kind: 'lines' }
  }
  return { kind: 'json' }
}

/** The form for one generator: its inputs in schema order, and the example to open with. */
export function generatorForm(g: SimulatedGenerator): GeneratorInfo {
  const schema = z.toJSONSchema(g.params, { io: 'input', unrepresentable: 'any' }) as Json
  const props = (schema.properties ?? {}) as Record<string, Json>
  const required = new Set((schema.required ?? []) as string[])
  const inputs = Object.entries(props).map(([key, p]): GeneratorInput => {
    const field = g.fields?.[key]
    return {
      key,
      label: field?.label ?? humanize(key),
      ...(field?.help ? { help: field.help } : {}),
      required: required.has(key) && p.default === undefined,
      ...kindOf(p),
    }
  })
  return {
    id: g.id,
    label: g.label,
    ...(g.description ? { description: g.description } : {}),
    toolkits: [...(g.toolkits ?? [])],
    inputs,
    example: (g.example ?? {}) as Record<string, unknown>,
  }
}
