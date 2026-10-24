// Pack domain profiles in the renderer (#263). Main owns the registry; the renderer keeps its
// own copy of the shared registry filled from domains:list, so builtinProfile, isDomainId and
// resolveProfile answer the same here as in main. Refetched on domains:changed.
import { useEffect, useSyncExternalStore } from 'react'
import {
  profilesRevision,
  registerPackProfiles,
  subscribeProfiles,
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

/** Mount once (App): keeps the renderer's registry equal to main's. */
export function DomainsSync() {
  const list = useIpcQuery('domains:list', undefined, { staleTime: Infinity })
  useEffect(() => {
    if (!list.data) return
    try {
      registerPackProfiles(packEntriesOf(list.data))
    } catch (err) {
      // Main refuses the same conflicts before answering; keep the previous set if not.
      console.warn('[domains] could not register pack profiles', err)
    }
  }, [list.data])
  useEffect(
    () =>
      subscribe('domains:changed', () => {
        void queryClient.invalidateQueries({ queryKey: ['domains:list'] })
      }),
    [],
  )
  return null
}

/** Re-render when the registered pack profiles change; returns the registry revision. */
export const useDomainRegistry = (): number =>
  useSyncExternalStore(subscribeProfiles, profilesRevision)
