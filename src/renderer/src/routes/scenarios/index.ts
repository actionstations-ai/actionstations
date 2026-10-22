import { lazy } from 'react'
import type { RouteDef } from '../types'

export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/scenarios',
    component: lazy(() => import('./ScenariosPage')),
    nav: { label: 'Scenarios', scope: 'project', order: 50, icon: 'scenarios' },
  },
  {
    path: '/p/:projectKey/scenarios/:scenarioId',
    component: lazy(() => import('./ScenarioPage')),
  },
  {
    path: '/p/:projectKey/scenarios/:scenarioId/injects/:injectId',
    component: lazy(() => import('../../editors/inject/InjectEditorPage')),
  },
]
