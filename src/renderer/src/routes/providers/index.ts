import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/providers',
    component: lazy(() => import('./ProvidersPage')),
    nav: { label: 'Providers', scope: 'global', order: 65, icon: 'providers' },
  },
  {
    path: '/p/:projectKey/providers',
    component: lazy(() => import('./ProjectProvidersPage')),
    nav: {
      label: 'Provider routing',
      scope: 'project',
      order: 80,
      icon: 'providers',
      group: 'advanced',
    },
  },
]
