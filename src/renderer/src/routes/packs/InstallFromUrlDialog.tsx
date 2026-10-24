// Install from URL (#268): one archive, downloaded on the user's click, then reviewed.
import { useState } from 'react'
import { PackFetchUrl, Sha256Hex } from '@shared/schemas/pack'
import { Button, Dialog, Field } from '../../components/ui'

const urlProblem = (url: string): string | undefined =>
  !url || PackFetchUrl.safeParse(url).success
    ? undefined
    : 'Use an https address (http only for this computer, such as http://127.0.0.1).'

const shaProblem = (sha: string): string | undefined =>
  !sha || Sha256Hex.safeParse(sha).success ? undefined : 'A sha256 is 64 lowercase hex characters.'

export function InstallFromUrlDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDownload: (url: string, sha256: string | undefined) => void
}) {
  const [url, setUrl] = useState('')
  const [sha, setSha] = useState('')
  const u = url.trim()
  const s = sha.trim().toLowerCase()
  const uProblem = urlProblem(u)
  const sProblem = shaProblem(s)
  const ok = !!u && !uProblem && !sProblem
  const submit = () => {
    if (!ok) return
    props.onDownload(u, s || undefined)
    setUrl('')
    setSha('')
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Install from URL"
      description="Downloads one .aspack archive and shows its review. Nothing installs until you press Install there."
    >
      <form
        id="pack-url-form"
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Archive URL" {...(uProblem ? { error: uProblem } : {})}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input mono"
              type="url"
              placeholder="https://example.org/packs/my-pack-1.0.0.aspack"
              value={url}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Expected sha256 (optional)"
          hint="From the publisher's page. The download is refused if it does not match."
          {...(sProblem ? { error: sProblem } : {})}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input mono"
              value={sha}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setSha(e.target.value)}
            />
          )}
        </Field>
        <div className="dialog__footer">
          <Button onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ok}>
            Download and review
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
