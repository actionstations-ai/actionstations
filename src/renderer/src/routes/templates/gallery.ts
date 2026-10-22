// Pure helpers for the template gallery: categories from the inject taxonomy and a flat
// field list from each template's JSON Schema.
import type { TemplateInfo } from '@shared/ipc'
import { INJECT_CATEGORIES, injectTypeInfo, type InjectCategory } from '@shared/taxonomy'

export type GalleryCategory = InjectCategory | 'other'

export const CATEGORY_LABELS: Record<GalleryCategory, string> = {
  social: 'Social media',
  news: 'News & press',
  internal: 'Internal comms',
  voice: 'Voice & radio',
  technical: 'Technical evidence',
  operational: 'Operational displays',
  documents: 'Documents & forms',
  control: 'Facilitator control',
  other: 'Other',
}

export const categoryOf = (type: string): GalleryCategory =>
  injectTypeInfo(type)?.category ?? 'other'

/** Categories that have at least one template, in taxonomy order. */
export function categoriesPresent(templates: readonly TemplateInfo[]): GalleryCategory[] {
  const present = new Set(templates.map((t) => categoryOf(t.type)))
  return [...INJECT_CATEGORIES, 'other' as const].filter((c) => present.has(c))
}

export function filterTemplates(
  templates: readonly TemplateInfo[],
  category: GalleryCategory | 'all',
): TemplateInfo[] {
  return templates.filter((t) => category === 'all' || categoryOf(t.type) === category)
}

export const variantsOf = (t: Pick<TemplateInfo, 'variants'>): string[] =>
  t.variants.length ? t.variants : ['default']

export interface SchemaField {
  name: string
  type: string
  required: boolean
  description?: string
  options?: string[]
}

type JsonSchema = {
  type?: string | string[]
  enum?: unknown[]
  description?: string
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
}

function describeType(s: JsonSchema): string {
  if (s.enum) return 'choice'
  const type = Array.isArray(s.type) ? s.type.join(' | ') : (s.type ?? 'any')
  if (type === 'array' && s.items) return `list of ${describeType(s.items)}`
  return type
}

/** Top-level fields of a template schema, required ones first. */
export function schemaFields(schema: Record<string, unknown>): SchemaField[] {
  const s = schema as JsonSchema
  const required = new Set(s.required ?? [])
  return Object.entries(s.properties ?? {})
    .map(([name, prop]) => ({
      name,
      type: describeType(prop),
      required: required.has(name),
      ...(prop.description ? { description: prop.description } : {}),
      ...(prop.enum ? { options: prop.enum.map(String) } : {}),
    }))
    .sort((a, b) => Number(b.required) - Number(a.required))
}
