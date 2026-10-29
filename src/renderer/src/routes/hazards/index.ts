import { lazy } from 'react'
import type { RouteDef } from '../types'

// Optional public hazard data for the project's area (#439). Off until turned on in Settings.
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/hazards',
    component: lazy(() => import('./HazardsPage')),
    nav: {
      label: 'Hazard context',
      scope: 'project',
      order: 76,
      icon: 'hazards',
      group: 'advanced',
    },
  },
]
