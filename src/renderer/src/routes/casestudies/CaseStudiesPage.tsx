// Case studies (spec 0452 FR-9, FR-10, NFR-2, NFR-5): the library of unfolding case studies for
// nursing education. A case is drafted from a named clinical trajectory or imported, reviewed by
// its author (which releases it to learners), and played one stage at a time. Imported text with
// direct identifiers stops until the author redacts it.
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { CaseStudyListItem } from '@shared/schemas'
import { CASE_TRAJECTORY_KINDS, type IdentifierWarning } from '@shared/ipc'
import { Badge, Button, EmptyState, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { PlayerView } from './PlayerView'
import './casestudies.css'

const KIND_LABEL: Record<(typeof CASE_TRAJECTORY_KINDS)[number], string> = {
  sepsis: 'Sepsis after surgery',
  hemorrhage: 'Bleeding after surgery',
  respiratory_failure: 'Worsening breathing',
  cardiac_event: 'Chest pain and a cardiac event',
  postoperative_deterioration: 'Post-operative deterioration',
  hypoglycemia: 'Low blood sugar on insulin',
}

function DraftPanel({ projectPath }: { projectPath: string }) {
  const [kind, setKind] = useState<(typeof CASE_TRAJECTORY_KINDS)[number]>('sepsis')
  const [seed, setSeed] = useState(1)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const make = async () => {
    setBusy(true)
    try {
      await call('casestudy:draft', {
        projectPath,
        kind,
        seed,
        ...(notice.trim() ? { contentNotice: notice.trim() } : {}),
      })
      toast.success('Draft made', 'Read it through and review it before learners use it.')
    } catch (e) {
      toast.error('Could not make the draft', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card stack" aria-labelledby="cs-draft-title">
      <h2 id="cs-draft-title" className="section-title">
        Draft a case study
      </h2>
      <p className="muted">
        A simulated patient and a six-stage story with questions for each step of clinical judgment.
        The same seed gives the same patient. It stays a draft until you review it.
      </p>
      <div className="cs-form">
        <Field label="Story">
          {({ id }) => (
            <select
              id={id}
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              {CASE_TRAJECTORY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Seed (a different number gives a different patient)">
          {({ id }) => (
            <input
              id={id}
              className="input"
              type="number"
              min={0}
              max={1000000}
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
            />
          )}
        </Field>
        <Field label="Content notice (if the story involves death, violence or harm to children)">
          {({ id }) => (
            <input
              id={id}
              className="input"
              maxLength={500}
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div>
        <Button variant="primary" disabled={busy} onClick={() => void make()}>
          Make a draft
        </Button>
      </div>
    </section>
  )
}

function ImportPanel({ projectPath }: { projectPath: string }) {
  const [json, setJson] = useState('')
  const [warnings, setWarnings] = useState<IdentifierWarning[]>([])
  const [busy, setBusy] = useState(false)
  const run = async (opts: { redact?: boolean; acknowledge?: boolean }) => {
    setBusy(true)
    try {
      const r = await call('casestudy:import', { projectPath, json, ...opts })
      setWarnings(r.saved ? [] : r.warnings)
      if (r.saved) {
        toast.success('Imported as a draft', 'Review it before learners use it.')
        setJson('')
      }
    } catch (e) {
      toast.error('Could not import', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="card">
      <summary className="section-title">Import a case study</summary>
      <div className="stack">
        <p className="muted">
          Paste a case study file (JSON). Never include a real patient’s details. The text is
          checked for direct identifiers such as phone numbers, record numbers, dates of birth and
          addresses before anything is saved.
        </p>
        <Field label="Case study file contents">
          {({ id }) => (
            <textarea
              id={id}
              className="input"
              rows={6}
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
          )}
        </Field>
        {warnings.length > 0 && (
          <div role="alert" className="cs-note cs-note--warn">
            <p>
              <strong>Possible identifiers were found.</strong> Nothing was saved.
            </p>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>
                  {w.kind.replace('_', ' ')} in {w.path || 'the text'}: “{w.text}”
                </li>
              ))}
            </ul>
            <div className="row">
              <Button variant="primary" disabled={busy} onClick={() => void run({ redact: true })}>
                Remove them and import
              </Button>
              <Button disabled={busy} onClick={() => void run({ acknowledge: true })}>
                These are not identifiers, import as is
              </Button>
            </div>
          </div>
        )}
        <div>
          <Button disabled={!json.trim() || busy} onClick={() => void run({})}>
            Import as a draft
          </Button>
        </div>
      </div>
    </details>
  )
}

function CaseCard(props: {
  item: CaseStudyListItem
  projectPath: string
  onPlay: (preview: boolean) => void
}) {
  const { item, projectPath } = props
  const [reviewer, setReviewer] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const review = async () => {
    try {
      await call('casestudy:review', { projectPath, id: item.id, by: reviewer, note: '' })
      setReviewing(false)
      toast.success('Reviewed', 'Learners can now use this case study.')
    } catch (e) {
      toast.error('Could not record the review', errorText(e))
    }
  }
  const remove = async () => {
    try {
      await call('casestudy:delete', { projectPath, id: item.id })
    } catch (e) {
      toast.error('Could not delete', errorText(e))
    }
  }
  return (
    <li className="card cs-card">
      <h3 className="cs-card__title">{item.title}</h3>
      <p className="row">
        <Badge tone={item.status === 'reviewed' ? 'ok' : 'neutral'}>
          {item.status === 'reviewed' ? 'Reviewed' : 'Draft'}
        </Badge>
        <span className="muted">
          {item.origin} · {item.stages} stages · {item.prompts} questions
        </span>
      </p>
      {item.contentNotice && (
        <p className="cs-note cs-note--warn">Content notice: {item.contentNotice}</p>
      )}
      <div className="row">
        <Button
          variant="primary"
          disabled={item.status !== 'reviewed'}
          onClick={() => props.onPlay(false)}
        >
          Play
        </Button>
        {item.status !== 'reviewed' && (
          <Button onClick={() => props.onPlay(true)}>Preview as the author</Button>
        )}
        {item.status !== 'reviewed' && !reviewing && (
          <Button onClick={() => setReviewing(true)}>Record my review…</Button>
        )}
        {confirming ? (
          <>
            <Button variant="danger" onClick={() => void remove()}>
              Delete the case and its runs
            </Button>
            <Button onClick={() => setConfirming(false)}>Keep it</Button>
          </>
        ) : (
          <Button onClick={() => setConfirming(true)}>Delete…</Button>
        )}
      </div>
      {reviewing && (
        <div className="stack">
          <p className="muted">
            Recording your review says you read the stages, the questions, the keys and the
            rationales and that the content is ready for learners. Editing the case later returns it
            to draft.
          </p>
          <Field label="Your name">
            {({ id }) => (
              <input
                id={id}
                className="input"
                maxLength={120}
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
              />
            )}
          </Field>
          <div className="row">
            <Button variant="primary" disabled={!reviewer.trim()} onClick={() => void review()}>
              Record the review
            </Button>
            <Button onClick={() => setReviewing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function CaseStudiesPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const [search, setSearch] = useSearchParams()
  const caseId = search.get('case') ?? ''
  const runId = search.get('run') ?? ''
  const preview = search.get('preview') === '1'
  const list = useIpcQuery('casestudy:list', { projectPath })
  const back = () => setSearch({})
  if (caseId)
    return (
      <PlayerView
        projectPath={projectPath}
        caseId={caseId}
        {...(runId ? { runId } : {})}
        preview={preview}
        onStarted={(id) =>
          setSearch({ case: caseId, run: id, ...(preview ? { preview: '1' } : {}) })
        }
        onClose={back}
      />
    )
  return (
    <div className="page cs-page">
      <PageHeader
        eyebrow="Nursing education"
        title="Case studies"
        description="Unfolding case studies: one patient’s story revealed in stages, with a decision at each stage for the steps of clinical judgment. Everything here is simulated and is practice, not clinical guidance."
      />
      <DraftPanel projectPath={projectPath} />
      <ImportPanel projectPath={projectPath} />
      <section aria-labelledby="cs-library-title" className="stack">
        <h2 id="cs-library-title" className="section-title">
          Your case studies
        </h2>
        {list.isPending ? (
          <p className="muted">Loading the case studies…</p>
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState title="No case studies yet" body="Make a draft above or import one." />
        ) : (
          <ul className="cs-list">
            {(list.data ?? []).map((item) => (
              <CaseCard
                key={item.id}
                item={item}
                projectPath={projectPath}
                onPlay={(p) => setSearch({ case: item.id, ...(p ? { preview: '1' } : {}) })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
