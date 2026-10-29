// How a survey reaches participants. Printing works today: the form is written through the
// export path into the export folder (surveys/), where participant forms are also allowed in
// the distribution ZIP's players/ folder. Live play and phones (QR) arrive with live play.
import { FolderOpen, Printer } from 'lucide-react'
import type { Survey } from '@shared/schemas/survey'
import { Button, Dialog, ProgressBar } from '../../components/ui'
import { LiveStatus } from '../../components/LiveStatus'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useSurveyPrint } from './use-survey-print'

export function PrintStatus({ printing }: { printing: ReturnType<typeof useSurveyPrint> }) {
  const { job, result, error } = printing
  const failed = job?.status === 'error' || job?.status === 'cancelled'
  return (
    <div className="sv-print-status">
      {printing.running && job && <ProgressBar value={job.progress} label="Printing progress" />}
      {job && <LiveStatus text={job.message} />}
      {(error || failed) && (
        <p className="field__error" role="alert">
          {error || `Printing failed: ${errorText(job?.error ?? job?.message)}`}
        </p>
      )}
      {result && !printing.running && (
        <div className="row">
          <span>Saved in {result.folder}</span>
          <Button size="sm" onClick={() => void call('shell:show-item', { path: result.folder })}>
            <FolderOpen size={14} aria-hidden /> Show in Finder
          </Button>
        </div>
      )}
    </div>
  )
}

export function SurveyDeliveryDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectPath: string
  scenarioId: string
  survey: Survey
}) {
  const printing = useSurveyPrint(props.projectPath, props.scenarioId)
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Deliver this survey"
      description="Print it to hand out, then type the returned forms in on the Results tab."
      footer={<Button onClick={() => props.onOpenChange(false)}>Close</Button>}
    >
      <div className="stack">
        <section className="sv-deliver" aria-labelledby="sv-deliver-print">
          <h3 id="sv-deliver-print">Printed form</h3>
          <p className="muted">
            A PDF with boxes to tick and lines to write on, saved to the export folder. It never
            shows the correct answers.
          </p>
          <Button
            variant="primary"
            disabled={printing.running}
            onClick={() => void printing.print([props.survey.id], ['surveys_pdf'])}
          >
            <Printer size={16} aria-hidden /> {printing.running ? 'Printing…' : 'Print form'}
          </Button>
          <PrintStatus printing={printing} />
        </section>
        <section className="sv-deliver" aria-labelledby="sv-deliver-live">
          <h3 id="sv-deliver-live">On phones or in live play</h3>
          <p className="muted">
            Not available in this version yet. When live play is available, participants will answer
            on their phones by scanning the room code, and their responses will appear in the same
            results.
          </p>
        </section>
      </div>
    </Dialog>
  )
}
