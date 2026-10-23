// Project logo (#217): pick an image, main copies it into <project>/brand/ and stores
// brand.logoPath. Takes effect at once (it is a file copy, not a form field), and templates
// with a logo slot (memo, press release, SITREP, own-organization letters, the export cover)
// show it on their next render.
import { useState } from 'react'
import type { Project } from '@shared/schemas'
import { mediaUrl } from '@shared/media-url'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient } from '../../lib/query'
import './logo-picker.css'

const LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

const refresh = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['project:get'] }),
    queryClient.invalidateQueries({ queryKey: ['project:list-recent'] }),
  ])

export function LogoPicker({ path, project }: { path: string; project: Project }) {
  const [busy, setBusy] = useState(false)
  const logoPath = project.brand.logoPath
  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      await refresh()
    } catch (err) {
      toast.error(what, err)
    } finally {
      setBusy(false)
    }
  }
  const choose = () =>
    run('Could not set the logo', async () => {
      const [file] = await call('dialog:open-files', {
        title: 'Choose a logo image',
        filters: [{ name: 'Images (PNG, JPEG, WebP)', extensions: LOGO_EXTENSIONS }],
        multi: false,
      })
      if (!file) return
      await call('project:set-logo', { path, sourcePath: file })
      toast.success('Logo saved')
    })
  const remove = () =>
    run('Could not remove the logo', async () => {
      await call('project:clear-logo', { path })
      toast.success('Logo removed')
    })

  return (
    <div className="field logo-picker" role="group" aria-labelledby="logo-picker-label">
      <span className="field__label" id="logo-picker-label">
        Logo
      </span>
      <div className="row">
        <span className="logo-picker__preview">
          {logoPath ? (
            <img src={mediaUrl(path, logoPath)} alt="Current project logo" />
          ) : (
            <span className="muted">No logo</span>
          )}
        </span>
        <Button size="sm" disabled={busy} onClick={() => void choose()}>
          {logoPath ? 'Replace logo…' : 'Choose logo…'}
        </Button>
        {logoPath && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>
            Remove logo
          </Button>
        )}
      </div>
      <p className="field__hint">
        PNG, JPEG or WebP up to 2 MB, copied into the project. Shown on memos, press releases,
        SITREPs, your own letters and the exercise plan cover. Saved immediately.
      </p>
    </div>
  )
}
