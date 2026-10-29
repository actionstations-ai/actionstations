import { lazy } from 'react'
import type { RouteDef } from '../types'

// The hot wash transcript editor (#425), opened from Facilitate › Hot wash › Recordings.
export const routes: RouteDef[] = [
  {
    path: '/p/:projectKey/scenarios/:scenarioId/hotwash/:recordingId',
    component: lazy(() => import('./TranscriptPage')),
  },
]
