// Move up / move down / remove buttons of one list row, labelled "<noun> <n>".
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui'

export function RowActions(props: {
  index: number
  count: number
  noun: string
  onMove: (delta: number) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const n = props.index + 1
  return (
    <div className="row-actions">
      <Button
        size="sm"
        variant="ghost"
        icon
        aria-label={`Move ${props.noun} ${n} up`}
        disabled={props.index === 0}
        onClick={() => props.onMove(-1)}
      >
        <ArrowUp size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon
        aria-label={`Move ${props.noun} ${n} down`}
        disabled={props.index === props.count - 1}
        onClick={() => props.onMove(1)}
      >
        <ArrowDown size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon
        aria-label={`Remove ${props.noun} ${n}`}
        disabled={!props.canRemove}
        onClick={props.onRemove}
      >
        <Trash2 size={14} aria-hidden />
      </Button>
    </div>
  )
}
