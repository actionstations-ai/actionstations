// Turn a template's JSON Schema (draft 2020-12, the subset our templates use) into a tree of
// form field descriptions. Pure: no React, so the mapping is unit-tested against every real
// template schema in templates/injects/*/schema.json.

export type JsonSchema = Record<string, unknown>

interface FieldBase {
  /** Property name (or "" for array items). */
  name: string
  label: string
  description?: string
  required: boolean
  examples: unknown[]
}

export interface StringField extends FieldBase {
  kind: 'string'
  widget: 'input' | 'textarea'
  maxLength?: number
  minLength?: number
  pattern?: string
}
export interface EnumField extends FieldBase {
  kind: 'enum'
  options: (string | number)[]
}
export interface NumberField extends FieldBase {
  kind: 'number'
  integer: boolean
  minimum?: number
  maximum?: number
}
export interface NumberOrTextField extends FieldBase {
  kind: 'number-or-text'
}
export interface BooleanField extends FieldBase {
  kind: 'boolean'
}
export interface StringListField extends FieldBase {
  kind: 'string-list'
  item: StringField
  minItems?: number
  maxItems?: number
}
export interface EnumListField extends FieldBase {
  kind: 'enum-list'
  options: string[]
  maxItems?: number
}
export interface ObjectListField extends FieldBase {
  kind: 'object-list'
  item: ObjectField
  minItems?: number
  maxItems?: number
  /** Every item field is a short scalar: edit as a table, one row per item. */
  tabular: boolean
}
export interface ObjectField extends FieldBase {
  kind: 'object'
  fields: FieldSpec[]
}
export interface UnknownField extends FieldBase {
  kind: 'unknown'
}

export type FieldSpec =
  | StringField
  | EnumField
  | NumberField
  | NumberOrTextField
  | BooleanField
  | StringListField
  | EnumListField
  | ObjectListField
  | ObjectField
  | UnknownField

const LONG_TEXT_NAMES =
  /^(text|body|description|message|content|narrative|notes?|transcript|script|summary|details|quote|lede|instructions?|readAloud|situation)$/i
const LONG_TEXT_HINTS = /\b(paragraphs?|newlines?|multi-?line|full text|body text|transcript)\b/i
const TEXTAREA_MIN_LENGTH = 120
const LONG_EXAMPLE = 90

const isObj = (v: unknown): v is JsonSchema => !!v && typeof v === 'object' && !Array.isArray(v)

/** "boardTitle" → "Board title", "ics_201" → "Ics 201". */
export function humanize(name: string): string {
  const spaced = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return spaced ? spaced[0]!.toUpperCase() + spaced.slice(1) : name
}

/** Follow a local "#/$defs/x" reference against the root schema. */
export function resolveRef(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const ref = schema.$ref
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return schema
  let node: unknown = root
  for (const part of ref.slice(2).split('/')) node = isObj(node) ? node[part] : undefined
  if (!isObj(node)) return schema
  const { $ref: _ref, ...rest } = schema
  return { ...node, ...rest }
}

/** The schema's declared types as a list ("type": "string" or ["integer", "string"]). */
export function typesOf(schema: JsonSchema): string[] {
  const t = schema.type
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  if (typeof t === 'string') return [t]
  if (Array.isArray(schema.enum)) return ['string']
  return []
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

function base(name: string, schema: JsonSchema, required: boolean): FieldBase {
  const description = str(schema.description)
  return {
    name,
    label: str(schema.title) ?? humanize(name),
    ...(description ? { description } : {}),
    required,
    examples: Array.isArray(schema.examples) ? schema.examples : [],
  }
}

function wantsTextarea(name: string, schema: JsonSchema): boolean {
  const max = num(schema.maxLength)
  if (max !== undefined) return max >= TEXTAREA_MIN_LENGTH
  if (LONG_TEXT_NAMES.test(name)) return true
  if (LONG_TEXT_HINTS.test(str(schema.description) ?? '')) return true
  const examples = Array.isArray(schema.examples) ? schema.examples : []
  return examples.some(
    (e) => typeof e === 'string' && (e.length > LONG_EXAMPLE || e.includes('\n')),
  )
}

function stringField(name: string, schema: JsonSchema, required: boolean): StringField {
  const maxLength = num(schema.maxLength)
  const minLength = num(schema.minLength)
  const pattern = str(schema.pattern)
  return {
    ...base(name, schema, required),
    kind: 'string',
    widget: wantsTextarea(name, schema) ? 'textarea' : 'input',
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(minLength !== undefined ? { minLength } : {}),
    ...(pattern ? { pattern } : {}),
  }
}

function arrayField(name: string, schema: JsonSchema, required: boolean, root: JsonSchema) {
  const items = resolveRef(isObj(schema.items) ? schema.items : {}, root)
  const minItems = num(schema.minItems)
  const maxItems = num(schema.maxItems)
  const limits = {
    ...(minItems !== undefined ? { minItems } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
  }
  const b = base(name, schema, required)
  const itemTypes = typesOf(items)
  if (Array.isArray(items.enum) && itemTypes.includes('string'))
    return {
      ...b,
      kind: 'enum-list',
      options: items.enum.map(String),
      ...(maxItems !== undefined ? { maxItems } : {}),
    } satisfies EnumListField
  if (itemTypes.includes('object')) {
    const item = objectField('', items, true, root)
    return {
      ...b,
      kind: 'object-list',
      item,
      ...limits,
      tabular: isTabular(item),
    } satisfies ObjectListField
  }
  if (itemTypes.includes('string'))
    return {
      ...b,
      kind: 'string-list',
      item: stringField('', items, true),
      ...limits,
    } satisfies StringListField
  return { ...b, kind: 'unknown' } satisfies UnknownField
}

const TABULAR_MAX_FIELDS = 9

function isTabular(item: ObjectField): boolean {
  return (
    item.fields.length > 0 &&
    item.fields.length <= TABULAR_MAX_FIELDS &&
    item.fields.every(
      (f) =>
        f.kind === 'enum' ||
        f.kind === 'number' ||
        f.kind === 'boolean' ||
        f.kind === 'number-or-text' ||
        (f.kind === 'string' && f.widget === 'input'),
    )
  )
}

export function objectField(
  name: string,
  schema: JsonSchema,
  required: boolean,
  root: JsonSchema,
): ObjectField {
  const props = isObj(schema.properties) ? schema.properties : {}
  const req = new Set(Array.isArray(schema.required) ? schema.required.map(String) : [])
  const fields = Object.entries(props).map(([key, child]) =>
    fieldFor(key, isObj(child) ? child : {}, req.has(key), root),
  )
  return { ...base(name, schema, required), kind: 'object', fields }
}

/** Describe one property for the form. */
export function fieldFor(
  name: string,
  raw: JsonSchema,
  required: boolean,
  root: JsonSchema,
): FieldSpec {
  const schema = resolveRef(raw, root)
  const types = typesOf(schema)
  if (Array.isArray(schema.enum))
    return {
      ...base(name, schema, required),
      kind: 'enum',
      options: schema.enum.filter((v): v is string | number =>
        ['string', 'number'].includes(typeof v),
      ),
    }
  if (types.includes('string') && (types.includes('integer') || types.includes('number')))
    return { ...base(name, schema, required), kind: 'number-or-text' }
  if (types.includes('string')) return stringField(name, schema, required)
  if (types.includes('integer') || types.includes('number')) {
    const minimum = num(schema.minimum)
    const maximum = num(schema.maximum)
    return {
      ...base(name, schema, required),
      kind: 'number',
      integer: !types.includes('number'),
      ...(minimum !== undefined ? { minimum } : {}),
      ...(maximum !== undefined ? { maximum } : {}),
    }
  }
  if (types.includes('boolean')) return { ...base(name, schema, required), kind: 'boolean' }
  if (types.includes('array')) return arrayField(name, schema, required, root)
  if (types.includes('object') || isObj(schema.properties))
    return objectField(name, schema, required, root)
  return { ...base(name, schema, required), kind: 'unknown' }
}

/** The whole fields form for a template schema (its top-level properties). */
export function formFromSchema(schema: JsonSchema): ObjectField {
  return objectField('', schema, true, schema)
}

/** A fresh value for a new array item / required field of this spec. */
export function emptyValue(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case 'string':
      return ''
    case 'enum':
      return spec.options[0] ?? ''
    case 'number':
      return spec.minimum ?? 0
    case 'number-or-text':
      return ''
    case 'boolean':
      return false
    case 'string-list':
    case 'enum-list':
    case 'object-list':
      return []
    case 'object':
      return Object.fromEntries(
        spec.fields.filter((f) => f.required).map((f) => [f.name, emptyValue(f)]),
      )
    case 'unknown':
      return undefined
  }
}
