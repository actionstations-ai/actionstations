import { lazy } from 'react'
import type { RouteDef } from '../types'

// Loaded only by the presentation window (main/facilitator/present.ts); never in the nav.
export const routes: RouteDef[] = [
  {
    path: '/present/:projectKey/:scenarioId/vote/:voteId',
    component: lazy(() => import('./PresentVote')),
  },
  {
    path: '/present/:projectKey/:scenarioId/decision/:decisionId',
    component: lazy(() => import('./PresentDecision')),
  },
  {
    path: '/present/:projectKey/:scenarioId/hotwash/board',
    component: lazy(() => import('./PresentHotwash')),
  },
  {
    path: '/present/:projectKey/:scenarioId/:injectId',
    component: lazy(() => import('./PresentPage')),
  },
]
