import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/generate',
    component: lazy(() => import('./GeneratePage')),
    nav: { label: 'Generate', scope: 'project', order: 45, icon: 'generate' },
  },
]
