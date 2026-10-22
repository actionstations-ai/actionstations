import { Button, Dialog } from '../../components/ui'

/** Confirm "Reset to extracted facts": the current file goes to the history first. */
export function ResetDialog(props: {
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Reset to the extracted facts?"
      description="facility-facts.md is rewritten from the project's documents. Entries you added, edited or removed are discarded, and so are unsaved changes on this page. The current file is kept in .cache/facility-facts-history/."
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button variant="danger" onClick={props.onConfirm} disabled={props.pending}>
            {props.pending ? 'Resetting…' : 'Reset'}
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}
