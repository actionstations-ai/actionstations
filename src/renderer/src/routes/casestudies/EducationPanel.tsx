// The education record (spec 0452 FR-13, FR-16): for each simulation session, that prebriefing,
// facilitation, professional integrity and debriefing were done and by whom, with the hours, and
// a program record a program can attach to its own documentation. The note on hours is always
// shown: the program and its state board decide what counts.
import { useState } from 'react'
import {
  CORNERSTONES,
  CORNERSTONE_LABELS,
  EDUCATION_HOURS_NOTE,
  type CaseStudyListItem,
  type Cornerstone,
  type EducationRecord,
} from '@shared/schemas'
import { Badge, Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

const today = (): string => new Date().toISOString().slice(0, 10)

function Cornerstones({ projectPath, record }: { projectPath: string; record: EducationRecord }) {
  const [names, setNames] = useState<Partial<Record<Cornerstone, string>>>({})
  const mark = async (c: Cornerstone, done: boolean) => {
    try {
      await call('education:cornerstone', {
        projectPath,
        id: record.id,
        cornerstone: c,
        done,
        ...(done ? { by: names[c] ?? '' } : {}),
      })
    } catch (e) {
      toast.error('Could not record it', errorText(e))
    }
  }
  return (
    <table className="table">
      <caption className="sr-only">Cornerstones of simulation practice for {record.title}</caption>
      <thead>
        <tr>
          <th scope="col">Cornerstone</th>
          <th scope="col">Status</th>
          <th scope="col">Done by</th>
          <th scope="col">
            <span className="sr-only">Action</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {CORNERSTONES.map((c) => {
          const x = record.cornerstones[c]
          return (
            <tr key={c}>
              <th scope="row">{CORNERSTONE_LABELS[c]}</th>
              <td>{x.done ? `Done${x.at ? ` ${x.at.slice(0, 10)}` : ''}` : 'Not recorded'}</td>
              <td>
                {x.done ? (
                  x.by
                ) : (
                  <input
                    className="input"
                    aria-label={`Who did ${CORNERSTONE_LABELS[c].toLowerCase()}`}
                    maxLength={120}
                    value={names[c] ?? ''}
                    onChange={(e) => setNames((n) => ({ ...n, [c]: e.target.value }))}
                  />
                )}
              </td>
              <td>
                {x.done ? (
                  <Button size="sm" onClick={() => void mark(c, false)}>
                    Take back
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={!(names[c] ?? '').trim()}
                    onClick={() => void mark(c, true)}
                  >
                    Mark done
                  </Button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function RecordCard({ projectPath, record }: { projectPath: string; record: EducationRecord }) {
  const save = async (patch: Partial<EducationRecord>) => {
    try {
      await call('education:save', { projectPath, record: { ...record, ...patch } })
    } catch (e) {
      toast.error('Could not save', errorText(e))
    }
  }
  const remove = async () => {
    try {
      await call('education:delete', { projectPath, id: record.id })
    } catch (e) {
      toast.error('Could not delete', errorText(e))
    }
  }
  const missing = CORNERSTONES.filter((c) => !record.cornerstones[c].done)
  return (
    <li className="card stack">
      <h3 className="cs-card__title">{record.title}</h3>
      <p className="row">
        <Badge tone={missing.length === 0 ? 'ok' : 'warn'}>
          {missing.length === 0 ? 'All four recorded' : `${missing.length} not recorded`}
        </Badge>
        <span className="muted">
          {record.date} · {record.hours} hours · {record.participants} participants
          {record.facilitator ? ` · ${record.facilitator}` : ''}
        </span>
      </p>
      <Cornerstones projectPath={projectPath} record={record} />
      <label>
        <input
          type="checkbox"
          checked={record.debriefCheckIn}
          onChange={(e) => void save({ debriefCheckIn: e.target.checked })}
        />{' '}
        The debrief included a check-in with learners
      </label>
      <label>
        <input
          type="checkbox"
          checked={record.contentNoticeShown}
          onChange={(e) => void save({ contentNoticeShown: e.target.checked })}
        />{' '}
        Learners saw the content notice and the choice to opt out
      </label>
      <div>
        <Button onClick={() => void remove()}>Delete this record</Button>
      </div>
    </li>
  )
}

function NewRecord({ projectPath, cases }: { projectPath: string; cases: CaseStudyListItem[] }) {
  const [caseId, setCaseId] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today())
  const [hours, setHours] = useState(2)
  const [facilitator, setFacilitator] = useState('')
  const [participants, setParticipants] = useState(0)
  const create = async () => {
    const chosen = cases.find((c) => c.id === caseId)
    const now = new Date().toISOString()
    try {
      await call('education:save', {
        projectPath,
        record: {
          id: `edu-${Date.now().toString(36)}`,
          title: title.trim() || chosen?.title || 'Simulation session',
          ...(caseId ? { caseId } : {}),
          date,
          hours,
          facilitator,
          participants,
          objectives: [],
          cornerstones: {
            prebrief: { done: false },
            facilitation: { done: false },
            professional_integrity: { done: false },
            debrief: { done: false },
          },
          debriefCheckIn: false,
          contentNoticeShown: false,
          createdAt: now,
          updatedAt: now,
        },
      })
      setTitle('')
    } catch (e) {
      toast.error('Could not add the session', errorText(e))
    }
  }
  return (
    <div className="cs-form">
      <Field label="Case study (optional)">
        {({ id }) => (
          <select
            id={id}
            className="input"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
          >
            <option value="">None</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Session title">
        {({ id }) => (
          <input
            id={id}
            className="input"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      <Field label="Date">
        {({ id }) => (
          <input
            id={id}
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
      <Field label="Simulation hours">
        {({ id }) => (
          <input
            id={id}
            className="input"
            type="number"
            min={0}
            max={24}
            step={0.25}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value) || 0)}
          />
        )}
      </Field>
      <Field label="Facilitator">
        {({ id }) => (
          <input
            id={id}
            className="input"
            maxLength={120}
            value={facilitator}
            onChange={(e) => setFacilitator(e.target.value)}
          />
        )}
      </Field>
      <Field label="Participants">
        {({ id }) => (
          <input
            id={id}
            className="input"
            type="number"
            min={0}
            max={500}
            value={participants}
            onChange={(e) => setParticipants(Number(e.target.value) || 0)}
          />
        )}
      </Field>
      <div>
        <Button variant="primary" onClick={() => void create()}>
          Add a session
        </Button>
      </div>
    </div>
  )
}

export function EducationPanel({
  projectPath,
  cases,
}: {
  projectPath: string
  cases: CaseStudyListItem[]
}) {
  const records = useIpcQuery('education:list', { projectPath })
  const [program, setProgram] = useState('')
  const exportProgram = async () => {
    try {
      const r = await call('casestudy:export', {
        projectPath,
        kind: 'program',
        ...(program.trim() ? { program: program.trim() } : {}),
      })
      toast.success('Program record written', r.path)
    } catch (e) {
      toast.error('Could not write the record', errorText(e))
    }
  }
  return (
    <section className="card stack" aria-labelledby="cs-edu-title">
      <h2 id="cs-edu-title" className="section-title">
        Education record
      </h2>
      <p className="muted">
        Record that each cornerstone of the session was done and by whom, and the hours.{' '}
        {EDUCATION_HOURS_NOTE}
      </p>
      <NewRecord projectPath={projectPath} cases={cases} />
      {(records.data ?? []).length > 0 && (
        <>
          <ul className="cs-list">
            {(records.data ?? []).map((r) => (
              <RecordCard key={r.id} projectPath={projectPath} record={r} />
            ))}
          </ul>
          <div className="cs-form">
            <Field label="Program name for the record">
              {({ id }) => (
                <input
                  id={id}
                  className="input"
                  maxLength={200}
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                />
              )}
            </Field>
            <div>
              <Button variant="primary" onClick={() => void exportProgram()}>
                Write the program record (PDF)
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
