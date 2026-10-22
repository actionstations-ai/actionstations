import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/facilitate',
    component: lazy(() => import('./FacilitateIndexPage')),
    nav: { label: 'Facilitate', scope: 'project', order: 55, icon: 'facilitate' },
  },
  {
    path: '/p/:projectKey/scenarios/:scenarioId/facilitate',
    component: lazy(() => import('./FacilitatePage')),
  },
]
