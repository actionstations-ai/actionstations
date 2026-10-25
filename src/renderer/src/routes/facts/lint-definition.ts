// A fact category's lint definition as the facts editor edits it (#180): the form state, its
// validation (the same rules main enforces, from @shared/domains), and the project:update
// overrides that save it. Overrides replace whole fields, so the whole factCategories list
// is written, and the other overrides the project has are kept.
import {
  baseProfile,
  factCategoryProblems,
  type DomainProfileOverrides,
  type FactCategory,
  type FactCategoryField,
} from '@shared/domains'
import type { Project } from '@shared/schemas'

export type IdShape = FactCategory['idShape']

export const ID_SHAPES: { value: IdShape; label: string }[] = [
  { value: 'alnum', label: 'Letters and numbers: A1, 14, B12, ranges such as A1–A8' },
  { value: 'number', label: 'Numbers only: 3, 14, #22' },
  { value: 'runway', label: 'Runway pairs: 5/23 and each end' },
  { value: 'token', label: 'Noun glued to a number: RTU-07, PLC-3' },
]

export interface DefinitionDraft {
  noun: string
  genericNoun: string
  context: string
  idShape: IdShape
  lint: boolean
  complete: boolean
}

export type DefinitionErrors = Partial<Record<FactCategoryField, string>>

export const draftOf = (c: FactCategory): DefinitionDraft => ({
  noun: c.noun ?? '',
  genericNoun: c.genericNoun ?? '',
  context: c.context ?? '',
  idShape: c.idShape,
  lint: c.lint,
  complete: c.complete,
})

/** The edited definition: blank optional fields are dropped, the rest kept from `base`. */
export function specOf(base: FactCategory, d: DefinitionDraft): FactCategory {
  const { noun: _n, genericNoun: _g, context: _c, ...rest } = base
  const noun = d.noun.trim()
  const genericNoun = d.genericNoun.trim()
  const context = d.context.trim()
  return {
    ...rest,
    ...(noun || !base.pattern ? { noun } : {}),
    ...(genericNoun ? { genericNoun } : {}),
    ...(genericNoun || context ? { context } : {}),
    idShape: d.idShape,
    lint: d.lint,
    complete: d.complete,
  }
}

/** Field → message; empty when the definition can be saved. */
export function definitionErrors(spec: FactCategory): DefinitionErrors {
  const out: DefinitionErrors = {}
  for (const p of factCategoryProblems(spec)) out[p.field] ??= p.message
  return out
}

/** JSON with object keys sorted, so key order does not count as a difference. */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  )
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b)

/** The domain's own definition of a category (before the project's overrides). */
export function domainDefinition(project: Project, id: string): FactCategory | undefined {
  return baseProfile(project.orgType, project.domainProfileSnapshot).factCategories.find(
    (c) => c.id === id,
  )
}

/** The project's overrides with `categories` as its factCategories (dropped when it is the domain's). */
function withCategories(
  project: Project,
  categories: FactCategory[],
): DomainProfileOverrides | null {
  const { factCategories: _old, ...rest } = project.domainProfileOverrides ?? {}
  const base = baseProfile(project.orgType, project.domainProfileSnapshot).factCategories
  const next: DomainProfileOverrides = same(categories, base)
    ? rest
    : { ...rest, factCategories: categories }
  return Object.keys(next).length ? next : null
}

/** Overrides that save `spec` in place of its category in the effective list `current`. */
export function overridesWith(
  project: Project,
  current: FactCategory[],
  spec: FactCategory,
): DomainProfileOverrides | null {
  return withCategories(
    project,
    current.map((c) => (c.id === spec.id ? spec : c)),
  )
}

/** Overrides that put the domain's definition of `id` back. */
export function overridesWithDefault(
  project: Project,
  current: FactCategory[],
  id: string,
): DomainProfileOverrides | null {
  const original = domainDefinition(project, id)
  return original ? overridesWith(project, current, original) : withCategories(project, current)
}

/** True when the project's definition of `id` differs from the domain's. */
export function isCustomized(project: Project, current: FactCategory[], id: string): boolean {
  const original = domainDefinition(project, id)
  const mine = current.find((c) => c.id === id)
  return !!mine && !same(mine, original)
}
