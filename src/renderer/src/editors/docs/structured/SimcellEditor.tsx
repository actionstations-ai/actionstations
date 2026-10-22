// SimCell scripts: who the facilitator plays, when, the hard questions to ask and what
// it takes to concede.
import { Plus } from 'lucide-react'
import type { SimcellScript } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { Empty, ItemActions, StringList, TextField } from './inputs'
import { moveItem, replaceAt } from './list-utils'
import { PartFrame, type PartEditorProps } from './PartFrame'
import { useScenarioPart, type PartSpec } from './use-scenario-part'

const SIMCELL_PART: PartSpec<SimcellScript[]> = {
  pick: (s) => s.simcellScripts,
  apply: (s, simcellScripts) => ({ ...s, simcellScripts }),
  id: 'simcell',
  label: 'SimCell scripts',
  note: 'Edited SimCell scripts',
}

function ScriptItem(props: {
  s: SimcellScript
  i: number
  count: number
  onChange: (s: SimcellScript) => void
  onMove: (a: number, b: number) => void
  onRemove: (i: number) => void
}) {
  const { s, i } = props
  const set = (patch: Partial<SimcellScript>) => props.onChange({ ...s, ...patch })
  const name = s.rolePlayed || `script ${i + 1}`
  return (
    <li className="card part__item">
      <div className="part__item-grid">
        <TextField
          label={`Script ${i + 1} role played`}
          value={s.rolePlayed}
          onChange={(v) => set({ rolePlayed: v })}
        />
        <TextField
          label={`Script ${i + 1} trigger`}
          multiline
          value={s.trigger}
          onChange={(v) => set({ trigger: v })}
        />
      </div>
      <div className="part__item-grid">
        <StringList
          label={`Hard questions (${name})`}
          itemLabel="Hard question"
          items={s.hardQuestions}
          onChange={(hardQuestions) => set({ hardQuestions })}
        />
        <StringList
          label={`Concede only when (${name})`}
          itemLabel="Concession"
          items={s.concessions}
          onChange={(concessions) => set({ concessions })}
        />
      </div>
      <ItemActions
        name={name}
        index={i}
        count={props.count}
        onMove={props.onMove}
        onRemove={props.onRemove}
      />
    </li>
  )
}

export function SimcellEditor(props: PartEditorProps) {
  const part = useScenarioPart(props.projectPath, props.scenario, SIMCELL_PART)
  const scripts = part.value
  return (
    <PartFrame
      {...props}
      title="SimCell scripts"
      part="simcell"
      noun="controller handbook"
      hasContent={scripts.length > 0}
      editor={part}
      hint="SimCell scripts are written with the controller handbook, so regenerating them regenerates the handbook."
    >
      {!scripts.length && <Empty>No SimCell scripts yet.</Empty>}
      <ul className="stack part__list" aria-label="SimCell scripts">
        {scripts.map((s, i) => (
          <ScriptItem
            key={i}
            s={s}
            i={i}
            count={scripts.length}
            onChange={(next) => part.update((l) => replaceAt(l, i, next))}
            onMove={(a, b) => part.update((l) => moveItem(l, a, b))}
            onRemove={(j) => part.update((l) => l.filter((_, k) => k !== j))}
          />
        ))}
      </ul>
      <div className="row">
        <Button
          size="sm"
          onClick={() =>
            part.update((l) => [
              ...l,
              { rolePlayed: '', trigger: '', hardQuestions: [], concessions: [] },
            ])
          }
        >
          <Plus size={14} aria-hidden /> Add SimCell script
        </Button>
      </div>
    </PartFrame>
  )
}
