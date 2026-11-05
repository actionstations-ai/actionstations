import { useIpcQuery } from '../../lib/query'
import { useProjectUi } from '../../state/project'

/** Names of the roles in the open project's most recent scenario; empty with no project. */
export function useProjectRoles(): string[] {
  const projectPath = useProjectUi((s) => s.projectPath)
  const enabled = !!projectPath
  const scenarios = useIpcQuery('scenarios:list', { projectPath: projectPath ?? '' }, { enabled })
  const latest = [...(scenarios.data ?? [])].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )[0]
  const scenario = useIpcQuery(
    'scenarios:get',
    { projectPath: projectPath ?? '', scenarioId: latest?.id ?? '' },
    { enabled: enabled && !!latest },
  )
  return [...new Set((scenario.data?.roles ?? []).map((r) => r.name))]
}
