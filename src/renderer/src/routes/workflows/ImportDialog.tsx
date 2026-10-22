// Import an API-format workflow JSON: pick the file, name it, choose its media type.
import { useState } from 'react'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcMutation } from '../../lib/query'
import { MEDIA_TYPES, type MediaTypeT } from './workflow-utils'
import { errorText } from '../../lib/errors'

const baseName = (path: string): string =>
  (path.split(/[\\/]/).pop() ?? path).replace(/\.json$/i, '')

export function ImportDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (id: string) => void
}) {
  const [filePath, setFilePath] = useState('')
  const [name, setName] = useState('')
  const [mediaType, setMediaType] = useState<MediaTypeT>('image')
  const imp = useIpcMutation('comfy:workflows:import', { invalidates: ['comfy:workflows:list'] })

  const pick = async () => {
    const [file] = await call('dialog:open-files', {
      title: 'Choose a ComfyUI workflow (API format)',
      filters: [{ name: 'ComfyUI workflow', extensions: ['json'] }],
      multi: false,
    })
    if (!file) return
    setFilePath(file)
    if (!name) setName(baseName(file))
  }

  const submit = async () => {
    try {
      const entry = await imp.mutateAsync({ filePath, name: name.trim(), mediaType })
      toast.success('Workflow imported', 'Bind its inputs below.')
      props.onImported(entry.id)
      props.onOpenChange(false)
      setFilePath('')
      setName('')
    } catch {
      // Shown inline: UI-format files get an explanation of how to export the API format.
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Import workflow"
      description="Use ComfyUI's Workflow → Export (API). Editor-format files are detected and explained."
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!filePath || !name.trim() || imp.isPending}
            onClick={() => void submit()}
          >
            Import
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="row">
          <Button onClick={() => void pick()}>Choose file…</Button>
          <span className="mono wf-path">{filePath || 'No file chosen'}</span>
        </div>
        <Field label="Name">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Media type">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as MediaTypeT)}
            >
              {MEDIA_TYPES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {imp.isError && (
          <p className="field__error" role="alert">
            {errorText(imp.error)}
          </p>
        )}
      </div>
    </Dialog>
  )
}
