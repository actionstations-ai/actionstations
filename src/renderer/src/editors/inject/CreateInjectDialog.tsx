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

type Mode = 'blank' | 'library'

interface DialogProps {
  projectPath: string
  scenarioId: string
  row: MselRow | null
  templates: TemplateInfo[]
  typeLabel: (type: string) => string
  onClose: () => void
}

function ModeChoice(props: { mode: Mode; onMode: (mode: Mode) => void }) {
  return (
    <fieldset className="ie-checkbox-group">
      <legend className="sr-only">Start from</legend>
      <label className="ie-checkbox">
        <input
          type="radio"
          name="create-mode"
          checked={props.mode === 'blank'}
          onChange={() => props.onMode('blank')}
        />
        <span>Blank page</span>
      </label>
      <label className="ie-checkbox">
        <input
          type="radio"
          name="create-mode"
          checked={props.mode === 'library'}
          onChange={() => props.onMode('library')}
        />
        <span>From the library</span>
      </label>
    </fieldset>
  )
}

function TypeField(props: {
  row: MselRow | null
  templates: TemplateInfo[]
  typeLabel: (type: string) => string
  value: string
  onChange: (type: string) => void
}) {
  const { row } = props
  const sorted = [...props.templates].sort((a, b) => a.label.localeCompare(b.label))
  return (
    <Field
      label="Inject type"
      hint={row?.format ? `The MSEL suggests ${props.typeLabel(row.format)}.` : undefined}
    >
      {({ id, describedBy }) => (
        <select
          id={id}
          className="select"
          value={props.value}
          aria-describedby={describedBy}
          onChange={(e) => props.onChange(e.target.value)}
        >
          {sorted.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

/** Create the inject (blank of `type`, or from a library item), then open it in the editor. */
function useCreateInject(props: DialogProps) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const create = async (choice: { libraryId: string | null; type: string }) => {
    const { row } = props
    if (!row) return
    setBusy(true)
    const ids = { projectPath: props.projectPath, scenarioId: props.scenarioId, mselRowId: row.id }
    try {
      const inject = choice.libraryId
        ? await call('library:insert', { ...ids, libraryId: choice.libraryId })
        : await call('injects:create', { ...ids, type: choice.type })
      void queryClient.invalidateQueries()
      props.onClose()
      navigate(injectUrl(props.projectPath, props.scenarioId, inject.id))
    } catch (e) {
      toast.error('Could not create the inject', e)
    } finally {
      setBusy(false)
    }
  }
  return { busy, create }
}

export function CreateInjectDialog(props: DialogProps) {
  const { row, templates } = props
  const [mode, setMode] = useState<Mode>('blank')
  const [type, setType] = useState<string | null>(null)
  const [libraryId, setLibraryId] = useState<string | null>(null)
  const { busy, create } = useCreateInject(props)
  const library = useIpcQuery('library:list', undefined, { enabled: !!row && mode === 'library' })
  const suggested = templates.some((t) => t.type === row?.format) ? row?.format : templates[0]?.type
  const chosenType = type ?? suggested ?? ''
  const fromLibrary = mode === 'library' ? libraryId : null

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
            onClick={() => void create({ libraryId: fromLibrary, type: chosenType })}
          >
            Create and edit
          </Button>
        </>
      }
    >
      <ModeChoice mode={mode} onMode={setMode} />
      {mode === 'blank' ? (
        <TypeField
          row={row}
          templates={templates}
          typeLabel={props.typeLabel}
          value={chosenType}
          onChange={setType}
        />
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
