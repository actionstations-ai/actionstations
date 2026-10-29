// Persona cards for the SimCell assistant (spec 0429 FR-1 to FR-5, FR-16). A card is built from
// constraints: goals, deadlines, escalation rules, what the character knows and must not reveal,
// and concessions with their conditions. There is no free-text personality field; "register" is
// one or two words of tone and is style only.
import { useId, useState } from 'react'
import { mediaUrl } from '@shared/media-url'
import {
  PERSONA_CHANNELS,
  type EscalationWhen,
  type PersonaCard,
  type PersonaKind,
  type PersonasFile,
} from '@shared/schemas/persona'
import type { Scenario } from '@shared/schemas/scenario'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { useJob } from '../generate/use-job'
import { cardProblems, mergeProposal } from './persona-model'

const KINDS: PersonaKind[] = [
  'reporter',
  'regulator',
  'vendor',
  'resident',
  'attacker',
  'partner',
  'agency',
  'other',
]
const POST_FX = ['phone', 'radio', 'pa', 'terminal_ambience'] as const
const WHEN_KINDS: EscalationWhen['kind'][] = ['time', 'row_released', 'no_reply', 'player_says']
const WHEN_LABEL: Record<EscalationWhen['kind'], string> = {
  time: 'Exercise time reaches',
  row_released: 'This MSEL row is released',
  no_reply: 'Minutes without a reply',
  player_says: 'Players say something like',
}

const lines = (s: string): string[] =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

function nextId(prefix: string, used: readonly { id: string }[]): string {
  for (let n = used.length + 1; ; n++)
    if (!used.some((u) => u.id === `${prefix}${n}`)) return `${prefix}${n}`
}

const blankWhen = (kind: EscalationWhen['kind']): EscalationWhen =>
  kind === 'time'
    ? { kind, at: '1:00' }
    : kind === 'row_released'
      ? { kind, rowId: '' }
      : kind === 'no_reply'
        ? { kind, minutes: 10 }
        : { kind, text: '' }

function newCard(existing: readonly PersonaCard[]): PersonaCard {
  return {
    id: nextId('p', existing),
    displayName: 'New outside party',
    roleTitle: '',
    organization: { name: '', fictional: true },
    kind: 'other',
    register: '',
    goals: [],
    deadlines: [],
    escalationRules: [],
    knowledge: { knows: [], doesNotKnow: [], mustNotReveal: [] },
    concessions: [],
    hardQuestions: [],
    linkedRowIds: [],
    channels: ['message'],
    voice: { postFx: ['phone'] },
  }
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  max?: number
  hint?: string
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {props.label}
      </label>
      <input
        id={id}
        className="input"
        value={props.value}
        maxLength={props.max ?? 300}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <span className="fac-hint">{props.hint}</span>}
    </div>
  )
}

function Lines(props: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  hint?: string
}) {
  const id = useId()
  const [text, setText] = useState(props.value.join('\n'))
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {props.label}
      </label>
      <textarea
        id={id}
        className="input"
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          props.onChange(lines(e.target.value))
        }}
      />
      <span className="fac-hint">{props.hint ?? 'One per line.'}</span>
    </div>
  )
}

function Goals({ card, set }: { card: PersonaCard; set: (c: PersonaCard) => void }) {
  return (
    <fieldset className="fieldset">
      <legend>Goals (what it wants from the players)</legend>
      {card.goals.map((g, i) => (
        <div key={g.id} className="row">
          <Field
            label={`Goal ${i + 1}`}
            value={g.text}
            onChange={(text) =>
              set({ ...card, goals: card.goals.map((x) => (x.id === g.id ? { ...x, text } : x)) })
            }
          />
          <Button
            size="sm"
            onClick={() => set({ ...card, goals: card.goals.filter((x) => x.id !== g.id) })}
          >
            Remove goal {i + 1}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        disabled={card.goals.length >= 5}
        onClick={() =>
          set({ ...card, goals: [...card.goals, { id: nextId('g', card.goals), text: '' }] })
        }
      >
        Add a goal
      </Button>
    </fieldset>
  )
}

function Deadlines({ card, set }: { card: PersonaCard; set: (c: PersonaCard) => void }) {
  const upd = (id: string, patch: Partial<PersonaCard['deadlines'][number]>) =>
    set({ ...card, deadlines: card.deadlines.map((d) => (d.id === id ? { ...d, ...patch } : d)) })
  return (
    <fieldset className="fieldset">
      <legend>Deadlines</legend>
      {card.deadlines.map((d, i) => (
        <div key={d.id} className="row">
          <Field
            label={`Deadline ${i + 1} at (H:MM)`}
            value={d.at}
            max={5}
            onChange={(at) => upd(d.id, { at })}
          />
          <Field label="Wants by then" value={d.wants} onChange={(wants) => upd(d.id, { wants })} />
          <Field
            label="If missed"
            value={d.ifMissed}
            onChange={(ifMissed) => upd(d.id, { ifMissed })}
          />
          <Button
            size="sm"
            onClick={() => set({ ...card, deadlines: card.deadlines.filter((x) => x.id !== d.id) })}
          >
            Remove deadline {i + 1}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        disabled={card.deadlines.length >= 5}
        onClick={() =>
          set({
            ...card,
            deadlines: [
              ...card.deadlines,
              { id: nextId('d', card.deadlines), at: '1:00', wants: '', ifMissed: '' },
            ],
          })
        }
      >
        Add a deadline
      </Button>
    </fieldset>
  )
}

function WhenValue(props: { when: EscalationWhen; onChange: (w: EscalationWhen) => void }) {
  const { when } = props
  if (when.kind === 'time')
    return (
      <Field
        label="At (H:MM)"
        value={when.at}
        max={5}
        onChange={(at) => props.onChange({ ...when, at })}
      />
    )
  if (when.kind === 'row_released')
    return (
      <Field
        label="Row id"
        value={when.rowId}
        max={64}
        onChange={(rowId) => props.onChange({ ...when, rowId })}
      />
    )
  if (when.kind === 'no_reply')
    return (
      <Field
        label="Minutes"
        value={String(when.minutes)}
        max={3}
        onChange={(v) =>
          props.onChange({ ...when, minutes: Math.min(120, Math.max(1, Number(v) || 1)) })
        }
      />
    )
  return (
    <Field
      label="Players say"
      value={when.text}
      max={200}
      hint="The model judges this one, so drafts that use it carry a check."
      onChange={(text) => props.onChange({ ...when, text })}
    />
  )
}

function Rules({ card, set }: { card: PersonaCard; set: (c: PersonaCard) => void }) {
  const upd = (id: string, patch: Partial<PersonaCard['escalationRules'][number]>) =>
    set({
      ...card,
      escalationRules: card.escalationRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })
  return (
    <fieldset className="fieldset">
      <legend>Escalation rules</legend>
      {card.escalationRules.map((r, i) => (
        <div key={r.id} className="row">
          <div className="field">
            <label htmlFor={`rule-kind-${r.id}`} className="field__label">
              Rule {i + 1} applies when
            </label>
            <select
              id={`rule-kind-${r.id}`}
              className="select"
              value={r.when.kind}
              onChange={(e) =>
                upd(r.id, { when: blankWhen(e.target.value as EscalationWhen['kind']) })
              }
            >
              {WHEN_KINDS.map((k) => (
                <option key={k} value={k}>
                  {WHEN_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <WhenValue when={r.when} onChange={(when) => upd(r.id, { when })} />
          <Field label="Then it" value={r.then} onChange={(then) => upd(r.id, { then })} />
          <Button
            size="sm"
            onClick={() =>
              set({ ...card, escalationRules: card.escalationRules.filter((x) => x.id !== r.id) })
            }
          >
            Remove rule {i + 1}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        disabled={card.escalationRules.length >= 8}
        onClick={() =>
          set({
            ...card,
            escalationRules: [
              ...card.escalationRules,
              { id: nextId('r', card.escalationRules), when: blankWhen('no_reply'), then: '' },
            ],
          })
        }
      >
        Add a rule
      </Button>
    </fieldset>
  )
}

function Concessions({ card, set }: { card: PersonaCard; set: (c: PersonaCard) => void }) {
  const upd = (id: string, patch: Partial<PersonaCard['concessions'][number]>) =>
    set({
      ...card,
      concessions: card.concessions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })
  return (
    <fieldset className="fieldset">
      <legend>Concessions (each needs a condition)</legend>
      {card.concessions.map((c, i) => (
        <div key={c.id} className="row">
          <Field
            label={`Concession ${i + 1} gives`}
            value={c.give}
            onChange={(give) => upd(c.id, { give })}
          />
          <Field label="Only if" value={c.onlyIf} onChange={(onlyIf) => upd(c.id, { onlyIf })} />
          <Button
            size="sm"
            onClick={() =>
              set({ ...card, concessions: card.concessions.filter((x) => x.id !== c.id) })
            }
          >
            Remove concession {i + 1}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        disabled={card.concessions.length >= 5}
        onClick={() =>
          set({
            ...card,
            concessions: [
              ...card.concessions,
              { id: nextId('c', card.concessions), give: '', onlyIf: '' },
            ],
          })
        }
      >
        Add a concession
      </Button>
    </fieldset>
  )
}

function Voice(props: {
  projectPath: string
  scenarioId: string
  card: PersonaCard
  saved: boolean
  set: (c: PersonaCard) => void
}) {
  const { card } = props
  const [url, setUrl] = useState<string>()
  const preview = async () => {
    try {
      const r = await call('simcell:voice-render', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        personaId: card.id,
        text: `This is ${card.displayName}${card.organization.name ? ` from ${card.organization.name}` : ''}. I am calling about the situation.`,
      })
      setUrl(mediaUrl(props.projectPath, r.assetPath))
    } catch (e) {
      toast.error('Could not make the voice', e)
    }
  }
  return (
    <fieldset className="fieldset">
      <legend>Voice for calls</legend>
      <Field
        label="Voice name"
        value={card.voice.voiceId ?? ''}
        max={120}
        hint="A voice from the audio provider's list. Leave empty for the default. Voices modeled on a real person are not offered."
        onChange={(voiceId) =>
          props.set({ ...card, voice: { ...card.voice, voiceId: voiceId || undefined } })
        }
      />
      <div role="group" aria-label="Sound effects" className="row">
        {POST_FX.map((fx) => (
          <label key={fx} className="fac-live__check">
            <input
              type="checkbox"
              checked={card.voice.postFx.includes(fx)}
              onChange={(e) =>
                props.set({
                  ...card,
                  voice: {
                    ...card.voice,
                    postFx: e.target.checked
                      ? [...card.voice.postFx, fx]
                      : card.voice.postFx.filter((x) => x !== fx),
                  },
                })
              }
            />
            {fx.replace('_', ' ')}
          </label>
        ))}
      </div>
      <Button size="sm" disabled={!props.saved} onClick={() => void preview()}>
        Preview the voice
      </Button>
      {!props.saved && <span className="fac-hint"> Save the cards first to preview.</span>}
      {url && <audio controls src={url} aria-label="Voice preview" />}
    </fieldset>
  )
}

function CardForm(props: {
  projectPath: string
  scenario: Scenario
  card: PersonaCard
  saved: boolean
  set: (c: PersonaCard) => void
}) {
  const { card, set } = props
  const problems = cardProblems(card)
  return (
    <div className="personas__form">
      {problems.length > 0 && (
        <ul aria-label="To fix before drafting" className="fac-simcell__flags">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <Field
        label="Display name"
        value={card.displayName}
        max={80}
        hint="A fictional person, or a title alone such as the station's news editor."
        onChange={(displayName) => set({ ...card, displayName })}
      />
      <Field
        label="Role title"
        value={card.roleTitle}
        max={120}
        onChange={(roleTitle) => set({ ...card, roleTitle })}
      />
      <Field
        label="Organization"
        value={card.organization.name}
        max={120}
        onChange={(name) => set({ ...card, organization: { ...card.organization, name } })}
      />
      <label className="fac-live__check">
        <input
          type="checkbox"
          checked={card.organization.fictional}
          onChange={(e) =>
            set({ ...card, organization: { ...card.organization, fictional: e.target.checked } })
          }
        />
        This organization is fictional
      </label>
      <div className="field">
        <label htmlFor="persona-kind" className="field__label">
          Kind
        </label>
        <select
          id="persona-kind"
          className="select"
          value={card.kind}
          onChange={(e) => set({ ...card, kind: e.target.value as PersonaKind })}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <Field
        label="Register"
        value={card.register}
        max={40}
        hint="One or two words of tone, such as formal or terse. It changes style only, never what the character wants."
        onChange={(register) => set({ ...card, register })}
      />
      <Goals card={card} set={set} />
      <Deadlines card={card} set={set} />
      <Rules card={card} set={set} />
      <fieldset className="fieldset">
        <legend>What it knows</legend>
        <Lines
          label="Knows"
          value={card.knowledge.knows}
          onChange={(knows) => set({ ...card, knowledge: { ...card.knowledge, knows } })}
        />
        <Lines
          label="Does not know"
          value={card.knowledge.doesNotKnow}
          onChange={(doesNotKnow) =>
            set({ ...card, knowledge: { ...card.knowledge, doesNotKnow } })
          }
        />
        <Lines
          label="Must never reveal"
          value={card.knowledge.mustNotReveal}
          hint="Short phrases. A draft that contains one is flagged."
          onChange={(mustNotReveal) =>
            set({ ...card, knowledge: { ...card.knowledge, mustNotReveal } })
          }
        />
      </fieldset>
      <Concessions card={card} set={set} />
      <Lines
        label="Hard questions"
        value={card.hardQuestions}
        onChange={(hardQuestions) => set({ ...card, hardQuestions })}
      />
      <div role="group" aria-label="Linked MSEL rows" className="field">
        <span className="field__label">
          Linked MSEL rows (events this character can see once released)
        </span>
        <div className="row personas__rows">
          {props.scenario.msel.map((r) => (
            <label key={r.id} className="fac-live__check">
              <input
                type="checkbox"
                checked={card.linkedRowIds.includes(r.id)}
                onChange={(e) =>
                  set({
                    ...card,
                    linkedRowIds: e.target.checked
                      ? [...card.linkedRowIds, r.id]
                      : card.linkedRowIds.filter((x) => x !== r.id),
                  })
                }
              />
              {r.id}
            </label>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Channels" className="row">
        {PERSONA_CHANNELS.map((c) => (
          <label key={c} className="fac-live__check">
            <input
              type="checkbox"
              checked={card.channels.includes(c)}
              onChange={(e) =>
                set({
                  ...card,
                  channels: e.target.checked
                    ? [...card.channels, c]
                    : card.channels.filter((x) => x !== c),
                })
              }
            />
            {c}
          </label>
        ))}
      </div>
      <Voice
        projectPath={props.projectPath}
        scenarioId={props.scenario.id}
        card={card}
        saved={props.saved}
        set={set}
      />
    </div>
  )
}

export function PersonasEditor(props: { projectPath: string; scenario: Scenario }) {
  const { projectPath, scenario } = props
  const base = { projectPath, scenarioId: scenario.id }
  const query = useIpcQuery('simcell:personas-get', base)
  const [draft, setDraft] = useState<PersonaCard[] | null>(null)
  const [selected, setSelected] = useState<string>()
  const [jobId, setJobId] = useState<string | null>(null)
  const saved = query.data?.personas
  const cards = draft ?? saved ?? []
  const dirty = draft !== null
  const edit = (fn: (cur: PersonaCard[]) => PersonaCard[]) =>
    setDraft((cur) => fn(cur ?? saved ?? []))

  const propose = (proposal: PersonaCard[]) => {
    edit((cur) => mergeProposal(cur, proposal))
    setSelected(proposal[0]?.id)
    toast.info('Review the cards, then save them')
  }
  const job = useJob(jobId, (e) => {
    setJobId(null)
    if (e.status === 'done' && e.result) propose((e.result as PersonasFile).personas)
    else if (e.status === 'error') toast.error('The model could not fill in the cards', e.error)
  })

  const fromScripts = async (enrich: boolean) => {
    try {
      const r = await call('simcell:personas-from-scripts', { ...base, enrich })
      if (r.proposal) propose(r.proposal.personas)
      else if (r.jobId) setJobId(r.jobId)
    } catch (e) {
      toast.error('Could not create the cards', e)
    }
  }
  const save = async () => {
    try {
      const file = await call('simcell:personas-save', {
        ...base,
        file: { version: 1, personas: cards },
      })
      queryClient.setQueryData(['simcell:personas-get', base], file)
      setDraft(null)
      toast.success('Persona cards saved')
    } catch (e) {
      toast.error('The cards were not saved', e)
    }
  }
  const change = (card: PersonaCard) => edit((cur) => cur.map((c) => (c.id === card.id ? card : c)))
  const current = cards.find((c) => c.id === selected) ?? cards[0]
  const working = jobId !== null && job?.status !== 'error'

  return (
    <div className="personas">
      <p className="fac-hint">
        Outside parties the SimCell plays. Each card says what the party wants, by when, and what it
        will not say. During play the assistant drafts replies from these cards and you approve each
        one.
      </p>
      <div className="row">
        <Button disabled={!scenario.simcellScripts.length} onClick={() => void fromScripts(false)}>
          Create from SimCell scripts
        </Button>
        <Button
          disabled={!scenario.simcellScripts.length || working}
          onClick={() => void fromScripts(true)}
        >
          {working ? 'Filling in…' : 'Create and fill in with the model'}
        </Button>
        <Button
          onClick={() => {
            const card = newCard(cards)
            edit((cur) => [...cur, card])
            setSelected(card.id)
          }}
        >
          Add a persona
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={() => void save()}>
          Save cards
        </Button>
        {dirty && <span className="fac-hint">Unsaved changes</span>}
      </div>
      {cards.length === 0 ? (
        <p className="fac-hint">
          {scenario.simcellScripts.length
            ? 'No cards yet. Create them from the SimCell scripts.'
            : 'No cards yet. Add a persona to start.'}
        </p>
      ) : (
        <div className="personas__layout">
          <ul className="personas__list" aria-label="Persona cards">
            {cards.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="fac-msg__thread"
                  aria-pressed={c.id === current?.id}
                  onClick={() => setSelected(c.id)}
                >
                  <span className="fac-msg__thread-name">{c.displayName}</span>
                  <span className="fac-hint">
                    {c.kind}
                    {cardProblems(c).length > 0 ? ' · needs attention' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {current && (
            <section aria-label={`Card for ${current.displayName}`}>
              <CardForm
                key={current.id}
                projectPath={projectPath}
                scenario={scenario}
                card={current}
                saved={!dirty}
                set={change}
              />
              <Button
                onClick={() => {
                  edit((cur) => cur.filter((c) => c.id !== current.id))
                  setSelected(undefined)
                }}
              >
                Remove this persona
              </Button>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
