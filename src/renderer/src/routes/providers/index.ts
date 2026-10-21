import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/providers',
    component: lazy(() => import('./ProvidersPage')),
    nav: { label: 'Providers', scope: 'global', order: 80, icon: 'settings' },
  },
  {
    path: '/p/:projectKey/providers',
    component: lazy(() => import('./ProjectProvidersPage')),
    nav: { label: 'Providers', scope: 'project', order: 30, icon: 'settings' },
  },
]
