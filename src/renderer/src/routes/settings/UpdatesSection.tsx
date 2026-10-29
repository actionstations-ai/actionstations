// Settings → Updates (#442): the opt-in switch, what it sends, the installed version, the last
// check and its result (announced politely), and Check now, which works whatever the setting.
import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/ipc'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { ReleaseNotesDialog } from '../../components/updates/ReleaseNotesDialog'
import {
  WHAT_IS_SENT,
  cooldownLeft,
  formatWhen,
  latestOf,
  resultText,
} from '../../components/updates/update-view'
import { openUpdatePage, setUpdates, useUpdateStatus } from '../../components/updates/use-updates'
import { call } from '../../lib/api'
import { queryClient } from '../../lib/query'
import '../../components/updates/updates.css'

/** Re-renders when the Check now cooldown ends. */
function useCooldown(lastCheckedAt: string | undefined): boolean {
  const [now, setNow] = useState(() => Date.now())
  const left = cooldownLeft(lastCheckedAt, now)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setNow(Date.now()), left + 50)
    return () => clearTimeout(t)
  }, [left])
  return left > 0
}

function CheckActions({ status }: { status: UpdateStatus }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const coolingDown = useCooldown(status.lastCheckedAt)
  const checkNow = async () => {
    try {
      queryClient.setQueryData(['updates:status', null], { ...status, checking: true })
      queryClient.setQueryData(['updates:status', null], await call('updates:check'))
    } catch (err) {
      toast.error('Could not check for updates', err)
    }
  }
  return (
    <div className="row update-actions">
      <Button
        disabled={status.checking || coolingDown}
        aria-describedby={coolingDown ? 'update-cooldown' : undefined}
        onClick={() => void checkNow()}
      >
        {status.checking ? 'Checking…' : 'Check now'}
      </Button>
      {latestOf(status) && <Button onClick={() => setNotesOpen(true)}>Release notes</Button>}
      {status.newer && <Button onClick={() => openUpdatePage('release')}>Download page</Button>}
      {coolingDown && !status.checking && (
        <span id="update-cooldown" className="muted">
          You can check again in a minute.
        </span>
      )}
      <ReleaseNotesDialog status={status} open={notesOpen} onOpenChange={setNotesOpen} />
    </div>
  )
}

export function UpdatesSection() {
  const query = useUpdateStatus()
  const status = query.data
  const toggle = async (on: boolean) => {
    try {
      await setUpdates({ check: on ? 'on' : 'off' })
      toast.success(on ? 'Update check turned on' : 'Update check turned off')
    } catch (err) {
      toast.error('Could not save the update check', err)
    }
  }
  return (
    <section className="card stack settings-section" aria-labelledby="updates-heading">
      <div>
        <h2 id="updates-heading">Updates</h2>
        <p className="muted">
          The app can tell you when a newer release of Action Stations is out. It never downloads or
          installs anything itself.
        </p>
      </div>
      {status && (
        <>
          <label className="row">
            <input
              type="checkbox"
              checked={status.mode === 'on'}
              aria-describedby="update-check-hint"
              onChange={(e) => void toggle(e.target.checked)}
            />
            <span>Check for new versions when the app starts</span>
          </label>
          <p id="update-check-hint" className="field__hint">
            At most once a day. {WHAT_IS_SENT} Off by default.
          </p>
          <dl className="update-facts">
            <dt>Installed version</dt>
            <dd>{status.installed}</dd>
            <dt>Last check</dt>
            <dd>{status.lastCheckedAt ? formatWhen(status.lastCheckedAt) : 'Never'}</dd>
          </dl>
          <p className="update-result" aria-live="polite" data-testid="update-result">
            {resultText(status)}
          </p>
          <CheckActions status={status} />
        </>
      )}
    </section>
  )
}
