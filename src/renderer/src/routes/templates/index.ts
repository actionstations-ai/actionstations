import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/templates',
    component: lazy(() => import('./TemplatesPage')),
    nav: { label: 'Templates', scope: 'global', order: 75, icon: 'injects' },
  },
]
