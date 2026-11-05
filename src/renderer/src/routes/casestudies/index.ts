import { lazy } from 'react'
import type { RouteDef } from '../types'

// Unfolding case studies for nursing education (spec 0452): drafted from a simulated trajectory
// or imported, reviewed by the author, played one stage at a time.
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/case-studies',
    component: lazy(() => import('./CaseStudiesPage')),
    nav: {
      label: 'Case studies',
      scope: 'project',
      order: 74,
      icon: 'case-studies',
      group: 'advanced',
    },
  },
]
