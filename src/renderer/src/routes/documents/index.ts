import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/documents',
    component: lazy(() => import('./DocumentsPage')),
    nav: { label: 'Documents', scope: 'project', order: 20, icon: 'documents' },
  },
]
