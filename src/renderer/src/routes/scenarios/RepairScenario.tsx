// "Repair this scenario" (#200): generate:repair fixes a finished scenario in place with the
// current repairs and checks (ADR-0015) instead of regenerating it. Lives with the Stages list
// under Advanced information; progress shows in the job banner and the generation log.
import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { Button, Dialog } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call, IpcError } from '../../lib/api'
import { trackJob } from '../../state/jobs'

function RepairDialog(props: {
  open: boolean
  onCancel: () => void
  onConfirm: (aiStills: boolean) => void
}) {
  const [stills, setStills] = useState(false)
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && props.onCancel()}
      title="Repair this scenario?"
      description="Applies the current MSEL repairs and checks, rewrites only the injects whose rows changed or that are missing, and re-renders only stale or missing cards. Everything else stays as it is, and the scenario history keeps the previous version."
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => props.onConfirm(stills)}>
            Repair
          </Button>
        </>
      }
    >
      <label className="row">
        <input type="checkbox" checked={stills} onChange={(e) => setStills(e.target.checked)} />
        <span>Also generate missing AI stills (uses the image provider)</span>
      </label>
    </Dialog>
  )
}

export function RepairScenario(props: {
  projectPath: string
  scenarioId: string
  busy: boolean
  onJob: (jobId: string) => void
}) {
  const { projectPath, scenarioId } = props
  const [open, setOpen] = useState(false)
  const repair = async (aiStills: boolean) => {
    setOpen(false)
    try {
      const { jobId } = await call('generate:repair', {
        projectPath,
        scenarioId,
        ...(aiStills ? {} : { aiStills: 0 }),
      })
      trackJob(jobId, { kind: 'repair-scenario', projectPath, scenarioId })
      props.onJob(jobId)
    } catch (e) {
      const conflict = e instanceof IpcError && e.code === 'CONFLICT'
      toast.error(
        conflict ? 'A generation job is already running for this scenario' : 'Could not repair',
        e,
      )
    }
  }
  return (
    <>
      <Button size="sm" disabled={props.busy} onClick={() => setOpen(true)}>
        <Wrench size={14} aria-hidden /> Repair this scenario
      </Button>
      <RepairDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={(stills) => void repair(stills)}
      />
    </>
  )
}
