import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/projects',
    component: lazy(() => import('./ProjectsPage')),
    nav: { label: 'Projects', scope: 'global', order: 0, icon: 'folder' },
  },
]
