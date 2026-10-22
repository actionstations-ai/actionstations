import type { Editor } from '@tiptap/react'
import { useState, type FormEvent } from 'react'
import { Button, Dialog, Field } from '../../components/ui'
import { isSafeHref } from './markdown/extensions'

/** The form mounts each time the dialog opens, so it starts from the current link. */
function LinkForm(props: { editor: Editor; close: () => void }) {
  const { editor } = props
  const [href, setHref] = useState(
    () => (editor.getAttributes('link').href as string | undefined) ?? '',
  )
  const [error, setError] = useState<string | undefined>()

  function apply(e: FormEvent) {
    e.preventDefault()
    const url = href.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!url) {
      chain.unsetLink().run()
      props.close()
    } else if (!isSafeHref(url)) {
      setError('Use an https://, http:// or mailto: address.')
    } else {
      chain.setLink({ href: url }).run()
      props.close()
    }
  }

  return (
    <form className="stack" onSubmit={apply}>
      <Field label="Address" {...(error ? { error } : {})}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input"
            value={href}
            autoFocus
            aria-describedby={describedBy}
            aria-invalid={invalid}
            placeholder="https://"
            onChange={(e) => setHref(e.target.value)}
          />
        )}
      </Field>
      <div className="dialog__footer">
        <Button onClick={props.close}>Cancel</Button>
        <Button variant="primary" type="submit">
          Apply
        </Button>
      </div>
    </form>
  )
}

/** Set, change or remove the link on the current selection. */
export function LinkDialog(props: {
  editor: Editor
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Link"
      description="Leave the address empty to remove the link."
    >
      <LinkForm editor={props.editor} close={() => props.onOpenChange(false)} />
    </Dialog>
  )
}
