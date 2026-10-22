// Step 4: how documents are indexed. The built-in offline embedder is the default; the local
// bge-small model is better on paraphrase but is a one-time download the user must agree to.
import { useEffect, useRef, useState } from 'react'
import type { JobProgressEvent } from '@shared/schemas/job'
import { Badge, Button, ProgressBar } from '../../../components/ui'
import { call, subscribe } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import { StepLayout, type StepNav } from '../StepLayout'
import { useAction } from '../use-setup'
import { LOCAL_EMBED_MODEL, LOCAL_EMBED_SIZE } from '../wizard-state'

type Mode = 'hash' | 'local-onnx'
type Download =
  | { state: 'idle' }
  | { state: 'running'; progress: number; message: string }
  | { state: 'error'; message: string }
  | { state: 'done' }

/** Start the model download job and follow its progress events. */
function useModelDownload(onFinished: () => void) {
  const [download, setDownload] = useState<Download>({ state: 'idle' })
  const jobId = useRef<string | null>(null)
  const early = useRef<JobProgressEvent[]>([])
  const finished = useRef(onFinished)
  useEffect(() => {
    finished.current = onFinished
  }, [onFinished])
  useEffect(() => {
    const offProgress = subscribe('job:progress', (e) => {
      if (!jobId.current) early.current.push(e)
      else if (e.jobId === jobId.current)
        setDownload({ state: 'running', progress: e.progress, message: e.message })
    })
    const offDone = subscribe('job:done', (e) => {
      if (e.jobId !== jobId.current) return
      if (e.status === 'done') {
        setDownload({ state: 'done' })
        finished.current()
      } else setDownload({ state: 'error', message: e.error ?? `Download ${e.status}` })
    })
    return () => {
      offProgress()
      offDone()
    }
  }, [])
  const start = async () => {
    setDownload({ state: 'running', progress: 0, message: 'Starting download…' })
    try {
      const { jobId: id } = await call('embeddings:download-model')
      jobId.current = id
      const last = early.current.filter((e) => e.jobId === id).pop()
      if (last) setDownload({ state: 'running', progress: last.progress, message: last.message })
      early.current = []
    } catch (err) {
      setDownload({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { download, start }
}

const selectLocalModel = () =>
  call('settings:update', { embeddings: { mode: 'local-onnx', model: LOCAL_EMBED_MODEL } }).then(
    () => queryClient.invalidateQueries({ queryKey: ['embeddings:status'] }),
  )

function ModeOption(props: {
  value: Mode
  checked: boolean
  onSelect: (m: Mode) => void
  title: string
  body: string
}) {
  return (
    <label className="wizard-radio wizard-radio--card">
      <input
        type="radio"
        name="embedding-mode"
        checked={props.checked}
        onChange={() => props.onSelect(props.value)}
      />
      <span className="stack wizard-radio__body">
        <strong>{props.title}</strong>
        <span className="muted">{props.body}</span>
      </span>
    </label>
  )
}

function DownloadPanel(props: { download: Download; downloaded: boolean; onStart: () => void }) {
  const d = props.download
  if (props.downloaded || d.state === 'done')
    return (
      <p>
        <Badge tone="ok">Downloaded</Badge> The model is on this computer and will be used for new
        documents.
      </p>
    )
  if (d.state === 'running')
    return (
      <div className="stack" aria-live="polite">
        <ProgressBar value={d.progress} label="Model download" />
        <span className="muted">{d.message}</span>
      </div>
    )
  return (
    <div className="stack">
      <p>
        This downloads <span className="mono">{LOCAL_EMBED_MODEL}</span> ({LOCAL_EMBED_SIZE}) once
        from Hugging Face. After that it runs offline.
      </p>
      {d.state === 'error' && (
        <p className="field__error" role="alert">
          {d.message}
        </p>
      )}
      <div className="row">
        <Button variant="primary" onClick={props.onStart}>
          Download {LOCAL_EMBED_SIZE} model
        </Button>
      </div>
    </div>
  )
}

export function SearchStep({ onBack, onNext }: StepNav) {
  const status = useIpcQuery('embeddings:status', undefined)
  const [mode, setMode] = useState<Mode | null>(null)
  const current: Mode = mode ?? (status.data?.mode === 'local-onnx' ? 'local-onnx' : 'hash')
  const save = useAction()
  const { download, start } = useModelDownload(() => void selectLocalModel())
  const downloaded = !!status.data?.downloaded
  const running = download.state === 'running'
  const needsDownload = current === 'local-onnx' && !downloaded && download.state !== 'done'
  const next = async () => {
    const ok = await save.run(async () => {
      if (current === 'hash') await call('settings:update', { embeddings: { mode: 'hash' } })
      else await selectLocalModel()
    })
    if (ok) onNext()
  }
  return (
    <StepLayout
      title="Search quality"
      intro={<p>How your documents are indexed so the generator can find and cite them.</p>}
      {...(onBack ? { onBack } : {})}
      onNext={() => void next()}
      busy={save.busy}
      nextDisabled={running || needsDownload}
    >
      <div role="radiogroup" aria-label="Embedding mode" className="wizard-radios">
        <ModeOption
          value="hash"
          checked={current === 'hash'}
          onSelect={setMode}
          title="Fast and offline (recommended to start)"
          body="Built in, no download. Matches on wording; good for plans that use consistent terms."
        />
        <ModeOption
          value="local-onnx"
          checked={current === 'local-onnx'}
          onSelect={setMode}
          title={`Better search: local model (${LOCAL_EMBED_SIZE} download)`}
          body="Understands paraphrase, so a question about a “bag system outage” finds the BHS failure procedure. Runs on this computer."
        />
      </div>
      {current === 'local-onnx' && (
        <div className="card stack">
          <DownloadPanel download={download} downloaded={downloaded} onStart={() => void start()} />
        </div>
      )}
      {running && <p className="muted">Continue becomes available when the download finishes.</p>}
      {save.error && (
        <p className="field__error" role="alert">
          {save.error}
        </p>
      )}
    </StepLayout>
  )
}
