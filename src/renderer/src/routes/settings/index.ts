import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/settings',
    component: lazy(() => import('./SettingsPage')),
    nav: { label: 'Settings', scope: 'global', order: 90, icon: 'settings' },
  },
]
