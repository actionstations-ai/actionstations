// Cancel for any long-running job (#49): every job with a progress bar gets one.
import { Square } from 'lucide-react'
import { useState } from 'react'
import { call } from '../lib/api'
import { toast } from './toast-store'
import { Button } from './ui'

export function CancelJobButton(props: {
  jobId: string
  label?: string
  /** Accessible name when the visible label alone is ambiguous (the jobs tray). */
  ariaLabel?: string
}) {
  const [cancelling, setCancelling] = useState(false)
  const cancel = () => {
    setCancelling(true)
    call('jobs:cancel', { jobId: props.jobId }).catch((e: unknown) => {
      setCancelling(false)
      toast.error('Could not cancel', e)
    })
  }
  return (
    <Button
      size="sm"
      onClick={cancel}
      disabled={cancelling}
      {...(props.ariaLabel ? { 'aria-label': props.ariaLabel } : {})}
    >
      <Square size={12} aria-hidden /> {cancelling ? 'Cancelling…' : (props.label ?? 'Cancel')}
    </Button>
  )
}
