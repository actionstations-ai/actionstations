// Table of a workflow's literal node inputs; each row binds to a media-brief value or keeps
// the workflow's own value (optionally replaced by a fixed value).
import { useState } from 'react'
import type { WorkflowEntry } from '@shared/ipc'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import {
  SOURCE_OPTIONS,
  bindingsFromRows,
  formatValue,
  rowKey,
  rowsFromBindings,
  type BindingSource,
  type InputRow,
  type RowBinding,
} from './workflow-utils'
import { errorText } from '../../lib/errors'

function ValueCell({ value }: { value: unknown }) {
  const text = formatValue(value)
  return (
    <span className="wf-value mono" title={text}>
      {text.length > 80 ? `${text.slice(0, 80)}…` : text}
    </span>
  )
}

function BindingRow(props: {
  input: InputRow
  binding: RowBinding | undefined
  onChange: (b: RowBinding) => void
}) {
  const { input } = props
  const b = props.binding ?? { source: '', literal: '' }
  const label = `${input.title ?? input.classType} ${input.inputName}`
  return (
    <tr className={b.source ? 'wf-row--bound' : undefined}>
      <td>
        <span className="wf-node">{input.title ?? input.classType}</span>
        <span className="muted wf-node__id">
          #{input.nodeId} · {input.classType}
        </span>
      </td>
      <td className="mono">{input.inputName}</td>
      <td>
        <ValueCell value={input.value} />
      </td>
      <td>
        <div className="wf-binding">
          <select
            className="select"
            aria-label={`Binding for ${label}`}
            value={b.source}
            onChange={(e) =>
              props.onChange({
                source: e.target.value as BindingSource | '',
                literal: b.literal || formatValue(input.value),
              })
            }
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {b.source === 'literal' && (
            <input
              className="input"
              aria-label={`Fixed value for ${label}`}
              value={b.literal}
              onChange={(e) => props.onChange({ ...b, literal: e.target.value })}
            />
          )}
        </div>
      </td>
    </tr>
  )
}

export function BindingEditor({
  workflow,
  projectPath,
}: {
  workflow: WorkflowEntry
  projectPath?: string | undefined
}) {
  const scope = projectPath ? { projectPath } : {}
  const inputs = useIpcQuery('comfy:workflows:inputs', { id: workflow.id, ...scope })
  const [rows, setRows] = useState(() => rowsFromBindings(workflow.bindings))
  const [dirty, setDirty] = useState(false)
  const save = useIpcMutation('comfy:workflows:save-bindings', {
    invalidates: ['comfy:workflows:list'],
  })
  const onSave = async () => {
    try {
      await save.mutateAsync({ id: workflow.id, bindings: bindingsFromRows(rows), ...scope })
      setDirty(false)
      toast.success('Bindings saved')
    } catch (e) {
      toast.error('Could not save bindings', e)
    }
  }
  const boundCount = Object.values(rows).filter((r) => r.source).length
  return (
    <section className="card stack" aria-labelledby="bindings-heading">
      <div className="row wf-section__head">
        <div>
          <h2 id="bindings-heading">Bindings · {workflow.name}</h2>
          <p className="muted">
            {boundCount} of {inputs.data?.length ?? '…'} inputs bound. Unbound inputs keep the
            workflow&apos;s value.
          </p>
        </div>
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => void onSave()}>
          {save.isPending ? 'Saving…' : 'Save bindings'}
        </Button>
      </div>
      {inputs.isError && (
        <p className="field__error" role="alert">
          {errorText(inputs.error)}
        </p>
      )}
      {inputs.data && (
        <div className="wf-table-wrap">
          <table className="table" aria-label={`Inputs of ${workflow.name}`}>
            <thead>
              <tr>
                <th scope="col">Node</th>
                <th scope="col">Input</th>
                <th scope="col">Workflow value</th>
                <th scope="col">Bound to</th>
              </tr>
            </thead>
            <tbody>
              {inputs.data.map((input) => (
                <BindingRow
                  key={rowKey(input)}
                  input={input}
                  binding={rows[rowKey(input)]}
                  onChange={(b) => {
                    setRows((r) => ({ ...r, [rowKey(input)]: b }))
                    setDirty(true)
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
