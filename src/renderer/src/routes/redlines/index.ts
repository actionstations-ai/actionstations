import { lazy } from 'react'
import type { RouteDef } from '../types'

// Proposed plan edits from an exercise's AAR/IP (#431), exported as tracked changes or a memo.
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/redlines',
    component: lazy(() => import('./RedlinesPage')),
    nav: { label: 'Redlines', scope: 'project', order: 70, icon: 'redlines', group: 'advanced' },
  },
]
