import { Tabs } from 'radix-ui'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { ExportTarget } from '@shared/ipc'
import type { JobDoneEvent } from '@shared/schemas/job'
import { Button, PageHeader, ProgressBar } from '../../components/ui'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { useJob } from '../generate/use-job'
import {
  asExportResult,
  DEFAULT_TARGETS,
  DOCUMENT_TARGETS,
  FILE_TARGETS,
  PREVIEW_DOCS,
  rememberOutDir,
  rememberedOutDir,
  toggleTarget,
  type ExportJobResult,
  type PreviewDoc,
  type TargetOption,
} from './targets'
import './export.css'

function TargetGroup(props: {
  legend: string
  options: TargetOption[]
  selected: ExportTarget[]
  onToggle: (id: ExportTarget) => void
  disabled: boolean
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
      </Tabs.Root>
      <div className="export-preview__frame" aria-busy={preview.isFetching}>
        {preview.isError && (
          <p className="field__error" role="alert">
            Preview failed: {preview.error.message}
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
    </section>
  )
}

function ExportStatus(props: { job: ReturnType<typeof useJob>; result: ExportJobResult | null }) {
  const { job, result } = props
  if (!job) return null
  const failed = job.status === 'error' || job.status === 'cancelled'
  return (
    <div className="export-status" aria-live="polite">
      {!failed && <ProgressBar value={job.progress} label="Export progress" />}
      <p className={failed ? 'field__error' : 'muted'} role={failed ? 'alert' : undefined}>
        {failed ? `Export failed: ${job.error ?? job.message}` : job.message}
      </p>
      {result && (
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
              onClick={() =>
                void call('shell:show-item', { path: result.zipPath ?? result.folder })
              }
            >
              <FolderOpen size={14} aria-hidden /> Show in Finder
            </Button>
          </div>
        </div>
      )}
    </div>
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
  const [targets, setTargets] = useState<ExportTarget[]>(DEFAULT_TARGETS)
  const [outDir, setOutDir] = useState(rememberedOutDir)
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<ExportJobResult | null>(null)
  const [startError, setStartError] = useState('')
  const onDone = useCallback((e: JobDoneEvent) => setResult(asExportResult(e.result)), [])
  const job = useJob(jobId, onDone)
  const running = job?.status === 'queued' || job?.status === 'running'

  const chooseFolder = async () => {
    const dir = await call('dialog:open-directory', {
      title: 'Choose where to save the export',
      ...(outDir ? { defaultPath: outDir } : {}),
    })
    if (dir) {
      setOutDir(dir)
      rememberOutDir(dir)
    }
  }
  const start = async () => {
    setResult(null)
    setStartError('')
    try {
      const { jobId: id } = await call('export:run', { projectPath, scenarioId, outDir, targets })
      setJobId(id)
    } catch (err) {
      setStartError((err as Error).message)
    }
  }
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
        <form
          className="export-form"
          aria-label="Export options"
          onSubmit={(e) => {
            e.preventDefault()
            void start()
          }}
        >
          <TargetGroup
            legend="Documents (PDF)"
            options={DOCUMENT_TARGETS}
            selected={targets}
            onToggle={(id) => setTargets((t) => toggleTarget(t, id))}
            disabled={running}
          />
          <TargetGroup
            legend="Files"
            options={FILE_TARGETS}
            selected={targets}
            onToggle={(id) => setTargets((t) => toggleTarget(t, id))}
            disabled={running}
          />
          <div className="field">
            <label className="field__label" htmlFor="export-out-dir">
              Output folder
            </label>
            <div className="export-folder">
              <input
                id="export-out-dir"
                className="input"
                value={outDir}
                readOnly
                placeholder="No folder chosen"
                aria-describedby="export-out-hint"
              />
              <Button onClick={() => void chooseFolder()} disabled={running}>
                Choose…
              </Button>
            </div>
            <span id="export-out-hint" className="field__hint">
              Files go into a folder named after the scenario; the ZIP sits next to it.
            </span>
          </div>
          {startError && (
            <p className="field__error" role="alert">
              {startError}
            </p>
          )}
          <div className="row">
            <Button
              type="submit"
              variant="primary"
              disabled={running || !outDir || !targets.length}
            >
              {running ? 'Exporting…' : 'Export'}
            </Button>
          </div>
          <ExportStatus job={job} result={result} />
        </form>
        {scenarioId && <Preview projectPath={projectPath} scenarioId={scenarioId} />}
      </div>
    </div>
  )
}
