// Exercise details (#420): what the HSEEP documents print about the conduct of the exercise.
// Filled in by the designer, never generated and never sent to a model. Blank fields print as
// fill-in lines in the documents.
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { conductOf, type ConductDetails } from '@shared/schemas/scenario'
import { seededAcronyms } from '@shared/hseep'
import { Button } from '../../../components/ui'
import { Empty, ItemActions, StringList, TextField } from './inputs'
import { moveItem, replaceAt } from './list-utils'
import { PartFrame, type PartEditorProps } from './PartFrame'
import { useScenarioPart, type PartSpec } from './use-scenario-part'

type Update = (fn: (c: ConductDetails) => ConductDetails) => void

const CONDUCT_PART: PartSpec<ConductDetails> = {
  pick: (s) => conductOf(s),
  apply: (s, conduct) => ({ ...s, conduct }),
  id: 'conduct',
  label: 'Exercise details',
  note: 'Edited exercise details',
}

const WALL_CLOCK = /^([01]?\d|2[0-3]):[0-5]\d$/

/** A time field's value as stored: a valid HH:MM, or absent when cleared. */
function withTime(c: ConductDetails, key: 'startTime' | 'endTime', v: string): ConductDetails {
  const { [key]: _drop, ...rest } = c
  return WALL_CLOCK.test(v) ? { ...rest, [key]: v } : rest
}

function Group(props: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="conduct__group">
      <legend className="field__label conduct__legend">{props.legend}</legend>
      {props.children}
    </fieldset>
  )
}

function ScheduleFields({ c, update }: { c: ConductDetails; update: Update }) {
  return (
    <Group legend="Dates and times">
      <fieldset className="string-list">
        <legend className="field__label">Exercise dates</legend>
        {!c.dates.length && <Empty>No dates yet.</Empty>}
        {c.dates.map((d, i) => (
          <div className="string-list__item" key={i}>
            <TextField
              label={`Exercise date ${i + 1}`}
              hideLabel
              type="date"
              value={d}
              onChange={(v) => update((p) => ({ ...p, dates: replaceAt(p.dates, i, v) }))}
            />
            <ItemActions
              name={`date ${i + 1}`}
              index={i}
              count={c.dates.length}
              onMove={(a, b) => update((p) => ({ ...p, dates: moveItem(p.dates, a, b) }))}
              onRemove={(j) => update((p) => ({ ...p, dates: p.dates.filter((_, k) => k !== j) }))}
            />
          </div>
        ))}
        <Button size="sm" onClick={() => update((p) => ({ ...p, dates: [...p.dates, ''] }))}>
          <Plus size={14} aria-hidden /> Add date
        </Button>
      </fieldset>
      <div className="part__item-grid">
        <TextField
          label="Start time"
          type="time"
          value={c.startTime ?? ''}
          onChange={(v) => update((p) => withTime(p, 'startTime', v))}
        />
        <TextField
          label="End time"
          type="time"
          value={c.endTime ?? ''}
          onChange={(v) => update((p) => withTime(p, 'endTime', v))}
        />
      </div>
    </Group>
  )
}

function DirectorFields({ c, update }: { c: ConductDetails; update: Update }) {
  const set = (key: keyof ConductDetails['director']) => (v: string) =>
    update((p) => ({ ...p, director: { ...p.director, [key]: v } }))
  return (
    <Group legend="Exercise director / point of contact">
      <div className="part__item-grid">
        <TextField label="Name" value={c.director.name ?? ''} onChange={set('name')} />
        <TextField
          label="Organization"
          value={c.director.organization ?? ''}
          onChange={set('organization')}
        />
        <TextField
          label="Phone"
          type="tel"
          value={c.director.phone ?? ''}
          onChange={set('phone')}
        />
        <TextField
          label="Email"
          type="email"
          value={c.director.email ?? ''}
          onChange={set('email')}
        />
      </div>
    </Group>
  )
}

function SiteFields({ c, update }: { c: ConductDetails; update: Update }) {
  return (
    <Group legend="Site">
      <div className="part__item-grid">
        <TextField
          label="Site"
          value={c.site}
          onChange={(site) => update((p) => ({ ...p, site }))}
        />
        <TextField
          label="Room"
          value={c.room}
          onChange={(room) => update((p) => ({ ...p, room }))}
        />
      </div>
      <label className="conduct__check">
        <input
          type="checkbox"
          checked={c.observersAllowed}
          onChange={(e) => update((p) => ({ ...p, observersAllowed: e.target.checked }))}
        />
        <span>Observers allowed</span>
      </label>
      <TextField
        label="Safety notes"
        multiline
        value={c.safetyNotes}
        onChange={(safetyNotes) => update((p) => ({ ...p, safetyNotes }))}
      />
      <TextField
        label="Security notes"
        multiline
        value={c.securityNotes}
        onChange={(securityNotes) => update((p) => ({ ...p, securityNotes }))}
      />
    </Group>
  )
}

type Channel = ConductDetails['communications'][number]

function CommunicationsFields({ c, update }: { c: ConductDetails; update: Update }) {
  const set = (fn: (list: Channel[]) => Channel[]) =>
    update((p) => ({ ...p, communications: fn(p.communications) }))
  return (
    <Group legend="Communications plan">
      {!c.communications.length && <Empty>No channels yet.</Empty>}
      <ol className="stack part__list" aria-label="Communication channels">
        {c.communications.map((ch, i) => (
          <li key={i} className="card part__item">
            <div className="part__item-grid">
              <TextField
                label={`Channel ${i + 1}`}
                value={ch.channel}
                onChange={(channel) => set((l) => replaceAt(l, i, { ...ch, channel }))}
              />
              <TextField
                label={`Channel ${i + 1} purpose`}
                value={ch.purpose}
                onChange={(purpose) => set((l) => replaceAt(l, i, { ...ch, purpose }))}
              />
            </div>
            <TextField
              label={`Channel ${i + 1} detail`}
              value={ch.detail}
              onChange={(detail) => set((l) => replaceAt(l, i, { ...ch, detail }))}
            />
            <ItemActions
              name={`channel ${i + 1}`}
              index={i}
              count={c.communications.length}
              onMove={(a, b) => set((l) => moveItem(l, a, b))}
              onRemove={(j) => set((l) => l.filter((_, k) => k !== j))}
            />
          </li>
        ))}
      </ol>
      <div className="row">
        <Button
          size="sm"
          onClick={() => set((l) => [...l, { channel: '', purpose: '', detail: '' }])}
        >
          <Plus size={14} aria-hidden /> Add channel
        </Button>
      </div>
    </Group>
  )
}

type Acronym = ConductDetails['acronyms'][number]

function AcronymFields(props: { c: ConductDetails; update: Update; seed: [string, string][] }) {
  const { c, update } = props
  const set = (fn: (list: Acronym[]) => Acronym[]) =>
    update((p) => ({ ...p, acronyms: fn(p.acronyms) }))
  return (
    <Group legend="Acronyms">
      {!c.acronyms.length && (
        <Empty>
          No acronyms yet. The documents list the standard HSEEP ones until you add some.
        </Empty>
      )}
      {c.acronyms.map((a, i) => (
        <div className="part__item-grid conduct__acronym" key={i}>
          <TextField
            label={`Acronym ${i + 1}`}
            value={a.term}
            onChange={(term) => set((l) => replaceAt(l, i, { ...a, term }))}
          />
          <TextField
            label={`Acronym ${i + 1} meaning`}
            value={a.meaning}
            onChange={(meaning) => set((l) => replaceAt(l, i, { ...a, meaning }))}
          />
          <ItemActions
            name={`acronym ${i + 1}`}
            index={i}
            count={c.acronyms.length}
            onMove={(x, y) => set((l) => moveItem(l, x, y))}
            onRemove={(j) => set((l) => l.filter((_, k) => k !== j))}
          />
        </div>
      ))}
      <div className="row">
        <Button size="sm" onClick={() => set((l) => [...l, { term: '', meaning: '' }])}>
          <Plus size={14} aria-hidden /> Add acronym
        </Button>
        {!c.acronyms.length && (
          <Button size="sm" onClick={() => set(() => seededAcronyms(props.seed))}>
            Add standard acronyms
          </Button>
        )}
      </div>
    </Group>
  )
}

export function ConductDetailsEditor(props: PartEditorProps) {
  const part = useScenarioPart(props.projectPath, props.scenario, CONDUCT_PART)
  const c = part.value
  const update: Update = (fn) => part.update(fn)
  const seed = props.scenario.roles
    .filter((r) => r.abbreviation && r.abbreviation !== r.name)
    .map((r): [string, string] => [r.abbreviation, r.name])
  return (
    <PartFrame
      {...props}
      title="Exercise details"
      noun="exercise details"
      hasContent={JSON.stringify(c) !== JSON.stringify(conductOf({}))}
      editor={part}
      hint="Printed in the Exercise Plan, Situation Manual and C/E Handbook. Blank fields print as lines to fill in by hand. These details stay in the project and are never sent to a model."
    >
      <Group legend="Exercise">
        <div className="part__item-grid">
          <TextField
            label="Exercise name as filed"
            value={c.exerciseName}
            hint={`Blank: "${props.scenario.title}"`}
            onChange={(exerciseName) => update((p) => ({ ...p, exerciseName }))}
          />
          <TextField
            label="Exercise marking"
            value={c.marking}
            onChange={(marking) => update((p) => ({ ...p, marking }))}
          />
        </div>
        <TextField
          label="Sponsor organization"
          value={c.sponsor}
          onChange={(sponsor) => update((p) => ({ ...p, sponsor }))}
        />
        <StringList
          label="Participating organizations"
          itemLabel="Organization"
          items={c.participatingOrganizations}
          onChange={(participatingOrganizations) =>
            update((p) => ({ ...p, participatingOrganizations }))
          }
        />
      </Group>
      <ScheduleFields c={c} update={update} />
      <DirectorFields c={c} update={update} />
      <SiteFields c={c} update={update} />
      <CommunicationsFields c={c} update={update} />
      <AcronymFields c={c} update={update} seed={seed} />
    </PartFrame>
  )
}
