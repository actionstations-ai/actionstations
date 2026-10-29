// The Test button's state (spec 0410 FR-4): one probe at a time, the checklist it returned, and
// nothing run on its own. A new test replaces the old checklist; changing the connection clears it.
import { useCallback, useState } from 'react'
import type { ConnectionTestResult, LiveConnectionInput } from '@shared/schemas/live'
import { call, type IpcError } from '../../../lib/api'

export function useConnectionTest(projectPath: string) {
  const [result, setResult] = useState<ConnectionTestResult | undefined>()
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const run = useCallback(
    async (connection: LiveConnectionInput, serverKey?: string) => {
      setTesting(true)
      setError(undefined)
      try {
        setResult(
          await call('live:connection-test', {
            projectPath,
            connection,
            ...(serverKey ? { serverKey } : {}),
          }),
        )
      } catch (err) {
        setResult(undefined)
        setError((err as IpcError).message)
      } finally {
        setTesting(false)
      }
    },
    [projectPath],
  )
  const clear = useCallback(() => {
    setResult(undefined)
    setError(undefined)
  }, [])
  return { result, testing, error, run, clear }
}
