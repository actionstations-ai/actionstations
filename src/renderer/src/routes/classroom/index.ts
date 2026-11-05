import { lazy } from 'react'
import type { RouteDef } from '../types'

// Classroom and course use (#686, spec 0453): roster, outcomes, rubrics, scoring, dashboard.
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/classroom',
    component: lazy(() => import('./ClassroomPage')),
    nav: {
      label: 'Classroom',
      scope: 'project',
      order: 76,
      icon: 'classroom',
      group: 'advanced',
    },
  },
]
