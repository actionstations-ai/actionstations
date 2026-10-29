import { Tabs } from 'radix-ui'
import { ArrowLeft, CheckCircle2, FolderOpen, RotateCcw, TriangleAlert } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import type { CompletenessReport, ExportTarget } from '@shared/ipc'
import type { JobDoneEvent } from '@shared/schemas/job'
import { Button, PageHeader, ProgressBar } from '../../components/ui'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { useExportJob } from './use-export-job'
import {
  asExportResult,
  DEFAULT_TARGETS,
  DOCUMENT_TARGETS,
  FILE_TARGETS,
  HSEEP_TARGETS,
  PREVIEW_DOCS,
  rememberOutDir,
  rememberedOutDir,
  toggleTarget,
  type ExportJobResult,
  type PreviewDoc,
  type TargetOption,
} from './targets'
import { type Readiness } from '../scenarios/readiness'
import { useReadiness } from '../scenarios/use-readiness'
import './export.css'
import { errorText } from '../../lib/errors'
import { LiveStatus } from '../../components/LiveStatus'
import { CancelJobButton } from '../../components/CancelJobButton'

function TargetGroup(props: {
  legend: string
  options: TargetOption[]
  selected: ExportTarget[]
  onToggle: (id: ExportTarget) => void
  disabled: boolean
  children?: ReactNode
}) {
  return (
    <fieldset className="export-targets" disabled={props.disabled}>
      <legend className="export-targets__legend">{props.legend}</legend>
      {props.options.map((o) => (
        <label key={o.id} className="export-target">
          <input
            type="checkbox"
            checked={props.selected.includes(o.id)}
            onChange={() => props.onToggle(o.id)}
            aria-describedby={`export-hint-${o.id}`}
          />
          <span className="export-target__text">
            <span className="export-target__label">{o.label}</span>
            <span id={`export-hint-${o.id}`} className="export-target__hint">
              {o.hint}
            </span>
          </span>
        </label>
      ))}
      {props.children}
    </fieldset>
  )
}

function Preview({ projectPath, scenarioId }: { projectPath: string; scenarioId: string }) {
  const [doc, setDoc] = useState<PreviewDoc>('msel')
  const preview = useIpcQuery('export:preview-html', { projectPath, scenarioId, doc })
  const label = PREVIEW_DOCS.find((d) => d.id === doc)?.label ?? doc
  return (
    <section className="export-preview" aria-label="Document preview">
      <Tabs.Root value={doc} onValueChange={(v) => setDoc(v as PreviewDoc)}>
        <Tabs.List className="export-preview__tabs" aria-label="Preview document">
          {PREVIEW_DOCS.map((d) => (
            <Tabs.Trigger key={d.id} value={d.id} className="export-preview__tab">
              {d.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value={doc} tabIndex={-1}>
          <div className="export-preview__frame" aria-busy={preview.isFetching}>
            {preview.isError && (
              <p className="field__error" role="alert">
                Preview failed: {errorText(preview.error)}
              </p>
            )}
            {preview.data && (
              <iframe
                // No scripts, no same-origin: the document is static HTML built from model text.
                sandbox=""
                title={`Preview of ${label}`}
                srcDoc={preview.data.html}
              />
            )}
            {!preview.data && !preview.isError && <p className="muted">Building preview…</p>}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </section>
  )
}

/** What the export will contain, shown before it runs (#238). */
function ReadinessSummary(props: { readiness: Readiness | undefined; scenarioUrl: string }) {
  const r = props.readiness
  if (!r) return <p className="muted export-ready">Checking the scenario…</p>
  const missing = r.rows - r.written
  const unrendered = r.written - r.rendered
  const problems = [
    missing > 0 && `${missing} of ${r.rows} events have no inject yet`,
    unrendered > 0 && `${unrendered} inject${unrendered === 1 ? ' is' : 's are'} not rendered`,
    r.errors > 0 && `${r.errors} check${r.errors === 1 ? '' : 's'} report errors`,
  ].filter((p): p is string => !!p)
  if (!problems.length)
    return (
      <p className="export-ready export-ready--ok">
        <CheckCircle2 size={16} aria-hidden /> All {r.rows} injects are written and rendered.
      </p>
    )
  return (
    <div className="export-ready export-ready--warn">
      <p>
        <TriangleAlert size={16} aria-hidden /> {problems.join('; ')}. You can export anyway; the
        deck and handbook will show what is missing.
      </p>
      <Link to={`${props.scenarioUrl}?tab=${missing || unrendered ? 'injects' : 'warnings'}`}>
        {missing ? 'Write the missing injects' : unrendered ? 'Render media' : 'Show the errors'}
      </Link>
    </div>
  )
}

/** What the HSEEP set will contain and which exercise details are still blank (#420). */
function CompletenessSummary(props: {
  report: CompletenessReport | undefined
  error: unknown
  scenarioUrl: string
}) {
  const { report } = props
  if (props.error)
    return (
      <p className="field__error" role="alert">
        Could not check the HSEEP documents: {errorText(props.error)}
      </p>
    )
  if (!report) return <p className="muted export-ready">Checking the HSEEP documents…</p>
  const gaps = report.documents.filter((d) => !d.ready && d.doc !== 'aar')
  return (
    <section className="export-report" aria-labelledby="export-report-title">
      <h2 id="export-report-title" className="export-report__title">
        HSEEP documents
      </h2>
      {gaps.length === 0 && !report.detailsMissing.length ? (
        <p className="export-ready export-ready--ok">
          <CheckCircle2 size={16} aria-hidden /> Every HSEEP document has its content.
        </p>
      ) : (
        <ul className="export-report__list">
          {gaps.map((d) => (
            <li key={d.doc}>
              <strong>{d.label}:</strong> {d.missing.join('; ')}
            </li>
          ))}
          {report.detailsMissing.length > 0 && (
            <li>
              <strong>Blank exercise details</strong> (print as fill-in lines):{' '}
              {report.detailsMissing.join(', ')}.{' '}
              <Link to={`${props.scenarioUrl}?tab=exercise`}>Add exercise details</Link>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function ExportResultView({ result }: { result: ExportJobResult }) {
  return (
    <div className="export-status__done">
      <p>
        Wrote {result.files.length} files to <code>{result.folder}</code>
      </p>
      {result.warnings.length > 0 && (
        <ul className="export-status__warnings">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <div className="row">
        <Button
          size="sm"
          onClick={() => void call('shell:show-item', { path: result.zipPath ?? result.folder })}
        >
          <FolderOpen size={14} aria-hidden /> Show in Finder
        </Button>
      </div>
    </div>
  )
}

function ExportStatus(props: {
  job: ReturnType<typeof useExportJob>['job']
  jobId: string | null
  result: ExportJobResult | null
  onRetry: () => void
}) {
  const { job, result } = props
  if (!job) return null
  const failed = job.status === 'error' || job.status === 'cancelled'
  const running = job.status === 'queued' || job.status === 'running'
  const failure =
    job.status === 'cancelled'
      ? 'Export cancelled. Nothing more was written.'
      : `Export failed: ${errorText(job.error ?? job.message)}`
  return (
    <div className="export-status">
      {!failed && <ProgressBar value={job.progress} label="Export progress" />}
      {!failed && <LiveStatus text={job.message} />}
      {running && props.jobId && <CancelJobButton jobId={props.jobId} label="Cancel export" />}
      <p className={failed ? 'field__error' : 'muted'} role={failed ? 'alert' : undefined}>
        {failed ? failure : job.message}
      </p>
      {failed && (
        <div className="row">
          <Button size="sm" onClick={props.onRetry}>
            <RotateCcw size={14} aria-hidden /> Retry export
          </Button>
        </div>
      )}
      {result && <ExportResultView result={result} />}
    </div>
  )
}

function OutputFolder(props: { outDir: string; running: boolean; onChoose: () => void }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="export-out-dir">
        Output folder
      </label>
      <div className="export-folder">
        <input
          id="export-out-dir"
          className="input"
          value={props.outDir}
          readOnly
          placeholder="No folder chosen"
          aria-describedby="export-out-hint"
        />
        <Button onClick={props.onChoose} disabled={props.running}>
          Choose…
        </Button>
      </div>
      <span id="export-out-hint" className="field__hint">
        Files go into a folder named after the scenario; the ZIP sits next to it.
      </span>
    </div>
  )
}

/** Targets, output folder (remembered per project) and the export job with its result. */
function useExportForm(projectPath: string, scenarioId: string) {
  const [targets, setTargets] = useState<ExportTarget[]>(DEFAULT_TARGETS)
  const [sitmanPlayerEdition, setSitmanPlayerEdition] = useState(false)
  const [outDir, setOutDir] = useState(() => rememberedOutDir(projectPath))
  const [result, setResult] = useState<ExportJobResult | null>(null)
  const [startError, setStartError] = useState('')
  const [sourceCheck, setSourceCheck] = useState(false)
  const onDone = useCallback((e: JobDoneEvent) => setResult(asExportResult(e.result)), [])
  const { jobId, job, running, run } = useExportJob(projectPath, scenarioId, onDone)

  const chooseFolder = async () => {
    const dir = await call('dialog:open-directory', {
      title: 'Choose where to save the export',
      ...(outDir ? { defaultPath: outDir } : {}),
    })
    if (dir) {
      setOutDir(dir)
      rememberOutDir(projectPath, dir)
    }
  }
  const start = async () => {
    setResult(null)
    setStartError('')
    try {
      await run(outDir, targets, {
        sitmanPlayerEdition,
        sourceCheck: sourceCheck && targets.includes('msel_pdf'),
      })
    } catch (err) {
      setStartError(errorText(err))
    }
  }
  const toggle = (id: ExportTarget) => setTargets((t) => toggleTarget(t, id))
  return {
    targets,
    toggle,
    sitmanPlayerEdition,
    setSitmanPlayerEdition,
    sourceCheck,
    setSourceCheck,
    outDir,
    chooseFolder,
    result,
    startError,
    start,
    jobId,
    job,
    running,
  }
}

function PlayerEditionOption(props: { form: ReturnType<typeof useExportForm> }) {
  const { form } = props
  const enabled = form.targets.includes('sitman_pdf')
  return (
    <label className="export-target export-option">
      <input
        type="checkbox"
        checked={form.sitmanPlayerEdition && enabled}
        disabled={form.running || !enabled}
        onChange={(e) => form.setSitmanPlayerEdition(e.target.checked)}
        aria-describedby="export-hint-sitman-player"
      />
      <span className="export-target__text">
        <span className="export-target__label">Also write the SitMan player edition</span>
        <span id="export-hint-sitman-player" className="export-target__hint">
          Module 1 in full, later modules as questions only; goes into players/ of the ZIP. Leave
          off when players should not see the modules ahead of play.
        </span>
      </span>
    </label>
  )
}

function ExportForm(props: {
  form: ReturnType<typeof useExportForm>
  readiness: Readiness | undefined
  completeness: { data: CompletenessReport | undefined; error: unknown }
  scenarioUrl: string
}) {
  const { form } = props
  const { running, targets } = form
  return (
    <form
      className="export-form"
      aria-label="Export options"
      onSubmit={(e) => {
        e.preventDefault()
        void form.start()
      }}
    >
      <TargetGroup
        legend="HSEEP set"
        options={HSEEP_TARGETS}
        {...{ selected: targets, onToggle: form.toggle, disabled: running }}
      >
        <PlayerEditionOption form={form} />
      </TargetGroup>
      <TargetGroup
        legend="Classroom set (PDF)"
        options={DOCUMENT_TARGETS}
        {...{ selected: targets, onToggle: form.toggle, disabled: running }}
      />
      <label className="export-target">
        <input
          type="checkbox"
          checked={form.sourceCheck}
          disabled={running || !targets.includes('msel_pdf')}
          onChange={(e) => form.setSourceCheck(e.target.checked)}
          aria-describedby="export-hint-source-check"
        />
        <span className="export-target__text">
          <span className="export-target__label">Add a Source check column to the MSEL</span>
          <span id="export-hint-source-check" className="export-target__hint">
            Grounded, Needs review or Unsupported for each row. The MSEL is controller material;
            player documents never show it.
          </span>
        </span>
      </label>
      <TargetGroup
        legend="Files"
        options={FILE_TARGETS}
        {...{ selected: targets, onToggle: form.toggle, disabled: running }}
      />
      <div className="export-actions" role="group" aria-label="Export">
        <ReadinessSummary readiness={props.readiness} scenarioUrl={props.scenarioUrl} />
        <CompletenessSummary
          report={props.completeness.data}
          error={props.completeness.error}
          scenarioUrl={props.scenarioUrl}
        />
        <OutputFolder
          outDir={form.outDir}
          running={running}
          onChoose={() => void form.chooseFolder()}
        />
        {form.startError && (
          <p className="field__error" role="alert">
            {form.startError}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={running || !form.outDir || !targets.length}
        >
          {running ? 'Exporting…' : 'Export'}
        </Button>
        <ExportStatus
          job={form.job}
          jobId={form.jobId}
          result={form.result}
          onRetry={() => void form.start()}
        />
      </div>
    </form>
  )
}

export default function ExportPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  const scenario = useIpcQuery(
    'scenarios:get',
    { projectPath, scenarioId },
    { enabled: !!scenarioId },
  )
  const form = useExportForm(projectPath, scenarioId)
  const { readiness } = useReadiness(projectPath, scenario.data)
  const completeness = useIpcQuery(
    'export:completeness',
    { projectPath, scenarioId },
    { enabled: !!scenarioId },
  )
  const scenarioUrl = `/p/${projectKey(projectPath)}/scenarios/${scenarioId}`

  return (
    <div className="page page--wide export-page">
      <Link to={scenarioUrl} className="back-link">
        <ArrowLeft size={14} aria-hidden /> Back to scenario
      </Link>
      <PageHeader
        eyebrow="Export"
        title={scenario.data?.title ?? 'Loading…'}
        description="Print-ready PDFs, named media files and a distribution package for the exercise."
      />
      <div className="export-layout">
        <ExportForm
          form={form}
          readiness={readiness}
          completeness={{ data: completeness.data, error: completeness.error }}
          scenarioUrl={scenarioUrl}
        />
        {scenarioId && <Preview projectPath={projectPath} scenarioId={scenarioId} />}
      </div>
    </div>
  )
}
