import { lazy } from 'react'
import type { RouteDef } from '../types'

const PromptsPage = lazy(() => import('./PromptsPage'))

export const routes: RouteDef[] = [
  {
    path: '/prompts',
    component: PromptsPage,
    nav: { label: 'Prompts', scope: 'global', order: 70, icon: 'prompts' },
  },
  {
    path: '/p/:projectKey/prompts',
    component: PromptsPage,
    nav: { label: 'Prompt overrides', scope: 'project', order: 70, icon: 'prompts' },
  },
]
