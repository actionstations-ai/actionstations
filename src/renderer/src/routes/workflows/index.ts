import { lazy } from 'react'
import type { RouteDef } from '../types'

const WorkflowsPage = lazy(() => import('./WorkflowsPage'))

export const routes: RouteDef[] = [
  {
    path: '/workflows',
    component: WorkflowsPage,
    nav: { label: 'Workflows', scope: 'global', order: 78, icon: 'generate' },
  },
]
