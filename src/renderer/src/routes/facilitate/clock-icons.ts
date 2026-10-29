// Icons for regulatory clock statuses (#426), shared by the clocks strip and the room display.
// Each status is also written out in words; the icon never stands alone.
import {
  AlarmClock,
  CheckCircle2,
  Hourglass,
  MinusCircle,
  Timer,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { ClockStatus } from '@shared/compliance/clock'

export const STATUS_ICON: Record<ClockStatus, LucideIcon> = {
  waiting: Hourglass,
  running: Timer,
  due_soon: AlarmClock,
  overdue: TriangleAlert,
  met: CheckCircle2,
  missed: XCircle,
  waived: MinusCircle,
}
