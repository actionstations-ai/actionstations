import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/search',
    component: lazy(() => import('./SearchPage')),
    nav: { label: 'Search index', scope: 'project', order: 60, icon: 'library' },
  },
]
