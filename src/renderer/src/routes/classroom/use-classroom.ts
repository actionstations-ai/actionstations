import { useParams } from 'react-router'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'
import { toast } from '../../components/toast-store'
import { fromProjectKey } from '../../state/project'

/** Reload every classroom:* query after a change. */
export const refreshClassroom = (): Promise<void> =>
  queryClient.invalidateQueries({
    predicate: (q) => String(q.queryKey[0]).startsWith('classroom:'),
  })

/** The open project's path and Classroom state. */
export function useClassroom() {
  const { projectKey = '' } = useParams()
  const projectPath = fromProjectKey(projectKey)
  const state = useIpcQuery('classroom:get', { projectPath })
  return { projectPath, state }
}

/** Run a change, refresh, and report a failure in plain words. */
export async function change(title: string, run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run()
    await refreshClassroom()
    return true
  } catch (e) {
    toast.error(title, errorText(e))
    return false
  }
}

export { call }
