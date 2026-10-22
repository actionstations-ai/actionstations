import { lazy } from 'react'
import type { RouteDef } from '../types'

// No nav entry: first-run users are sent here from "/" (see FirstRunRedirect); anyone can
// reopen it at #/welcome.
export const routes: RouteDef[] = [
  {
    path: '/welcome',
    component: lazy(() => import('./WelcomePage')),
  },
]
