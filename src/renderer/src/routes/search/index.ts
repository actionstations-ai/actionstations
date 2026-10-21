import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/search',
    component: lazy(() => import('./SearchPage')),
    nav: { label: 'Search', scope: 'project', order: 25, icon: 'library' },
  },
]
