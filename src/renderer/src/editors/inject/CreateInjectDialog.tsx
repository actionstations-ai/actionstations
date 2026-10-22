// Create an inject for a MSEL row that has none: a blank page of a chosen type, or a copy of a
// library item. Opens the editor on success.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { TemplateInfo } from '@shared/ipc'
import type { MselRow } from '@shared/schemas/scenario'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { LibraryPicker } from './EditorDialogs'
import { injectUrl } from './links'

export function CreateInjectDialog(props: {
  projectPath: string
  scenarioId: string
  row: MselRow | null
  templates: TemplateInfo[]
  typeLabel: (type: string) => string
  onClose: () => void
}) {
  const { row, templates } = props
  const navigate = useNavigate()
  const [mode, setMode] = useState<'blank' | 'library'>('blank')
  const [type, setType] = useState<string | null>(null)
  const [libraryId, setLibraryId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const library = useIpcQuery('library:list', undefined, { enabled: !!row && mode === 'library' })
  const suggested = templates.some((t) => t.type === row?.format) ? row?.format : templates[0]?.type
  const chosenType = type ?? suggested ?? ''
  const sorted = [...templates].sort((a, b) => a.label.localeCompare(b.label))

  const create = async () => {
    if (!row) return
    setBusy(true)
    const ids = { projectPath: props.projectPath, scenarioId: props.scenarioId, mselRowId: row.id }
    try {
      const inject =
        mode === 'library' && libraryId
          ? await call('library:insert', { ...ids, libraryId })
          : await call('injects:create', { ...ids, type: chosenType })
      void queryClient.invalidateQueries()
      props.onClose()
      navigate(injectUrl(props.projectPath, props.scenarioId, inject.id))
    } catch (e) {
      toast.error('Could not create the inject', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!row}
      onOpenChange={(o) => !o && props.onClose()}
      title={row ? `Create inject for ${row.id}` : 'Create inject'}
      description={row?.event}
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy || (mode === 'library' ? !libraryId : !chosenType)}
            onClick={() => void create()}
          >
            Create and edit
          </Button>
        </>
      }
    >
      <fieldset className="ie-checkbox-group">
        <legend className="sr-only">Start from</legend>
        <label className="ie-checkbox">
          <input
            type="radio"
            name="create-mode"
            checked={mode === 'blank'}
            onChange={() => setMode('blank')}
          />
          <span>Blank page</span>
        </label>
        <label className="ie-checkbox">
          <input
            type="radio"
            name="create-mode"
            checked={mode === 'library'}
            onChange={() => setMode('library')}
          />
          <span>From the library</span>
        </label>
      </fieldset>
      {mode === 'blank' ? (
        <Field
          label="Inject type"
          hint={row?.format ? `The MSEL suggests ${props.typeLabel(row.format)}.` : undefined}
        >
          {({ id, describedBy }) => (
            <select
              id={id}
              className="select"
              value={chosenType}
              aria-describedby={describedBy}
              onChange={(e) => setType(e.target.value)}
            >
              {sorted.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : (
        <LibraryPicker
          value={libraryId}
          onChange={setLibraryId}
          items={library.data}
          typeLabel={props.typeLabel}
        />
      )}
    </Dialog>
  )
}
