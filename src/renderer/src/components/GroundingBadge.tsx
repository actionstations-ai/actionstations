// Source-check badge (#423): Grounded / Needs review / Unsupported as a word with an icon, in
// the app's status badge tones, so colour is never the only signal. The accessible name says
// who set the label (the automatic check, the model, or the user). Renders nothing for an item
// that makes no plan claim.
import { clsx } from 'clsx'
import { CircleAlert, CircleCheck, CircleHelp, UserPen, type LucideIcon } from 'lucide-react'
import type { GroundingResult } from '@shared/schemas/grounding'
import {
  LABEL_SHORT,
  LABEL_TEXT,
  LABEL_TONE,
  accessibleLabel,
  labelSource,
  shownLabel,
  type ShownLabel,
} from '../lib/grounding'
import './grounding.css'

const ICON: Record<ShownLabel, LucideIcon> = {
  grounded: CircleCheck,
  review: CircleHelp,
  unsupported: CircleAlert,
}

export function GroundingBadge(props: {
  result: GroundingResult | undefined
  /** The grid's short word ("Review") with the full label for screen readers. */
  compact?: boolean
  className?: string
}) {
  const label = shownLabel(props.result)
  if (!props.result || !label) return null
  const Icon = ICON[label]
  const name = accessibleLabel(props.result)
  return (
    <span
      className={clsx('badge', `badge--${LABEL_TONE[label]}`, 'grounding-badge', props.className)}
      role="img"
      aria-label={name}
      title={`${name}. ${props.result.reason}`}
      data-testid="grounding-badge"
      data-label={label}
    >
      <Icon size={12} aria-hidden />
      {props.compact ? LABEL_SHORT[label] : LABEL_TEXT[label]}
      {labelSource(props.result) === 'you' && <UserPen size={12} aria-hidden />}
    </span>
  )
}
