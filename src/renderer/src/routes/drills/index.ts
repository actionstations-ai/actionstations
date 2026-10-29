import { lazy } from 'react'
import type { RouteDef } from '../types'

// Regression drills (#431): rerun the injects that failed after the plans were updated.
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/drills',
    component: lazy(() => import('./DrillsPage')),
    nav: { label: 'Drills', scope: 'project', order: 72, icon: 'drills', group: 'advanced' },
  },
]
