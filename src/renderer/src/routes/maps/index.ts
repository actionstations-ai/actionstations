import { lazy } from 'react'
import type { RouteDef } from '../types'

// Maps and places (#436): site plans and geographic maps with named places pinned on them.
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/maps',
    component: lazy(() => import('./MapsPage')),
    nav: { label: 'Maps', scope: 'project', order: 75, icon: 'maps', group: 'advanced' },
  },
]
