// Mounts the optional follow-on jobs after generation (auto-continue.ts) once per app.
import { useEffect } from 'react'
import { toast } from '../../components/toast-store'
import { subscribe } from '../../lib/api'
import { continueAfter } from './auto-continue'

export function AutoContinue() {
  useEffect(() => {
    const autoStarted = new Set<string>()
    return subscribe('job:done', (e) => {
      continueAfter(e, autoStarted).catch((err) =>
        toast.error('Could not continue automatically', err),
      )
    })
  }, [])
  return null
}
