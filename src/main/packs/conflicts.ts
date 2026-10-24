// Conflicts between packs (ADR-0018 "Registration per kind"): two enabled packs may not
// provide the same template, prompt, workflow or domain id, and pack domain profiles may not
// share an id or alias with each other or with a built-in profile. Documents and examples never
// conflict: they are always looked up together with their pack id. There is no hidden ordering
// between packs: the pack that would conflict stays disabled, and the reason names the pack in
// the way.
import { builtinByKey, bundledEntryByKey, domainKey, type DomainProfile } from '@shared/domains'
import { BUNDLED_MAP, CORE_PACK_ID, isBundledPackId } from './bundled-map'
import type { PackKind, PackManifest } from '@shared/schemas/pack'

/** Kinds whose ids share one namespace across packs (layers resolve them by id alone). */
export const CONFLICTING_KINDS = ['templates', 'prompts', 'workflows', 'domains'] as const

/** What the conflict check needs to know about a pack. */
export interface ConflictSubject {
  id: string
  name: string
  manifest: PackManifest
  domains: readonly DomainProfile[]
}

export interface PackConflict {
  kind: PackKind
  /** The item id (for domains, the id or alias both packs claim). */
  id: string
  /** The other pack (installed, or a bundled pack for a built-in domain id or alias). */
  packId: string
  packName: string
}

const domainKeys = (p: DomainProfile): string[] => [
  ...new Set([p.id, ...p.aliases].map((k) => domainKey(k)).filter(Boolean)),
]

const CORE_NAME = BUNDLED_MAP.packs.find((p) => p.id === CORE_PACK_ID)?.name ?? CORE_PACK_ID

/**
 * Domain ids or aliases of `subject` that a bundled profile already answers to, enabled or
 * not (ADR-0020): an installed pack may replace a bundled template, prompt or workflow, never a
 * bundled domain.
 */
export function builtinDomainConflicts(subject: ConflictSubject): PackConflict[] {
  const out: PackConflict[] = []
  for (const d of subject.domains)
    for (const key of domainKeys(d)) {
      if (!builtinByKey(key)) continue
      const entry = bundledEntryByKey(key)
      out.push({
        kind: 'domains',
        id: key,
        packId: entry?.packId ?? CORE_PACK_ID,
        packName: entry?.packName ?? CORE_NAME,
      })
    }
  return out
}

/** Items of `subject` that one of `others` (other packs, enabled) also provides. */
export function findConflicts(
  subject: ConflictSubject,
  others: readonly ConflictSubject[],
): PackConflict[] {
  const out: PackConflict[] = []
  for (const other of others) {
    if (other.id === subject.id) continue
    const at = { packId: other.id, packName: other.name }
    for (const kind of CONFLICTING_KINDS) {
      const theirs = new Set(other.manifest.contents[kind])
      for (const id of subject.manifest.contents[kind])
        if (theirs.has(id)) out.push({ kind, id, ...at })
    }
    const theirKeys = new Set(other.domains.flatMap(domainKeys))
    for (const d of subject.domains)
      for (const key of domainKeys(d))
        if (theirKeys.has(key) && !out.some((c) => c.kind === 'domains' && c.id === key))
          out.push({ kind: 'domains', id: key, ...at })
  }
  return out
}

/** One sentence for the Packs screen: what clashes and what to disable. */
export function conflictReason(conflicts: readonly PackConflict[]): string | undefined {
  if (!conflicts.length) return undefined
  const byPack = new Map<string, PackConflict[]>()
  for (const c of conflicts) byPack.set(c.packId, [...(byPack.get(c.packId) ?? []), c])
  const parts: string[] = []
  for (const [packId, list] of byPack) {
    const what = list.map((c) => `${c.kind} "${c.id}"`).join(', ')
    parts.push(
      isBundledPackId(packId)
        ? `It reuses domain ids or aliases of ${list[0]!.packName}, included with the app (${what}).`
        : `${list[0]!.packName} (${packId}) also provides ${what}. Disable ${list[0]!.packName} to enable this pack.`,
    )
  }
  return parts.join(' ')
}
