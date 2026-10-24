// Conflicts between packs (ADR-0018 "Registration per kind"): two enabled packs may not
// provide the same template, prompt, workflow or domain id, and pack domain profiles may not
// share an id or alias with each other or with a built-in profile. Documents and examples never
// conflict: they are always looked up together with their pack id. There is no hidden ordering
// between packs: the pack that would conflict stays disabled, and the reason names the pack in
// the way.
import { builtinByKey, domainKey, type DomainProfile } from '@shared/domains'
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
  /** The other pack, or "builtin" for a built-in domain id or alias. */
  packId: string
  packName: string
}

const domainKeys = (p: DomainProfile): string[] => [
  ...new Set([p.id, ...p.aliases].map((k) => domainKey(k)).filter(Boolean)),
]

/** Domain ids or aliases of `subject` that a built-in profile already answers to. */
export function builtinDomainConflicts(subject: ConflictSubject): PackConflict[] {
  const out: PackConflict[] = []
  for (const d of subject.domains)
    for (const key of domainKeys(d)) {
      const builtin = builtinByKey(key)
      if (builtin)
        out.push({ kind: 'domains', id: key, packId: 'builtin', packName: builtin.label })
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
      packId === 'builtin'
        ? `It reuses built-in domain ids or aliases (${what}).`
        : `${list[0]!.packName} (${packId}) also provides ${what}. Disable ${list[0]!.packName} to enable this pack.`,
    )
  }
  return parts.join(' ')
}
