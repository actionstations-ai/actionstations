// The debrief of a finished micro-drill (#437, FR-13, FR-22): per question what was covered, what
// was missed with its plan section, the model answer, and one line on what to review.
import type { MicroDrillDebrief } from '@shared/schemas'
import { Button, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

const STATUS = { covered: 'Covered', partial: 'Partly covered', missed: 'Missed' } as const

export function DebriefBody({ d }: { d: MicroDrillDebrief }) {
  return (
    <>
      <p className="micro-note" role="note">
        {d.notice}
      </p>
      <p>
        Points covered: {Math.round(d.coverage * 100)}%. Hints used: {d.hintsUsed}. Time:{' '}
        {d.minutes} of {d.plannedMinutes} planned minutes.{' '}
        {d.assessment === 'checklist'
          ? 'Points were ticked by the participants.'
          : 'A model checked the answers; compare with the model answers below.'}
      </p>
      <p className="micro-review">
        <strong>{d.reviewLine}</strong>
      </p>
      {d.steps.map((s, i) => (
        <section key={s.id} className="card stack" aria-labelledby={`deb-${s.id}`}>
          <h2 id={`deb-${s.id}`} className="section-title">
            {i + 1}. {s.prompt}
          </h2>
          <p className="muted">
            {s.hintsUsed.length ? `Hints used: Level ${s.hintsUsed.join(', ')}.` : 'No hints used.'}
          </p>
          <table className="table">
            <caption className="sr-only">Expected points for question {i + 1}</caption>
            <thead>
              <tr>
                <th scope="col">Expected point</th>
                <th scope="col">Result</th>
                <th scope="col">Plan section</th>
              </tr>
            </thead>
            <tbody>
              {s.points.map((p) => (
                <tr key={p.text}>
                  <td>{p.text}</td>
                  <td>{STATUS[p.status]}</td>
                  <td>
                    {p.headingPath}
                    {p.page ? `, page ${p.page}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <strong>Model answer.</strong> {s.modelAnswer}
          </p>
        </section>
      ))}
      <p className="muted">{d.evidenceNote}</p>
    </>
  )
}

export function DebriefView(props: { projectPath: string; runId: string; onClose: () => void }) {
  const q = useIpcQuery('microdrills:debrief', {
    projectPath: props.projectPath,
    runId: props.runId,
  })
  const pdf = async () => {
    try {
      const r = await call('microdrills:debrief-pdf', {
        projectPath: props.projectPath,
        runId: props.runId,
      })
      toast.success('Saved as PDF', r.path)
    } catch (e) {
      toast.error('Could not save the PDF', errorText(e))
    }
  }
  if (q.isPending) return <p className="muted page">Loading the debrief…</p>
  if (!q.data) return <p className="page">That run could not be opened.</p>
  return (
    <div className="page micro-page">
      <PageHeader
        eyebrow="Debrief"
        title={q.data.title}
        description={`${q.data.annex.documentTitle} › ${q.data.annex.headingPath} · ${q.data.startedAt.slice(0, 10)}`}
        actions={
          <>
            <Button onClick={() => void pdf()}>Save as PDF</Button>
            <Button variant="primary" onClick={props.onClose}>
              Back to the drills
            </Button>
          </>
        }
      />
      <DebriefBody d={q.data} />
    </div>
  )
}
