import { QueryClient, useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import { call, type IpcError } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
})

/** Query keys are [channel, request]; invalidate by channel prefix. */
export function useIpcQuery<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
  opts: Omit<UseQueryOptions<ChannelResponse<C>, IpcError>, 'queryKey' | 'queryFn'> = {},
) {
  return useQuery<ChannelResponse<C>, IpcError>({
    queryKey: [channel, req ?? null],
    queryFn: () => (call as (c: C, r: unknown) => Promise<ChannelResponse<C>>)(channel, req),
    ...opts,
  })
}

export function useIpcMutation<C extends Channel>(
  channel: C,
  opts: { invalidates?: Channel[] } = {},
) {
  return useMutation<ChannelResponse<C>, IpcError, ChannelRequest<C>>({
    mutationFn: (req) => (call as (c: C, r: unknown) => Promise<ChannelResponse<C>>)(channel, req),
    onSuccess: () => {
      for (const c of opts.invalidates ?? []) void queryClient.invalidateQueries({ queryKey: [c] })
    },
  })
}
