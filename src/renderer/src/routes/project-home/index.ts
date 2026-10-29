import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey',
    component: lazy(() => import('./ProjectHomePage')),
    nav: { label: 'Overview', scope: 'project', order: 10, icon: 'folder' },
  },
  {
    path: '/p/:projectKey/privacy',
    component: lazy(() => import('./ProjectPrivacyPage')),
    nav: {
      label: 'Cloud and privacy',
      scope: 'project',
      order: 82,
      icon: 'privacy',
      group: 'advanced',
    },
  },
]
