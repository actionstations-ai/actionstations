import { lazy } from 'react'
import type { RouteDef } from '../types'

// The exercise program (#424): overview, corrective actions, the IPP schedule and the AAR/IP
// import review. The folder itself is chosen by the user; nothing here runs before that.
export const routes: RouteDef[] = [
  {
    path: '/program',
    component: lazy(() => import('./ProgramPage')),
    nav: { label: 'Program', scope: 'global', order: 5, icon: 'program' },
  },
  { path: '/program/actions', component: lazy(() => import('./ActionsPage')) },
  { path: '/program/actions/:id', component: lazy(() => import('./ActionsPage')) },
  { path: '/program/schedule', component: lazy(() => import('./SchedulePage')) },
  {
    path: '/program/import/:projectKey/:scenarioId',
    component: lazy(() => import('./ImportAarPage')),
  },
]
