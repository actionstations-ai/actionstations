// Action bar of the inject editor (role=toolbar). Every action is a button reachable by Tab;
// Save and Render also have Cmd/Ctrl+S and Cmd/Ctrl+Enter.
import { Lock, LockOpen } from 'lucide-react'
import { useState } from 'react'
import type { Inject } from '@shared/schemas/inject'
import { Button } from '../../components/ui'
import type { InjectDraft } from './draft'
import {
  DeleteDialog,
  RegenerateMediaDialog,
  RegenerateTextDialog,
  ReplaceFromLibraryDialog,
  SaveToLibraryDialog,
  type EditorDialog,
} from './EditorDialogs'
import { RENDER_PATHS, type RenderPathId } from './media-utils'
import type { useInjectActions } from './use-inject-actions'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl+'

export interface ToolbarProps {
  inject: Inject
  draft: InjectDraft
  dirty: boolean
  jobRunning: boolean
  actions: ReturnType<typeof useInjectActions>
  typeLabel: (type: string) => string
  onReplace: (draft: InjectDraft) => void
  onRegenStart: (jobId: string) => void
  onDeleted: () => void
  onRendered: () => void
}

interface PartProps extends ToolbarProps {
  dialog: EditorDialog
  setDialog: (dialog: EditorDialog) => void
}

/** Save, Render, Regenerate text / media and Lock. */
function MainButtons(props: PartProps) {
  const { inject, actions, jobRunning, setDialog } = props
  const locked = inject.locked
  const busy = !!actions.busy
  const saveLabel = actions.pendingSave
    ? 'Save queued…'
    : jobRunning && props.dirty
      ? 'Save when job ends'
      : 'Save'
  return (
    <>
      <Button
        variant="primary"
        disabled={locked || busy || (!props.dirty && !actions.pendingSave)}
        aria-keyshortcuts="Meta+S Control+S"
        title={`Save (${MOD}S)`}
        onClick={() => void actions.save()}
      >
        {saveLabel}
      </Button>
      <Button
        disabled={locked || busy || jobRunning}
        aria-keyshortcuts="Meta+Enter Control+Enter"
        title={`Save if needed and render the template to PNG (${MOD}Enter)`}
        onClick={() => void actions.render().then((a) => a && props.onRendered())}
      >
        {actions.busy === 'render' ? 'Rendering…' : 'Render'}
      </Button>
      <Button disabled={locked || jobRunning} onClick={() => setDialog('regen-text')}>
        Regenerate text…
      </Button>
      <Button disabled={jobRunning} onClick={() => setDialog('regen-media')}>
        Regenerate media…
      </Button>
      <Button disabled={busy} aria-pressed={locked} onClick={() => void actions.setLocked(!locked)}>
        {locked ? <LockOpen size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
        {locked ? 'Unlock' : 'Lock'}
      </Button>
    </>
  )
}

/** Library and delete buttons, after the separator. */
function SecondaryButtons(props: PartProps) {
  const { setDialog } = props
  const locked = props.inject.locked
  return (
    <>
      <Button variant="ghost" onClick={() => setDialog('library-save')}>
        Save to library…
      </Button>
      <Button variant="ghost" disabled={locked} onClick={() => setDialog('library-replace')}>
        Replace from library…
      </Button>
      <Button
        variant="ghost"
        disabled={locked || props.jobRunning}
        onClick={() => setDialog('delete')}
      >
        Delete…
      </Button>
    </>
  )
}

function RegenerateDialogs(props: PartProps) {
  const { inject, actions, dialog } = props
  const close = () => props.setDialog(null)
  const mediaDefaults = (inject.mediaBrief?.paths ?? ['template']).filter((p): p is RenderPathId =>
    (RENDER_PATHS as readonly string[]).includes(p),
  )
  return (
    <>
      <RegenerateTextDialog
        open={dialog === 'regen-text'}
        dirty={props.dirty}
        onClose={close}
        onStart={(instructions) => {
          close()
          void actions.regenerateText(instructions).then((id) => id && props.onRegenStart(id))
        }}
      />
      <RegenerateMediaDialog
        open={dialog === 'regen-media'}
        defaults={mediaDefaults}
        onClose={close}
        onStart={(paths) => {
          close()
          void actions.regenerateMedia(paths)
        }}
      />
    </>
  )
}

function LibraryDialogs(props: PartProps) {
  const { actions, dialog, draft } = props
  const close = () => props.setDialog(null)
  return (
    <>
      <SaveToLibraryDialog
        open={dialog === 'library-save'}
        defaultName={draft.title}
        onClose={close}
        onSave={(name) => {
          close()
          void actions.saveToLibrary(name)
        }}
      />
      <ReplaceFromLibraryDialog
        open={dialog === 'library-replace'}
        onClose={close}
        typeLabel={props.typeLabel}
        onPick={(item) => {
          close()
          props.onReplace({
            ...draft,
            type: item.type,
            title: item.title,
            fields: item.fields,
            instructorNote: item.instructorNote ?? '',
          })
        }}
      />
      <DeleteDialog
        open={dialog === 'delete'}
        label={`inject ${props.inject.mselRowId}`}
        onClose={close}
        onDelete={() => {
          close()
          void actions.remove().then((ok) => ok && props.onDeleted())
        }}
      />
    </>
  )
}

export function EditorToolbar(props: ToolbarProps) {
  const [dialog, setDialog] = useState<EditorDialog>(null)
  const parts = { ...props, dialog, setDialog }
  return (
    <>
      <div className="editor-toolbar" role="toolbar" aria-label="Inject actions">
        <MainButtons {...parts} />
        <span className="editor-toolbar__sep" aria-hidden />
        <SecondaryButtons {...parts} />
      </div>
      <RegenerateDialogs {...parts} />
      <LibraryDialogs {...parts} />
    </>
  )
}
