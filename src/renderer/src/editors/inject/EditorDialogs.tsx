// Dialogs of the inject editor: regenerate text (optional instructions), regenerate media
// (choose render paths), save to / replace from the library, delete.
import { useState } from 'react'
import type { LibraryItem } from '@shared/ipc'
import { Button, Dialog, Field } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { RENDER_PATHS, RENDER_PATH_LABEL, type RenderPathId } from './media-utils'

export type EditorDialog =
  'regen-text' | 'regen-media' | 'library-save' | 'library-replace' | 'delete' | null

export function RegenerateTextDialog(props: {
  open: boolean
  dirty: boolean
  onClose: () => void
  onStart: (instructions: string) => void
}) {
  const [instructions, setInstructions] = useState('')
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Regenerate text"
      description="The model rewrites this inject from its MSEL row, keeping names and facts consistent with the rest of the deck. The current text stays in the version history."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              props.onStart(instructions)
              setInstructions('')
            }}
          >
            Regenerate
          </Button>
        </>
      }
    >
      <Field
        label="Instructions (optional)"
        hint='For example: "make the tone angrier" or "mention Gate B6".'
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            className="textarea"
            rows={3}
            value={instructions}
            aria-describedby={describedBy}
            onChange={(e) => setInstructions(e.target.value)}
          />
        )}
      </Field>
      {props.dirty && (
        <p className="field__error" role="alert">
          You have unsaved edits. Regenerating replaces them; save first to keep them as a version.
        </p>
      )}
    </Dialog>
  )
}

export function RegenerateMediaDialog(props: {
  open: boolean
  defaults: RenderPathId[]
  onClose: () => void
  onStart: (paths: RenderPathId[]) => void
}) {
  const [picked, setPicked] = useState<RenderPathId[] | null>(null)
  const paths = picked ?? props.defaults
  const toggle = (p: RenderPathId, on: boolean) =>
    setPicked(on ? [...paths, p] : paths.filter((x) => x !== p))
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => {
        if (!o) {
          setPicked(null)
          props.onClose()
        }
      }}
      title="Regenerate media"
      description="Runs the chosen render paths for this inject. Each path replaces only its own files."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!paths.length}
            onClick={() => {
              props.onStart(RENDER_PATHS.filter((p) => paths.includes(p)))
              setPicked(null)
            }}
          >
            Regenerate media
          </Button>
        </>
      }
    >
      <fieldset className="ie-checkbox-group ie-checkbox-group--column">
        <legend className="sr-only">Render paths</legend>
        {RENDER_PATHS.map((p) => (
          <label key={p} className="ie-checkbox">
            <input
              type="checkbox"
              checked={paths.includes(p)}
              onChange={(e) => toggle(p, e.target.checked)}
            />
            <span>{RENDER_PATH_LABEL[p]}</span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  )
}

export function SaveToLibraryDialog(props: {
  open: boolean
  defaultName: string
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState<string | null>(null)
  const value = name ?? props.defaultName
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => {
        if (!o) {
          setName(null)
          props.onClose()
        }
      }}
      title="Save to library"
      description="Keeps this inject's text (type, title, fields, note) for reuse in any scenario."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!value.trim()}
            onClick={() => {
              props.onSave(value.trim())
              setName(null)
            }}
          >
            Save to library
          </Button>
        </>
      }
    >
      <Field label="Name">
        {({ id }) => (
          <input
            id={id}
            className="input"
            value={value}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
    </Dialog>
  )
}

/** Pick a library item; used for "Replace from library" and "Create from library". */
export function LibraryPicker(props: {
  value: string | null
  onChange: (id: string) => void
  items: LibraryItem[] | undefined
  typeLabel: (type: string) => string
}) {
  if (!props.items) return <p className="muted">Loading the library…</p>
  if (!props.items.length)
    return <p className="muted">The library is empty. Use “Save to library” on any inject.</p>
  return (
    <fieldset className="library-picker">
      <legend className="sr-only">Library items</legend>
      {props.items.map((item) => (
        <label key={item.id} className="library-picker__item">
          <input
            type="radio"
            name="library-item"
            checked={props.value === item.id}
            onChange={() => props.onChange(item.id)}
          />
          <span>
            <strong>{item.name}</strong>
            <span className="muted">
              {' '}
              · {props.typeLabel(item.type)} · {item.title}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function ReplaceFromLibraryDialog(props: {
  open: boolean
  onClose: () => void
  onPick: (item: LibraryItem) => void
  typeLabel: (type: string) => string
}) {
  const library = useIpcQuery('library:list', undefined, { enabled: props.open })
  const [picked, setPicked] = useState<string | null>(null)
  const item = library.data?.find((i) => i.id === picked)
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Replace from library"
      description="Puts a library item's type, title, fields and note into the editor. Nothing is stored until you save."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!item} onClick={() => item && props.onPick(item)}>
            Use this item
          </Button>
        </>
      }
    >
      <LibraryPicker
        value={picked}
        onChange={setPicked}
        items={library.data}
        typeLabel={props.typeLabel}
      />
    </Dialog>
  )
}

export function DeleteDialog(props: {
  open: boolean
  label: string
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title={`Delete ${props.label}?`}
      description="Removes the inject page and its media files. The MSEL row stays and can get a new inject."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="danger" onClick={props.onDelete}>
            Delete inject
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}
