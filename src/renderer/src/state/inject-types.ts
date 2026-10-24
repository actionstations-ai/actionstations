// Inject types from user and pack templates in the renderer (#261). Main owns the registry;
// the renderer keeps its own copy of the shared registry filled from templates:taxonomy, so
// injectTypeInfo / injectTypes answer the same here as in main. Refetched (with templates:list)
// on templates:changed and packs:changed.
import { useEffect, useSyncExternalStore } from 'react'
import {
  injectTypes,
  registerInjectTypes,
  subscribeInjectTypes,
  type InjectTypeInfo,
} from '@shared/taxonomy'
import type { ChannelResponse } from '@shared/ipc'
import { subscribe } from '../lib/api'
import { queryClient, useIpcQuery } from '../lib/query'

/** The registered (non-built-in) entries of a templates:taxonomy answer. */
export function registeredOf(list: ChannelResponse<'templates:taxonomy'>): InjectTypeInfo[] {
  return list.filter((t) => t.source) as InjectTypeInfo[]
}

const refetch = () => {
  void queryClient.invalidateQueries({ queryKey: ['templates:taxonomy'] })
  void queryClient.invalidateQueries({ queryKey: ['templates:list'] })
}

/** Mount once (App): keeps the renderer's inject type registry equal to main's. */
export function InjectTypesSync() {
  const list = useIpcQuery('templates:taxonomy', undefined, { staleTime: Infinity })
  useEffect(() => {
    if (list.data) registerInjectTypes(registeredOf(list.data))
  }, [list.data])
  useEffect(() => {
    const offs = [subscribe('templates:changed', refetch), subscribe('packs:changed', refetch)]
    return () => offs.forEach((off) => off())
  }, [])
  return null
}

/** Built-in plus registered inject types; re-renders when the registry changes. */
export const useInjectTypes = (): readonly InjectTypeInfo[] =>
  useSyncExternalStore(subscribeInjectTypes, injectTypes)
