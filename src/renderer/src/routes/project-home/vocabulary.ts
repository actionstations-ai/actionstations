// "Customize vocabulary" (#169): edit a few domain-profile lists per project. An override
// replaces the whole built-in field (ADR-0014), so a list equal to the built-in one is
// stored as no override at all.
import {
  builtinProfile,
  type DomainProfile,
  type DomainProfileOverrides,
  type RoleTemplate,
} from '@shared/domains'

export type VocabField = 'roles' | 'outsideParties' | 'systemsIt' | 'systemsOt'

export const VOCAB_FIELDS: readonly { field: VocabField; label: string; placeholder: string }[] = [
  { field: 'roles', label: 'Player roles', placeholder: 'e.g. Bus Operations Supervisor' },
  { field: 'outsideParties', label: 'Outside parties', placeholder: 'e.g. County OEM' },
  { field: 'systemsIt', label: 'IT systems', placeholder: 'e.g. Fare collection back office' },
  { field: 'systemsOt', label: 'OT / control systems', placeholder: 'e.g. Traction power SCADA' },
]

export type VocabLists = Record<VocabField, string[]>

function listsOf(p: Pick<DomainProfile, 'roles' | 'outsideParties' | 'systems'>): VocabLists {
  return {
    roles: p.roles.map((r) => r.name),
    outsideParties: [...p.outsideParties],
    systemsIt: [...p.systems.it],
    systemsOt: [...p.systems.ot],
  }
}

/** The lists the generator will use: the overrides where set, else the built-in profile's. */
export function vocabLists(orgType: string, overrides: DomainProfileOverrides): VocabLists {
  const base = builtinProfile(orgType)
  return listsOf({
    roles: overrides.roles ?? base.roles,
    outsideParties: overrides.outsideParties ?? base.outsideParties,
    systems: overrides.systems ?? base.systems,
  })
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

const initials = (name: string) =>
  name
    .split(/[\s/-]+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 6)

/** Role names → role templates, keeping the details of roles that already exist. */
function rolesFor(names: string[], known: readonly RoleTemplate[]): RoleTemplate[] {
  return names.map(
    (name) =>
      known.find((r) => r.name === name) ?? {
        key: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, ''),
        name,
        abbreviation: initials(name),
        team: '',
        description: '',
      },
  )
}

function without<K extends keyof DomainProfileOverrides>(
  o: DomainProfileOverrides,
  key: K,
): DomainProfileOverrides {
  const next = { ...o }
  delete next[key]
  return next
}

/** Set one list; a list equal to the built-in one removes the override. */
export function setVocabList(
  orgType: string,
  overrides: DomainProfileOverrides,
  field: VocabField,
  items: string[],
): DomainProfileOverrides {
  const base = builtinProfile(orgType)
  const builtIn = listsOf(base)
  if (field === 'roles') {
    if (sameList(items, builtIn.roles)) return without(overrides, 'roles')
    return { ...overrides, roles: rolesFor(items, [...(overrides.roles ?? []), ...base.roles]) }
  }
  if (field === 'outsideParties') {
    if (sameList(items, builtIn.outsideParties)) return without(overrides, 'outsideParties')
    return { ...overrides, outsideParties: items }
  }
  const current = overrides.systems ?? base.systems
  const systems =
    field === 'systemsIt' ? { it: items, ot: current.ot } : { it: current.it, ot: items }
  if (sameList(systems.it, base.systems.it) && sameList(systems.ot, base.systems.ot))
    return without(overrides, 'systems')
  return { ...overrides, systems }
}

/** Remove the overrides this editor manages; any others (set in project.json) are kept. */
export function resetVocab(overrides: DomainProfileOverrides): DomainProfileOverrides {
  return without(without(without(overrides, 'roles'), 'outsideParties'), 'systems')
}

export const customizedCount = (o: DomainProfileOverrides): number =>
  (['roles', 'outsideParties', 'systems'] as const).filter((k) => o[k] !== undefined).length
