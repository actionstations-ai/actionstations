import { lazy } from 'react'
import type { RouteDef } from '../types'

// Micro-drills (#437): 15-minute practice on one plan annex, with prewritten graded hints.
// Not the regression drills of #431 (routes/drills).
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/micro-drills',
    component: lazy(() => import('./MicroDrillsPage')),
    nav: {
      label: 'Micro-drills',
      scope: 'project',
      order: 73,
      icon: 'micro-drills',
      group: 'advanced',
    },
  },
]
