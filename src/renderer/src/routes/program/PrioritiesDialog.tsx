// The program priorities the IPP is built around (FR-8): text, capabilities, rationale, sources.
import { useState } from 'react'
import {
  PRIORITY_SOURCE_KINDS,
  PRIORITY_SOURCE_LABELS,
  type ProgramPriority,
} from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { refreshProgramQueries } from '../../state/program'
import { CapabilityPicker } from './CapabilityPicker'
import type { ProgramContext } from './ProgramFrame'

const blank = (): ProgramPriority => ({
  id: crypto.randomUUID(),
  text: '',
  coreCapabilities: [],
  rationale: '',
  sources: [],
})

export function PrioritiesDialog({ ctx, onClose }: { ctx: ProgramContext; onClose: () => void }) {
  const { program } = ctx.summary
  const [items, setItems] = useState<ProgramPriority[]>(program.priorities)
  const [error, setError] = useState('')
  const change = (id: string, patch: Partial<ProgramPriority>) =>
    setItems((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const save = async () => {
    if (items.some((p) => !p.text.trim()))
      return setError('Every priority needs a short statement.')
    try {
      await call('program:update', {
        programPath: ctx.programPath,
        baseUpdatedAt: program.updatedAt,
        patch: { priorities: items.map((p) => ({ ...p, text: p.text.trim() })) },
      })
      await refreshProgramQueries()
      onClose()
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Program priorities"
      description="What the program must achieve in this cycle, and why. Priorities that no completed exercise has addressed raise a capability in the proposal."
      className="program-drawer"
      footer={
        <>
          <Button onClick={() => setItems((l) => [...l, blank()])}>Add priority</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        {items.length === 0 && <p className="muted">No priorities yet.</p>}
        {items.map((p, i) => (
          <section key={p.id} className="card stack" aria-label={`Priority P-${i + 1}`}>
            <Field label={`P-${i + 1}: priority`}>
              {({ id }) => (
                <input
                  id={id}
                  className="input"
                  value={p.text}
                  onChange={(e) => change(p.id, { text: e.target.value })}
                />
              )}
            </Field>
            <Field label="Why it matters">
              {({ id }) => (
                <textarea
                  id={id}
                  className="textarea"
                  value={p.rationale}
                  onChange={(e) => change(p.id, { rationale: e.target.value })}
                />
              )}
            </Field>
            <CapabilityPicker
              legend="Core Capabilities"
              value={p.coreCapabilities}
              onChange={(v) => change(p.id, { coreCapabilities: v })}
            />
            <div className="row program-form-row">
              <Field label="Source">
                {({ id }) => (
                  <select
                    id={id}
                    className="select"
                    value={p.sources[0]?.kind ?? 'other'}
                    onChange={(e) =>
                      change(p.id, {
                        sources: [
                          {
                            kind: e.target.value as ProgramPriority['sources'][number]['kind'],
                            ref: p.sources[0]?.ref ?? '',
                          },
                        ],
                      })
                    }
                  >
                    {PRIORITY_SOURCE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PRIORITY_SOURCE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Reference (for example, AAR 2025 TTX)">
                {({ id }) => (
                  <input
                    id={id}
                    className="input"
                    value={p.sources[0]?.ref ?? ''}
                    onChange={(e) =>
                      change(p.id, {
                        sources: [{ kind: p.sources[0]?.kind ?? 'other', ref: e.target.value }],
                      })
                    }
                  />
                )}
              </Field>
            </div>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setItems((l) => l.filter((x) => x.id !== p.id))}
            >
              Remove P-{i + 1}
            </Button>
          </section>
        ))}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
