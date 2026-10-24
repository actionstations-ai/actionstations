// Domain profiles in the renderer (#263, ADR-0020). Main owns the registry; the renderer keeps
// its own copy of the shared registry filled from domains:list (the bundled packs' profiles,
// enabled or not, and the enabled installed packs'), so builtinProfile, isDomainId and
// resolveProfile answer the same here as in main. Refetched on domains:changed. Until the
// first answer only the compiled-in generic profile exists, so DomainsGate holds the routes.
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import {
  profilesRevision,
  registerBundledProfiles,
  registerPackProfiles,
  subscribeProfiles,
  type BundledProfileEntry,
  type PackProfileEntry,
} from '@shared/domains'
import type { ChannelResponse } from '@shared/ipc'
import { subscribe } from '../lib/api'
import { queryClient, useIpcQuery } from '../lib/query'

type Listed = ChannelResponse<'domains:list'>

/** The pack entries of a domains:list answer. */
export function packEntriesOf(list: Listed): PackProfileEntry[] {
  return list.flatMap(({ profile, source }) =>
    source.kind === 'pack'
      ? [
          {
            profile,
            packId: source.packId,
            packVersion: source.packVersion,
            packName: source.packName,
          },
        ]
      : [],
  )
}

/** The bundled entries of a domains:list answer (enabled and disabled). */
export function bundledEntriesOf(list: Listed): BundledProfileEntry[] {
  return list.flatMap(({ profile, source }) =>
    source.kind === 'bundled'
      ? [
          {
            profile,
            packId: source.packId,
            packVersion: source.packVersion,
            packName: source.packName,
            enabled: source.enabled,
          },
        ]
      : [],
  )
}

let ready = false
const readyListeners = new Set<() => void>()
function markReady() {
  if (ready) return
  ready = true
  for (const l of readyListeners) l()
}

/** Register a domains:list answer: bundled profiles first (they reserve their ids). */
export function registerListed(list: Listed): void {
  try {
    registerBundledProfiles(bundledEntriesOf(list))
    registerPackProfiles(packEntriesOf(list))
  } catch (err) {
    // Main refuses the same conflicts before answering; keep the previous set if not.
    console.warn('[domains] could not register domain profiles', err)
  }
}

/** Mount once (App): keeps the renderer's registry equal to main's. */
export function DomainsSync() {
  const list = useIpcQuery('domains:list', undefined, { staleTime: Infinity })
  useEffect(() => {
    if (list.data) {
      registerListed(list.data)
      markReady()
    } else if (list.isError) markReady() // generic only, rather than a blank window
  }, [list.data, list.isError])
  useEffect(
    () =>
      subscribe('domains:changed', () => {
        void queryClient.invalidateQueries({ queryKey: ['domains:list'] })
      }),
    [],
  )
  return null
}

const subscribeReady = (listener: () => void): (() => void) => {
  readyListeners.add(listener)
  return () => {
    readyListeners.delete(listener)
  }
}

/** Renders its children once the first domains:list answer is registered. */
export function DomainsGate(props: { children: ReactNode }) {
  const isReady = useSyncExternalStore(subscribeReady, () => ready)
  return isReady ? props.children : null
}

/** Re-render when the registered pack profiles change; returns the registry revision. */
export const useDomainRegistry = (): number =>
  useSyncExternalStore(subscribeProfiles, profilesRevision)
