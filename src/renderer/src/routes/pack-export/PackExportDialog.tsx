// The Export as pack wizard in a dialog, for a button on the Packs screen (#268, #271).
import { Dialog } from '../../components/ui'
import { PackExportWizard } from './PackExportWizard'

export function PackExportDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselect this project for the domain, documents and example. */
  projectPath?: string | null
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Export as pack"
      description="Build an .aspack from your own templates, prompts, workflows and a project."
    >
      {props.open && (
        <PackExportWizard
          projectPath={props.projectPath ?? null}
          onClose={() => props.onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}
