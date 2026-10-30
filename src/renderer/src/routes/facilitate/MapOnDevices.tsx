// "Map on devices" (#500, spec 0436 FR-8): share the shown map with the devices in a live session.
// Each device sees only the places of messages that reached its seat. The control appears only
// while a session runs; a session that ends takes the map with it.
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'

export function MapOnDevices(props: { projectPath: string; scenarioId: string; mapId: string }) {
  const req = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const status = useIpcQuery('live:session-status', req)
  const active = !!status.data?.session && !status.data.session.endedAt
  const shared = useIpcQuery('live:map-shared', req, { enabled: active })
  if (!active) return null
  const on = shared.data?.mapId === props.mapId
  const change = (mapId: string | undefined) =>
    call('live:map-share', { ...req, ...(mapId ? { mapId } : {}) })
      .then(() => queryClient.invalidateQueries({ queryKey: ['live:map-shared'] }))
      .catch((e: unknown) => toast.error('Could not change the map on devices', errorText(e)))
  return (
    <label className="row">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => void change(e.target.checked ? props.mapId : undefined)}
      />
      Map on devices
    </label>
  )
}
