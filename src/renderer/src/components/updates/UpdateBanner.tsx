// "A newer version is available" on the Projects screen (#442): a region with a heading, never a
// modal and never focused on its own. Not now hides it for this version only.
import { useId, useState } from 'react'
import { Button } from '../ui'
import { toast } from '../toast-store'
import { focusTarget } from '../../lib/focus'
import { ReleaseNotesDialog } from './ReleaseNotesDialog'
import { UpgradeNotes } from './UpgradeNotes'
import { bannerTitle, latestOf } from './update-view'
import { openUpdatePage, setUpdates, useUpdateStatus } from './use-updates'
import './updates.css'

export function UpdateBanner() {
  const status = useUpdateStatus().data
  const [notesOpen, setNotesOpen] = useState(false)
  const headingId = useId()
  const latest = latestOf(status)
  if (!status || !latest || !status.newer || status.dismissed) return null

  const notNow = async () => {
    try {
      await setUpdates({ dismissedVersion: latest.version })
      focusTarget(document.querySelector<HTMLElement>('#main h1'))
    } catch (err) {
      toast.error('Could not save your choice', err)
    }
  }
  return (
    <section className="card update-banner" aria-labelledby={headingId} data-testid="update-banner">
      <h2 id={headingId} className="update-banner__title">
        {bannerTitle(status)}
      </h2>
      <UpgradeNotes notes={status.notes} />
      <div className="row update-banner__actions">
        <Button size="sm" variant="primary" onClick={() => setNotesOpen(true)}>
          Release notes
        </Button>
        <Button size="sm" onClick={() => openUpdatePage('release')}>
          Download page
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void notNow()}>
          Not now
        </Button>
      </div>
      <ReleaseNotesDialog status={status} open={notesOpen} onOpenChange={setNotesOpen} />
    </section>
  )
}
