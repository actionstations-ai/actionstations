// Settings › Speech to text (#425): the built-in Whisper models for hot wash transcription,
// with size, speed and languages, and Download / Delete. A download starts only on a click;
// it is the only network call transcription makes (pinned files, each hash-checked).
import { useJobsStore, isRunning, trackJob } from '../../state/jobs'
import type { SpeechModelView } from '@shared/ipc'
import { CancelJobButton } from '../../components/CancelJobButton'
import { toast } from '../../components/toast-store'
import { Badge, Button, ProgressBar } from '../../components/ui'
import { call } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { formatBytes } from '../facilitate/recorder-model'

const refresh = () => void queryClient.invalidateQueries({ queryKey: ['providers:speech-models'] })

function useDownloadJob(name: string) {
  return useJobsStore((s) =>
    Object.values(s.jobs).find(
      (j) =>
        j.kind === 'model-pull' &&
        isRunning(j) &&
        (j.payload as { model?: string; kind?: string } | undefined)?.model === name,
    ),
  )
}

function ModelRow({ m }: { m: SpeechModelView }) {
  const job = useDownloadJob(m.name)
  const download = async () => {
    try {
      const { jobId } = await call('providers:download-speech-model', { model: m.name })
      trackJob(jobId, { kind: 'model-pull', payload: { model: m.name, kind: 'speech' } })
    } catch (err) {
      toast.error(`Could not download ${m.name}`, err)
    }
  }
  const remove = async () => {
    if (!window.confirm(`Delete ${m.name} from this computer?`)) return
    await call('providers:delete-speech-model', { model: m.name }).catch((e: unknown) =>
      toast.error(`Could not delete ${m.name}`, e),
    )
    refresh()
  }
  return (
    <tr>
      <th scope="row">
        <span className="mono">{m.name}</span>{' '}
        {m.recommended && <Badge tone="info">Recommended here</Badge>}
        <br />
        <span className="muted">{m.label}</span>
      </th>
      <td>{formatBytes(m.downloadBytes)}</td>
      <td>{m.speed}</td>
      <td>{m.multilingual ? 'Many languages' : 'English only'}</td>
      <td>
        {job ? (
          <span className="row">
            <ProgressBar value={job.progress} label={`Downloading ${m.name}`} />
            <CancelJobButton jobId={job.id} />
          </span>
        ) : m.downloaded ? (
          <span className="row">
            <Badge tone="ok">Downloaded</Badge>
            <Button size="sm" variant="ghost" onClick={() => void remove()}>
              Delete
            </Button>
          </span>
        ) : (
          <Button size="sm" onClick={() => void download()}>
            Download ({formatBytes(m.downloadBytes)})
          </Button>
        )}
      </td>
    </tr>
  )
}

export function SpeechModelsSection() {
  const models = useIpcQuery('providers:speech-models', undefined)
  return (
    <section className="card stack settings-section" aria-labelledby="speech-heading">
      <h2 id="speech-heading">Speech to text</h2>
      <p className="muted">
        Hot wash recordings are transcribed on this computer with a Whisper model. Download one to
        start; nothing else is sent anywhere. Speeds are rough figures for a recent laptop. To use a
        local whisper.cpp or speaches server instead, add it under Providers and pick it for
        Transcription in Providers › Routing (only servers on this computer are accepted).
      </p>
      {models.error && (
        <p className="field__error">Could not list the models: {models.error.message}</p>
      )}
      {models.data && (
        <table className="table">
          <caption className="sr-only">Speech models</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Download</th>
              <th scope="col">Speed</th>
              <th scope="col">Languages</th>
              <th scope="col">
                <span className="sr-only">Status and actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {models.data.map((m) => (
              <ModelRow key={m.id} m={m} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
