// Main side of the domain profile registry (ADR-0018, #263). The pack installer calls
// setPackDomainProfiles with the domain profiles of every enabled pack whenever packs are
// installed, enabled, disabled, updated or removed (and once at startup); the shared registry
// then resolves those ids for lint, fact extraction and generation, and the renderer refetches
// domains:list on the domains:changed event.
import {
  listProfiles,
  packProfileEntries,
  registerBundledProfiles,
  registerPackProfiles,
  type BundledProfileEntry,
  type ListedProfile,
  type PackProfileEntry,
} from '@shared/domains'
import { emit } from '../lib/events'

export type { PackProfileEntry }

/**
 * Replace the pack domain profiles with `entries` (all enabled packs, not a delta) and tell
 * the renderer. Throws, keeping the previous set, when a profile reuses a built-in id or
 * alias or two packs provide the same id or alias.
 */
export function setPackDomainProfiles(entries: readonly PackProfileEntry[]): void {
  registerPackProfiles(entries)
  emit('domains:changed', { packProfiles: entries.length })
}

/** Bundled then installed pack profiles with their source (the domains:list answer). */
export function listDomainProfiles(): ListedProfile[] {
  return listProfiles()
}

/**
 * Replace the bundled profiles (every bundled pack's, enabled or not) and tell the renderer.
 * state.ts calls this before it checks any installed pack against the bundled domain ids.
 */
export function setBundledDomainProfiles(entries: readonly BundledProfileEntry[]): void {
  registerBundledProfiles(entries)
  emit('domains:changed', { packProfiles: packProfileEntries().length })
}
