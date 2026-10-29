// The model check for SimCell replies (spec 0429 FR-21, FR-22): what the model routed to the
// `roleplay` task scored, which checks it failed, and a button to run the checks again. Shown
// on the SimCell panel and on the Providers page.
import { useState } from 'react'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { useJob } from '../generate/use-job'
import { LEVEL_ADVICE, LEVEL_TEXT } from './simcell-model'

export function CapabilityStatus({ projectPath }: { projectPath?: string }) {
  const view = useIpcQuery('simcell:capability', projectPath ? { projectPath } : {})
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJob(jobId, (e) => {
    setJobId(null)
    void queryClient.invalidateQueries({ queryKey: ['simcell:capability'] })
    if (e.status === 'error') toast.error('The SimCell model check failed', e.error)
  })
  const running = jobId !== null && job?.status !== 'error'
  const run = async () => {
    try {
      setJobId((await call('simcell:capability-run', projectPath ? { projectPath } : {})).jobId)
    } catch (e) {
      toast.error('Could not start the model check', e)
    }
  }
  const data = view.data
  return (
    <div className="fac-simcell__gate" data-testid="simcell-capability">
      {data ? (
        <p>
          <strong>Model check: {LEVEL_TEXT[data.level]}.</strong> Passed {data.passed.length} of{' '}
          {data.passed.length + data.failed.length} checks for {data.model}.{' '}
          {LEVEL_ADVICE[data.level]}
        </p>
      ) : (
        <p className="fac-hint">
          The model that writes SimCell replies has not been checked yet. The check takes a minute.
        </p>
      )}
      {data && data.failed.length > 0 && (
        <ul aria-label="Checks that failed" className="fac-simcell__failed">
          {data.failed.map((id) => (
            <li key={id}>Failed: {data.labels[id] ?? id}</li>
          ))}
        </ul>
      )}
      <Button size="sm" onClick={() => void run()} disabled={running}>
        {running ? 'Checking…' : data ? 'Check now' : 'Check the model'}
      </Button>
    </div>
  )
}
