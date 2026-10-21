import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey',
    component: lazy(() => import('./ProjectHomePage')),
    nav: { label: 'Overview', scope: 'project', order: 10, icon: 'folder' },
  },
]
