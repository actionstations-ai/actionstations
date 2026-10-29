import { lazy } from 'react'
import type { RouteDef } from '../types'

// Surveys (#422): the scenario's surveys, and one survey's builder, preview and results.
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/scenarios/:scenarioId/surveys',
    component: lazy(() => import('./SurveysPage')),
  },
  {
    path: '/p/:projectKey/scenarios/:scenarioId/surveys/:surveyId',
    component: lazy(() => import('./SurveyPage')),
  },
]
