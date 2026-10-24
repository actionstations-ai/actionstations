import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/packs',
    component: lazy(() => import('./PacksPage')),
    nav: { label: 'Packs', scope: 'global', order: 85, icon: 'packs' },
  },
]
