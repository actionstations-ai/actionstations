import { lazy } from 'react'
import type { RouteDef } from '../types'

// Regional exercises (#440): several organizations plan one exercise and exchange signed bundles.
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/regional',
    component: lazy(() => import('./RegionalPage')),
    nav: {
      label: 'Regional',
      scope: 'project',
      order: 74,
      icon: 'regional',
      group: 'advanced',
    },
  },
]
