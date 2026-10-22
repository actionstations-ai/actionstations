// The app's start route: first-run users go to the setup wizard, everyone else to Projects.
import { Navigate } from 'react-router'
import { useIpcQuery } from '../../lib/query'
import { shouldOnboard } from './wizard-state'

export function FirstRunRedirect() {
  const settings = useIpcQuery('settings:get', undefined)
  if (settings.isPending) return null
  const target = settings.data && shouldOnboard(settings.data) ? '/welcome' : '/projects'
  return <Navigate to={target} replace />
}
