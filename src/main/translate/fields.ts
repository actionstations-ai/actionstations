// Which fields of an inject are human language (spec 0435 FR-3). A string field is translated
// unless its JSON Schema has `enum`, `const`, `pattern`, `format`, a `maxLength` of 8 or less
// or `"x-translate": false`.
// Identifiers, handles, codes, phone numbers, URLs and times are marked that way by templates.
// Nested objects and arrays of objects are walked; anything else (a $ref, oneOf, a number) stays
// as written.

type Json = Record<string, unknown>

/** A string field with a `maxLength` this small is a code or initials, kept as written. */
const SHORT_FIELD_LIMIT = 8

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

/** True for a string schema whose value is prose a person reads. */
export function isTranslatableSchema(schema: unknown): boolean {
  if (!isObj(schema)) return false
  if (schema['x-translate'] === false) return false
  if (schema.type !== 'string') return false
  if ('enum' in schema || 'const' in schema || 'pattern' in schema || 'format' in schema)
    return false
  // Initials, codes and short labels: a limit this small leaves no room for a translation.
  return !(typeof schema.maxLength === 'number' && schema.maxLength <= SHORT_FIELD_LIMIT)
}

const isContainer = (schema: unknown): schema is Json =>
  isObj(schema) && (schema.type === 'object' || schema.type === 'array' || !!schema.properties)

/**
 * The translatable part of `value`, in the same shape (objects keep only translatable keys,
 * arrays keep their length). Undefined when nothing in it is translatable or non-empty.
 */
export function extractTranslatable(schema: unknown, value: unknown): unknown {
  if (isObj(schema) && schema['x-translate'] === false) return undefined
  if (isTranslatableSchema(schema)) {
    return typeof value === 'string' && value.trim() ? value : undefined
  }
  if (!isContainer(schema)) return undefined
  if (Array.isArray(value) && isObj(schema.items)) {
    const items = value.map((v) => extractTranslatable(schema.items, v))
    return items.some((v) => v !== undefined) ? items.map((v) => v ?? null) : undefined
  }
  if (isObj(value) && isObj(schema.properties)) {
    const out: Json = {}
    for (const [key, sub] of Object.entries(schema.properties)) {
      const part = extractTranslatable(sub, value[key])
      if (part !== undefined) out[key] = part
    }
    return Object.keys(out).length ? out : undefined
  }
  return undefined
}

/** Fields of an inject reduced to their translatable part ({} when there is none). */
export function translatableFields(schema: unknown, fields: Json): Json {
  const part = extractTranslatable(schema, fields)
  return isObj(part) ? part : {}
}

/**
 * `source` with the translated strings put in. Only positions the schema marks translatable
 * and that hold a string in `translated` are replaced; anything else the model returned (extra
 * keys, changed codes, a different shape) is ignored.
 */
export function mergeTranslated(schema: unknown, source: unknown, translated: unknown): unknown {
  if (isObj(schema) && schema['x-translate'] === false) return source
  if (isTranslatableSchema(schema)) {
    return typeof source === 'string' && typeof translated === 'string' && translated.trim()
      ? translated
      : source
  }
  if (!isContainer(schema)) return source
  if (Array.isArray(source) && isObj(schema.items)) {
    const t = Array.isArray(translated) ? translated : []
    return source.map((s, i) => mergeTranslated(schema.items, s, t[i]))
  }
  if (isObj(source) && isObj(schema.properties)) {
    const t = isObj(translated) ? translated : {}
    const out: Json = { ...source }
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in source) out[key] = mergeTranslated(sub, source[key], t[key])
    }
    return out
  }
  return source
}

/** The translated fields over the English ones: what a translated render uses. */
export function applyTranslation(
  schema: unknown,
  fields: Json,
  translated: Json | undefined,
): Json {
  if (!translated) return fields
  const merged = mergeTranslated(schema, fields, translated)
  return isObj(merged) ? merged : fields
}
