import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/facts',
    component: lazy(() => import('./FactsPage')),
    nav: { label: 'Facility facts', scope: 'project', order: 22, icon: 'docs' },
  },
]
