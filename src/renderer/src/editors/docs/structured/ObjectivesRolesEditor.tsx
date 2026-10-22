// Exercise objectives and player roles (with standing orders).
import { Plus } from 'lucide-react'
import type { Objective, Scenario } from '@shared/schemas/scenario'
import type { Role } from '@shared/schemas/project'
import { Button } from '../../../components/ui'
import { newItemId } from '../owners'
import { Empty, ItemActions, StringList, TextField } from './inputs'
import { moveItem, replaceAt } from './list-utils'
import { PartFrame, type PartEditorProps } from './PartFrame'
import { useScenarioPart, type PartSpec } from './use-scenario-part'

interface ObjectivesRoles {
  objectives: Objective[]
  roles: Role[]
}

const OBJECTIVES_ROLES_PART: PartSpec<ObjectivesRoles> = {
  pick: (s) => ({ objectives: s.objectives, roles: s.roles }),
  apply: (s, v): Scenario => ({ ...s, objectives: v.objectives, roles: v.roles }),
  id: 'objectives-roles',
  label: 'Objectives & roles',
  note: 'Edited objectives & roles',
}

type ListOps<T> = {
  change: (i: number, item: T) => void
  move: (a: number, b: number) => void
  remove: (i: number) => void
}

function listOps<T>(update: (fn: (list: T[]) => T[]) => void): ListOps<T> {
  return {
    change: (i, item) => update((l) => replaceAt(l, i, item)),
    move: (a, b) => update((l) => moveItem(l, a, b)),
    remove: (i) => update((l) => l.filter((_, k) => k !== i)),
  }
}

function ObjectiveItem(props: { o: Objective; i: number; count: number; ops: ListOps<Objective> }) {
  const { o, i } = props
  return (
    <li className="card part__item">
      <TextField
        label={`Objective ${i + 1} name`}
        value={o.name}
        onChange={(name) => props.ops.change(i, { ...o, name })}
      />
      <TextField
        label={`Objective ${i + 1}`}
        multiline
        value={o.text}
        onChange={(text) => props.ops.change(i, { ...o, text })}
      />
      <ItemActions
        name={`objective ${i + 1}`}
        index={i}
        count={props.count}
        onMove={props.ops.move}
        onRemove={props.ops.remove}
      />
    </li>
  )
}

function RoleItem(props: { r: Role; i: number; count: number; ops: ListOps<Role> }) {
  const { r, i } = props
  const set = (patch: Partial<Role>) => props.ops.change(i, { ...r, ...patch })
  const name = r.name || `role ${i + 1}`
  return (
    <li className="card part__item">
      <div className="part__item-grid">
        <TextField label={`Role ${i + 1} name`} value={r.name} onChange={(v) => set({ name: v })} />
        <TextField
          label={`Role ${i + 1} abbreviation`}
          value={r.abbreviation}
          onChange={(v) => set({ abbreviation: v })}
        />
        <TextField label={`Role ${i + 1} team`} value={r.team} onChange={(v) => set({ team: v })} />
      </div>
      <TextField
        label={`Role ${i + 1} responsibilities`}
        multiline
        value={r.description}
        onChange={(v) => set({ description: v })}
      />
      <StringList
        label={`Standing orders for ${name}`}
        itemLabel="Standing order"
        items={r.standingOrders}
        onChange={(standingOrders) => set({ standingOrders })}
      />
      <ItemActions
        name={name}
        index={i}
        count={props.count}
        onMove={props.ops.move}
        onRemove={props.ops.remove}
      />
    </li>
  )
}

export function ObjectivesRolesEditor(props: PartEditorProps) {
  const part = useScenarioPart(props.projectPath, props.scenario, OBJECTIVES_ROLES_PART)
  const { objectives, roles } = part.value
  const objOps = listOps<Objective>((fn) =>
    part.update((p) => ({ ...p, objectives: fn(p.objectives) })),
  )
  const roleOps = listOps<Role>((fn) => part.update((p) => ({ ...p, roles: fn(p.roles) })))
  const hasContent = objectives.length + roles.length > 0
  return (
    <PartFrame
      {...props}
      title="Objectives & roles"
      part="objectivesRoles"
      noun="objectives & roles"
      hasContent={hasContent}
      editor={part}
    >
      <div className="two-col">
        <section aria-label="Objectives" className="stack">
          <h4 className="section-title">Objectives</h4>
          {!objectives.length && <Empty>No objectives yet.</Empty>}
          <ol className="stack part__list">
            {objectives.map((o, i) => (
              <ObjectiveItem key={o.id} o={o} i={i} count={objectives.length} ops={objOps} />
            ))}
          </ol>
          <div className="row">
            <Button
              size="sm"
              onClick={() =>
                part.update((p) => ({
                  ...p,
                  objectives: [...p.objectives, { id: newItemId('obj'), name: '', text: '' }],
                }))
              }
            >
              <Plus size={14} aria-hidden /> Add objective
            </Button>
          </div>
        </section>
        <section aria-label="Roles" className="stack">
          <h4 className="section-title">Roles & responsibilities</h4>
          {!roles.length && <Empty>No roles yet.</Empty>}
          <ul className="stack part__list">
            {roles.map((r, i) => (
              <RoleItem key={r.id} r={r} i={i} count={roles.length} ops={roleOps} />
            ))}
          </ul>
          <div className="row">
            <Button
              size="sm"
              onClick={() =>
                part.update((p) => ({
                  ...p,
                  roles: [
                    ...p.roles,
                    {
                      id: newItemId('role'),
                      name: 'New role',
                      abbreviation: '',
                      team: '',
                      description: '',
                      standingOrders: [],
                    },
                  ],
                }))
              }
            >
              <Plus size={14} aria-hidden /> Add role
            </Button>
          </div>
        </section>
      </div>
    </PartFrame>
  )
}
