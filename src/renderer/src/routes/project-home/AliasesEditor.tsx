import { useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui'
import { newRowId, type AliasRow, type FormErrors } from './form'

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

  return (
    <div className="stack aliases" role="group" aria-labelledby="aliases-heading">
      <div>
        <h3 id="aliases-heading">Aliases</h3>
        <p className="muted">
          Named stand-ins templates can use, e.g. <code>airlineA</code> → Lakeshore Air,{' '}
          <code>localTv</code> → WNFD Channel 5.
        </p>
      </div>
      {rows.length > 0 && (
        <table className="table aliases__table">
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Value</th>
              <th scope="col">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const error = errors[`alias:${row.rowId}`]
              const errId = `alias-err-${row.rowId}`
              return (
                <tr key={row.rowId}>
                  <td>
                    <input
                      ref={(el) => {
                        if (el && focusRowId.current === row.rowId) {
                          el.focus()
                          focusRowId.current = null
                        }
                      }}
                      className="input mono"
                      aria-label={`Alias ${i + 1} key`}
                      aria-invalid={!!error}
                      aria-describedby={error ? errId : undefined}
                      value={row.key}
                      placeholder="airlineA"
                      onChange={(e) => patchRow(row.rowId, { key: e.target.value })}
                    />
                    {error && (
                      <span id={errId} className="field__error" role="alert">
                        {error}
                      </span>
                    )}
                  </td>
                  <td>
                    <input
                      className="input"
                      aria-label={`Alias ${i + 1} value`}
                      value={row.value}
                      placeholder="Lakeshore Air"
                      onChange={(e) => patchRow(row.rowId, { value: e.target.value })}
                    />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      icon
                      aria-label={`Remove alias ${row.key || i + 1}`}
                      onClick={() => remove(row.rowId)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </Button>
                  </td>
                </tr>
              )
            })}
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
