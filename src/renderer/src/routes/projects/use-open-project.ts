import { useNavigate } from 'react-router'
import type { OpenProject } from '@shared/schemas'
import { toast } from '../../components/toast-store'
import { call, IpcError } from '../../lib/api'
import { queryClient } from '../../lib/query'
import { projectKey, useProjectUi } from '../../state/project'
import { errorText } from '../../lib/errors'

const openError = (err: unknown): string =>
  err instanceof IpcError && err.code === 'NOT_FOUND'
    ? 'That folder has no project.json. Choose a .ttxproj folder created by Action Stations.'
    : errorText(err)

/** Open a project folder (registers it as recent) and go to its overview. */
export function useOpenProject() {
  const navigate = useNavigate()
  const setProjectPath = useProjectUi((s) => s.setProjectPath)

  const enter = (opened: OpenProject) => {
    setProjectPath(opened.path)
    void queryClient.invalidateQueries({ queryKey: ['project:list-recent'] })
    void navigate(`/p/${projectKey(opened.path)}`)
  }

  const open = async (path: string): Promise<void> => {
    try {
      enter(await call('project:open', { path }))
    } catch (err) {
      toast.error('Could not open project', new Error(openError(err)))
    }
  }

  const pickAndOpen = async (): Promise<void> => {
    const path = await call('dialog:open-directory', { title: 'Open a .ttxproj project folder' })
    if (path) await open(path)
  }

  return { open, pickAndOpen, enter }
}
