import { useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui'
import { newRowId, type AliasRow, type FormErrors } from './form'

function AliasesIntro() {
  return (
    <div>
      <h3 id="aliases-heading">Aliases</h3>
      <p className="muted">
        Named stand-ins templates can use, e.g. <code>airlineA</code> → Lakeshore Air,{' '}
        <code>localTv</code> → WNFD Channel 5.
      </p>
    </div>
  )
}

function KeyCell({
  row,
  index: i,
  error,
  attachKey,
  onKey,
}: {
  row: AliasRow
  index: number
  error: string | undefined
  attachKey: (el: HTMLInputElement | null) => void
  onKey: (key: string) => void
}) {
  const errId = `alias-err-${row.rowId}`
  return (
    <td>
      <input
        ref={attachKey}
        className="input mono"
        aria-label={`Alias ${i + 1} key`}
        aria-invalid={!!error}
        aria-describedby={error ? errId : undefined}
        value={row.key}
        placeholder="airlineA"
        onChange={(e) => onKey(e.target.value)}
      />
      {error && (
        <span id={errId} className="field__error" role="alert">
          {error}
        </span>
      )}
    </td>
  )
}

function AliasRowView({
  row,
  index: i,
  error,
  attachKey,
  onPatch,
  onRemove,
}: {
  row: AliasRow
  index: number
  error: string | undefined
  attachKey: (el: HTMLInputElement | null) => void
  onPatch: (patch: Partial<AliasRow>) => void
  onRemove: () => void
}) {
  return (
    <tr>
      <KeyCell
        row={row}
        index={i}
        error={error}
        attachKey={attachKey}
        onKey={(key) => onPatch({ key })}
      />
      <td>
        <input
          className="input"
          aria-label={`Alias ${i + 1} value`}
          value={row.value}
          placeholder="Lakeshore Air"
          onChange={(e) => onPatch({ value: e.target.value })}
        />
      </td>
      <td>
        <Button
          variant="ghost"
          icon
          aria-label={`Remove alias ${row.key || i + 1}`}
          onClick={onRemove}
        >
          <Trash2 size={16} aria-hidden />
        </Button>
      </td>
    </tr>
  )
}

function AliasHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Key</th>
        <th scope="col">Value</th>
        <th scope="col">
          <span className="sr-only">Remove</span>
        </th>
      </tr>
    </thead>
  )
}

/** Key/value editor for brand aliases (airline names, local TV station, hospital names…). */
export function AliasesEditor(props: {
  rows: AliasRow[]
  errors: FormErrors
  onChange: (rows: AliasRow[]) => void
}) {
  const focusRowId = useRef<string | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const { rows, errors, onChange } = props

  const patchRow = (rowId: string, patch: Partial<AliasRow>) =>
    onChange(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  const add = () => {
    const row = { rowId: newRowId('a'), key: '', value: '' }
    focusRowId.current = row.rowId
    onChange([...rows, row])
  }
  const remove = (rowId: string) => {
    onChange(rows.filter((r) => r.rowId !== rowId))
    addButton.current?.focus()
  }
  /** Focus the key of a row just added. */
  const focusIfNew = (rowId: string) => (el: HTMLInputElement | null) => {
    if (el && focusRowId.current === rowId) {
      el.focus()
      focusRowId.current = null
    }
  }

  return (
    <div className="stack aliases" role="group" aria-labelledby="aliases-heading">
      <AliasesIntro />
      {rows.length > 0 && (
        <table className="table aliases__table">
          <AliasHead />
          <tbody>
            {rows.map((row, i) => (
              <AliasRowView
                key={row.rowId}
                row={row}
                index={i}
                error={errors[`alias:${row.rowId}`]}
                attachKey={focusIfNew(row.rowId)}
                onPatch={(patch) => patchRow(row.rowId, patch)}
                onRemove={() => remove(row.rowId)}
              />
            ))}
          </tbody>
        </table>
      )}
      <div>
        {/* Plain button: focus returns here after a row is removed. */}
        <button ref={addButton} type="button" className="btn btn--sm" onClick={add}>
          <Plus size={14} aria-hidden /> Add alias
        </button>
      </div>
    </div>
  )
}
