// Threat family registry (#655, FR-15): the built-in families (threats.ts) plus the families
// packs add, behind one lookup. Domain packs and toolkit packs both hand their families to
// `setThreatFamilySource` (one call per kind of pack content); everything that used to switch
// on the fixed id list asks this module instead. Pure module state, no Node imports.
import { THREAT_FAMILY_IDS, ThreatFamily, type ThreatFamilyId } from './schema'
import { THREAT_FAMILIES } from './threats'

/** The families one pack provides. */
export interface PackThreatFamilies {
  packId: string
  families: readonly ThreatFamily[]
}

const builtinById = new Map<string, ThreatFamily>(THREAT_FAMILIES.map((t) => [t.id, t]))
const sources = new Map<string, readonly PackThreatFamilies[]>()
let merged: ThreatFamily[] = [...THREAT_FAMILIES]
let mergedById = new Map<string, ThreatFamily>(builtinById)
let revision = 0
const listeners = new Set<() => void>()

/**
 * Validate and merge every source's families with the built-ins. Throws, naming the pack, when a
 * family fails the schema, reuses a built-in id, or its id is also provided by another pack.
 */
export function mergeThreatFamilies(all: ReadonlyMap<string, readonly PackThreatFamilies[]>): {
  list: ThreatFamily[]
  byId: Map<string, ThreatFamily>
} {
  const list: ThreatFamily[] = [...THREAT_FAMILIES]
  const byId = new Map(builtinById)
  const owner = new Map<string, string>()
  for (const entries of all.values())
    for (const { packId, families } of entries)
      for (const raw of families) {
        const family = ThreatFamily.parse(raw)
        if ((THREAT_FAMILY_IDS as readonly string[]).includes(family.id))
          throw new Error(
            `Pack ${packId}: threat family "${family.id}" is built in and cannot be redefined`,
          )
        const other = owner.get(family.id)
        if (other === packId)
          throw new Error(`Pack ${packId}: duplicate threat family "${family.id}"`)
        if (other)
          throw new Error(
            `Pack ${packId}: threat family "${family.id}" is also provided by ${other}`,
          )
        owner.set(family.id, packId)
        byId.set(family.id, family)
        list.push(family)
      }
  return { list, byId }
}

/**
 * Replace the families one kind of source provides ('domains', 'toolkits', 'bundled'…) with
 * the families of `entries` (every enabled pack of that kind, not a delta). Throws and keeps
 * the previous set when anything is invalid or two packs provide the same id.
 */
export function setThreatFamilySource(
  source: string,
  entries: readonly PackThreatFamilies[],
): void {
  const next = new Map(sources)
  next.set(source, entries)
  const { list, byId } = mergeThreatFamilies(next)
  sources.set(source, entries)
  merged = list
  mergedById = byId
  revision++
  for (const l of listeners) l()
}

/** Every registered family: the built-ins in their order, then the packs' in registration order. */
export const allThreatFamilies = (): readonly ThreatFamily[] => merged

/** Whether an id names a registered family (built-in or from an installed pack). */
export const isThreatFamilyId = (v: unknown): v is ThreatFamilyId =>
  typeof v === 'string' && mergedById.has(v)

/** The registered family an id names, if any. */
export const findThreatFamily = (id: string | undefined): ThreatFamily | undefined =>
  id === undefined ? undefined : mergedById.get(id)

export function threatFamily(id: ThreatFamilyId): ThreatFamily {
  const t = mergedById.get(id)
  if (!t) throw new Error(`Unknown threat family ${id}`)
  return t
}

/** The label of a family, or the bare id when no registered family has it (a removed pack). */
export const threatFamilyLabel = (id: string): string => mergedById.get(id)?.label ?? id

export const threatFamilyRevision = (): number => revision

export function subscribeThreatFamilies(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The threat family a free text (a brief, an idea's title/hook/threat) describes, chosen among
 * `allowed` by keyword hits; `fallback` when nothing matches. Deterministic, no model call.
 * `extra` families (a profile's own, from its snapshot) are looked up before the registry.
 */
export function inferThreatFamily(
  text: string,
  allowed: readonly ThreatFamilyId[],
  fallback: ThreatFamilyId,
  extra: readonly ThreatFamily[] = [],
): ThreatFamilyId {
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  const hit = (k: string): boolean =>
    new RegExp(`\\b${k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)
  let best: { id: ThreatFamilyId; score: number } | undefined
  for (const id of allowed) {
    const fam = extra.find((f) => f.id === id) ?? mergedById.get(id)
    if (!fam) continue
    const score = fam.keywords.reduce((n, k) => n + (hit(k) ? 1 : 0), 0)
    if (score > 0 && (!best || score > best.score)) best = { id, score }
  }
  return best?.id ?? fallback
}
