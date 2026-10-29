import { queryClient } from '../../lib/query'

/** Reload every regional:* query after a change. */
export const refreshRegional = (): Promise<void> =>
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('regional:') })
