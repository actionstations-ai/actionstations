// The latest release's notes (#442): name, date, upgrade caveats, the installer for this
// computer and its checksum file, and the notes as text-only Markdown (no HTML, no images, links
// shown as text). The app never downloads: Download page opens the release on GitHub.
import type { UpdateStatus } from '@shared/ipc'
import { PackDescription } from '../../routes/packs/PackDescription'
import { Button, Dialog } from '../ui'
import { UpgradeNotes } from './UpgradeNotes'
import { formatDate, latestOf } from './update-view'
import { openUpdatePage } from './use-updates'
import './updates.css'

function InstallerLine({ status }: { status: UpdateStatus }) {
  const asset = status.platformAsset
  return (
    <div className="stack release-notes__install">
      {asset ? (
        <p>
          The installer for this computer is <code>{asset.name}</code>
          {asset.checksum ? (
            <>
              , with its checksum in <code>{asset.checksum}</code>.
            </>
          ) : (
            '.'
          )}
        </p>
      ) : (
        <p>The release page lists the installers for each operating system.</p>
      )}
      <p className="muted">
        The app does not download or install updates. The installers are not code-signed yet, so
        your operating system warns before the first launch.
      </p>
      <div className="row">
        <Button size="sm" onClick={() => openUpdatePage('guide')}>
          How to check the download and install it
        </Button>
      </div>
    </div>
  )
}

export function ReleaseNotesDialog(props: {
  status: UpdateStatus
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const latest = latestOf(props.status)
  if (!latest) return null
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={latest.name}
      description={`Version ${latest.version}, published ${formatDate(latest.publishedAt)}. You have ${props.status.installed}.`}
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>Close</Button>
          <Button variant="primary" onClick={() => openUpdatePage('release')}>
            Download page
          </Button>
        </>
      }
    >
      <div className="stack release-notes">
        <UpgradeNotes notes={props.status.notes} />
        {props.status.newer && <InstallerLine status={props.status} />}
        {latest.notes.trim() ? (
          <PackDescription source={latest.notes} label="Release notes" topHeading={3} />
        ) : (
          <p className="muted">This release has no notes.</p>
        )}
      </div>
    </Dialog>
  )
}
