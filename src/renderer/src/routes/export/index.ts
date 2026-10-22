import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/scenarios/:scenarioId/export',
    component: lazy(() => import('./ExportPage')),
  },
]
