// .asexercise files handed to the app (#440): a double-clicked bundle (macOS open-file, or a
// launch argument on Windows and Linux). It opens the review on the Regional screen of the
// project that is open; nothing is applied. With no project open the user is told to open one.
import { useEffect, useEffectEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from '../../components/toast-store'
import { call, subscribe } from '../../lib/api'

export function ExerciseOpenRequests() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const open = useEffectEvent((path: string) => {
    const key = /^\/p\/([^/]+)/.exec(pathname)?.[1]
    if (!key) {
      toast.error(
        'Open a project first',
        'Open the project that will take part, then open the exercise file again.',
      )
      return
    }
    void navigate(`/p/${key}/regional?bundle=${encodeURIComponent(path)}`)
  })
  useEffect(() => {
    const off = subscribe('app:open-exercise', ({ path }) => open(path))
    void call('app:pending-exercise-opens').then((paths) => {
      const last = paths.at(-1)
      if (last) open(last)
    })
    return off
  }, [])
  return null
}
