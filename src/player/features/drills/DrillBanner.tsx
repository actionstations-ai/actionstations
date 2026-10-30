import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { currentDrill } from './drills'

/** A button under the header while a drill for this seat is open. */
export function DrillBanner({
  session,
  onOpen,
  viewing,
}: {
  session: PlayerSession
  onOpen: (drillId: string) => void
  /** True while the drill screen is showing; its banner would only repeat it. */
  viewing: boolean
}) {
  const drills = useStore(session.store, (s) => s.drills)
  const seat = useStore(session.store, (s) => s.seat)
  const clientId = useStore(session.store, (s) => s.clientId)
  if (viewing || !seat) return null
  const view = { clientId, kind: seat.kind, roleId: seat.role?.id, teamId: seat.role?.teamId }
  const drill = currentDrill(drills, view)
  if (!drill) return null
  return (
    <div className="vote-banner">
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={() => onOpen(drill.drillId)}
      >
        {STRINGS.drills.bannerOpen}: {drill.title}
      </button>
    </div>
  )
}
