// Hot wash recordings of a scenario (#425): transcribe on this computer, open the transcript,
// import audio recorded elsewhere, delete audio, and the project's recording options.
import { useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { FileAudio, Trash2 } from 'lucide-react'
import type { HotwashListing } from '@shared/ipc'
import type { HotwashRecording, Transcript } from '@shared/schemas/hotwash'
import { CancelJobButton } from '../../components/CancelJobButton'
import { toast } from '../../components/toast-store'
import { Badge, Button, Dialog, ProgressBar } from '../../components/ui'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { isRunning, trackJob, useJobsStore } from '../../state/jobs'
import { projectKey } from '../../state/project'
import { importAudioFile } from './import-audio'
import {
  IMPORT_EXTENSIONS,
  STATUS_TEXT,
  TRANSCRIBE_LANGUAGES,
  formatDuration,
} from './recorder-model'

interface Props {
  projectPath: string
  scenarioId: string
}

/** The running transcribe job for a recording, from the shared jobs store. */
function useTranscribeJob(recordingId: string) {
  return useJobsStore((s) =>
    Object.values(s.jobs).find(
      (j) =>
        j.kind === 'transcribe' &&
        isRunning(j) &&
        (j.payload as { recordingId?: string } | undefined)?.recordingId === recordingId,
    ),
  )
}

function TranscribeForm(props: Props & { rec: HotwashRecording; again: boolean }) {
  const models = useIpcQuery('providers:speech-models', undefined)
  const downloaded = (models.data ?? []).filter((m) => m.downloaded)
  const [model, setModel] = useState('')
  const [language, setLanguage] = useState('en')
  const modelId = useId()
  const langId = useId()
  const chosen = downloaded.find((m) => m.name === model) ?? downloaded.find((m) => m.recommended)
  const multilingual = chosen?.multilingual ?? true
  const start = async () => {
    if (props.again && !window.confirm('Replace the current transcript and its edits?')) return
    try {
      const { jobId } = await call('hotwash:transcribe', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        recordingId: props.rec.id,
        ...(model ? { model } : {}),
        ...(multilingual ? { language } : {}),
        ...(props.again ? { restart: true } : {}),
      })
      trackJob(jobId, {
        kind: 'transcribe',
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        payload: { recordingId: props.rec.id },
      })
    } catch (err) {
      toast.error('Could not start the transcription', err)
    }
  }
  return (
    <div className="row fac-recording__transcribe">
      {downloaded.length > 1 && (
        <>
          <label htmlFor={modelId}>Model</label>
          <select
            id={modelId}
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">Default</option>
            {downloaded.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </>
      )}
      {multilingual && (
        <>
          <label htmlFor={langId}>Language</label>
          <select
            id={langId}
            className="input"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {TRANSCRIBE_LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </>
      )}
      <Button size="sm" variant={props.again ? 'default' : 'primary'} onClick={() => void start()}>
        {props.again ? 'Transcribe again' : 'Transcribe'}
      </Button>
    </div>
  )
}

function RecordingActions(
  props: Props & { rec: HotwashRecording; transcript?: Transcript | undefined; active: boolean },
) {
  const { rec, transcript } = props
  const [confirmDelete, setConfirmDelete] = useState(false)
  const req = { projectPath: props.projectPath, scenarioId: props.scenarioId, recordingId: rec.id }
  const job = useTranscribeJob(rec.id)
  const hasAudio = !!rec.audioPath
  if (props.active) return null
  const remove = async () => {
    setConfirmDelete(false)
    await call('hotwash:delete', req).catch((e: unknown) => toast.error('Could not delete', e))
  }
  const deleteAudio = async () => {
    if (!window.confirm('Delete the audio of this recording? The transcript is kept.')) return
    await call('hotwash:delete-audio', req).catch((e: unknown) =>
      toast.error('Could not delete the audio', e),
    )
  }
  return (
    <div className="fac-recording__actions">
      {job ? (
        <div className="fac-recording__progress">
          <ProgressBar value={job.progress} label={`Transcribing ${rec.title}`} />
          <span className="muted">{job.message}</span>
          <CancelJobButton jobId={job.id} />
        </div>
      ) : (
        hasAudio && <TranscribeForm {...props} again={!!transcript?.complete} />
      )}
      {transcript && (
        <Link
          className="btn btn--sm"
          to={`/p/${projectKey(props.projectPath)}/scenarios/${props.scenarioId}/hotwash/${rec.id}`}
        >
          {transcript.complete ? 'Open transcript' : 'Open partial transcript'}
        </Link>
      )}
      {hasAudio && !job && (
        <Button size="sm" variant="ghost" onClick={() => void deleteAudio()}>
          Delete audio
        </Button>
      )}
      {!job && (
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={12} aria-hidden /> Delete recording
        </Button>
      )}
      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${rec.title}"?`}
        description="The audio and the transcript, with its quotes and edits, are removed from the project."
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  )
}

function RecordingItem(
  props: Props & { rec: HotwashRecording; transcript?: Transcript | undefined; active: boolean },
) {
  const { rec, transcript } = props
  const started = new Date(rec.startedAt)
  const status = props.active ? 'recording' : rec.status
  return (
    <li className="fac-recording">
      <p className="fac-recording__head">
        <strong>{rec.title}</strong>{' '}
        <span className="muted">
          {started.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
          {formatDuration(rec.durationSec)}
          {rec.source === 'import' && rec.importedFrom
            ? ` · imported from ${rec.importedFrom}`
            : ''}
        </span>{' '}
        <Badge tone={status === 'error' ? 'error' : status === 'transcribed' ? 'ok' : 'neutral'}>
          {STATUS_TEXT[status] ?? status}
        </Badge>
        {!rec.audioPath && !props.active && <Badge>Audio deleted</Badge>}
      </p>
      {transcript && (
        <p className="muted">
          {transcript.segments.length} segments, {transcript.segments.filter((s) => s.quote).length}{' '}
          quotes · {transcript.model}
        </p>
      )}
      {rec.status === 'error' && rec.error && <p className="field__error">{rec.error}</p>}
      <RecordingActions {...props} />
    </li>
  )
}

function Options(props: Props & { settings: HotwashListing['settings'] }) {
  const save = (patch: Partial<HotwashListing['settings']>) =>
    call('hotwash:settings-save', { projectPath: props.projectPath, patch }).catch((e: unknown) =>
      toast.error('Could not save the setting', e),
    )
  return (
    <fieldset className="fac-recording__options">
      <legend>Recording options for this project</legend>
      <label className="row">
        <input
          type="checkbox"
          checked={props.settings.keepAudio}
          onChange={(e) => void save({ keepAudio: e.target.checked })}
        />
        Keep the audio after its transcript is saved
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={props.settings.showRecordingNotice}
          onChange={(e) => void save({ showRecordingNotice: e.target.checked })}
        />
        Show “This discussion is being recorded” on the presentation screen
      </label>
    </fieldset>
  )
}

function ImportButton(props: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | undefined>(undefined)
  const onFile = async (file: File | undefined) => {
    if (!file) return
    setProgress(0)
    try {
      await importAudioFile(file, props, setProgress)
      toast.success(`Imported ${file.name}`)
    } catch (err) {
      toast.error('Could not import the audio', err)
    } finally {
      setProgress(undefined)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <span className="row">
      <input
        ref={input}
        type="file"
        accept={IMPORT_EXTENSIONS.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <Button size="sm" onClick={() => input.current?.click()} disabled={progress !== undefined}>
        <FileAudio size={14} aria-hidden />{' '}
        {progress === undefined ? 'Import audio…' : 'Importing…'}
      </Button>
      {progress !== undefined && <ProgressBar value={progress} label="Importing audio" />}
    </span>
  )
}

/** The Recordings section of the Hot wash panel. */
export function HotwashRecordings(props: Props) {
  const listing = useIpcQuery('hotwash:list', props)
  const data = listing.data
  const byRecording = new Map((data?.transcripts ?? []).map((t) => [t.recordingId, t]))
  return (
    <section aria-labelledby="fac-hw-recordings">
      <h2 id="fac-hw-recordings">Recordings</h2>
      <p className="muted">
        Record the discussion with Record hot wash above, or import audio recorded on another
        device. Transcription runs on this computer; nothing is uploaded.
      </p>
      <ImportButton {...props} />
      {listing.error && (
        <p className="field__error" role="alert">
          Could not load the recordings: {listing.error.message}
        </p>
      )}
      {data && data.recordings.length === 0 && <p className="muted">No recordings yet.</p>}
      {data && data.recordings.length > 0 && (
        <ul className="fac-recordings">
          {data.recordings.map((rec) => (
            <RecordingItem
              key={rec.id}
              {...props}
              rec={rec}
              transcript={byRecording.get(rec.id)}
              active={data.activeRecordingId === rec.id}
            />
          ))}
        </ul>
      )}
      {data && <Options {...props} settings={data.settings} />}
    </section>
  )
}
