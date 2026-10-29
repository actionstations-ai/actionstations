// Hot wash recording, transcripts and speech models (#425, spec 0425 §6).
import { promises as fs } from 'node:fs'
import { totalmem } from 'node:os'
import type { HotwashListing, MicArmResult } from '@shared/ipc'
import { defineHandlers } from '../registry'
import { emit } from '../../lib/events'
import { AppError } from '../../lib/errors'
import { safeJoin } from '../../lib/fs'
import { nowIso } from '../../lib/ids'
import { jobs } from '../../jobs/manager'
import { requireProject } from '../../project/guard'
import { transcriptsForAar } from '../../hotwash/aar'
import { applyEditorSave, applyRedaction } from '../../hotwash/edit'
import { armMicrophone, disarmMicrophone } from '../../hotwash/permissions'
import {
  activeMicrophone,
  appendChunk,
  ensureAudioGitignore,
  isActive,
  pauseRecording,
  recoverRecordings,
  resumeRecording,
  startRecording,
  stopRecording,
} from '../../hotwash/recorder'
import {
  deleteAudio,
  deleteRecording,
  hotwashSettings,
  listHotwash,
  saveHotwashSettings,
  updateTranscript,
} from '../../hotwash/store'
import { startTranscription } from '../../hotwash/transcribe'
import {
  downloadWhisperModel,
  isWhisperDownloaded,
  speechModelsDir,
} from '../../providers/speech/local-whisper/provider'
import {
  WHISPER_MODELS,
  defaultWhisperModel,
  findWhisperModel,
} from '../../providers/speech/local-whisper/models'

const changed = (root: string, scenarioId: string) =>
  emit('project:changed', { path: root, what: 'hotwash', scenarioId })

/** macOS keeps its own microphone switch per app; ask it before the first recording. */
async function macMicrophoneAccess(): Promise<MicArmResult['access']> {
  if (process.platform !== 'darwin') return 'granted'
  const { app, systemPreferences } = await import('electron')
  // e2e (unpackaged, fake microphone): no real device, so no system prompt to wait for.
  if (!app.isPackaged && process.env.TTX_FAKE_MEDIA === '1') return 'granted'
  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'not-determined')
    return (await systemPreferences.askForMediaAccess('microphone')) ? 'granted' : 'denied'
  return status
}

async function freeBytes(root: string): Promise<number | undefined> {
  try {
    const s = await fs.statfs(root)
    return s.bavail * s.bsize
  } catch {
    return undefined
  }
}

function refuseWhileRecording(root: string, scenarioId: string, recordingId: string): void {
  if (isActive(root, scenarioId, recordingId))
    throw new AppError('CONFLICT', 'Stop the recording first.')
}

function requireSpeechModel(name: string) {
  const model = findWhisperModel(name)
  if (!model) throw new AppError('VALIDATION', `Unknown speech model "${name}"`)
  return model
}

async function announce(root: string, recording: boolean): Promise<void> {
  const notice = recording ? (await hotwashSettings(root)).showRecordingNotice : false
  emit('hotwash:recording', { recording, notice })
}

export default defineHandlers({
  'hotwash:mic-arm': async () => {
    const access = await macMicrophoneAccess()
    if (access === 'granted') armMicrophone()
    return { access }
  },

  'hotwash:record-start': async (req) => {
    const root = await requireProject(req.projectPath)
    disarmMicrophone()
    await ensureAudioGitignore(root)
    const rec = await startRecording({
      root,
      scenarioId: req.scenarioId,
      source: 'microphone',
      consentConfirmedAt: nowIso(),
      ...(req.title ? { title: req.title } : {}),
      ...(req.exerciseMin !== undefined ? { exerciseMin: req.exerciseMin } : {}),
      ...(req.device ? { device: req.device } : {}),
    })
    await announce(root, true)
    changed(root, req.scenarioId)
    return rec
  },

  'hotwash:import-start': async (req) => {
    const root = await requireProject(req.projectPath)
    await ensureAudioGitignore(root)
    const rec = await startRecording({
      root,
      scenarioId: req.scenarioId,
      source: 'import',
      // Only the file's own name is kept, never the folder it came from.
      importedFrom: req.name.split(/[\\/]/).pop()!.slice(0, 260),
      title: req.name
        .split(/[\\/]/)
        .pop()!
        .replace(/\.[^.]+$/, ''),
    })
    changed(root, req.scenarioId)
    return rec
  },

  'hotwash:append': async (req) => {
    const root = await requireProject(req.projectPath)
    return appendChunk(root, req.scenarioId, req.recordingId, req.seq, req.pcm)
  },

  'hotwash:record-pause': async (req) => {
    const root = await requireProject(req.projectPath)
    const rec = await pauseRecording(root, req.scenarioId, req.recordingId)
    changed(root, req.scenarioId)
    return rec
  },

  'hotwash:record-resume': async (req) => {
    const root = await requireProject(req.projectPath)
    const rec = await resumeRecording(root, req.scenarioId, req.recordingId)
    changed(root, req.scenarioId)
    return rec
  },

  'hotwash:record-stop': async (req) => {
    const root = await requireProject(req.projectPath)
    const rec = await stopRecording(root, req.scenarioId, req.recordingId)
    if (rec.source === 'microphone') await announce(root, false)
    changed(root, req.scenarioId)
    return rec
  },

  'hotwash:list': async (req): Promise<HotwashListing> => {
    const root = await requireProject(req.projectPath)
    await recoverRecordings(root, req.scenarioId)
    const listing = await listHotwash(root, req.scenarioId)
    const active = activeMicrophone()
    const free = await freeBytes(root)
    return {
      ...listing,
      settings: await hotwashSettings(root),
      ...(free !== undefined ? { freeBytes: free } : {}),
      ...(active && active.root === root && active.scenarioId === req.scenarioId
        ? { activeRecordingId: active.id }
        : {}),
    }
  },

  'hotwash:transcribe': async (req) => {
    const root = await requireProject(req.projectPath)
    return startTranscription(root, req.scenarioId, req.recordingId, {
      ...(req.model ? { model: req.model } : {}),
      ...(req.language ? { language: req.language } : {}),
      ...(req.restart ? { restart: true } : {}),
    })
  },

  'hotwash:transcript-save': async (req) => {
    const root = await requireProject(req.projectPath)
    const t = await updateTranscript(root, req.scenarioId, req.recordingId, (cur) =>
      applyEditorSave(cur, req.transcript, req.revision, nowIso()),
    )
    changed(root, req.scenarioId)
    return t
  },

  'hotwash:redact': async (req) => {
    const root = await requireProject(req.projectPath)
    const t = await updateTranscript(root, req.scenarioId, req.recordingId, (cur) =>
      applyRedaction(cur, req.segmentId, nowIso()),
    )
    changed(root, req.scenarioId)
    return t
  },

  'hotwash:delete-audio': async (req) => {
    const root = await requireProject(req.projectPath)
    refuseWhileRecording(root, req.scenarioId, req.recordingId)
    const rec = await deleteAudio(root, req.scenarioId, req.recordingId, nowIso())
    changed(root, req.scenarioId)
    return rec
  },

  'hotwash:delete': async (req) => {
    const root = await requireProject(req.projectPath)
    refuseWhileRecording(root, req.scenarioId, req.recordingId)
    await deleteRecording(root, req.scenarioId, req.recordingId)
    changed(root, req.scenarioId)
  },

  'hotwash:transcripts': async (req) => {
    const root = await requireProject(req.projectPath)
    return transcriptsForAar(root, req.scenarioId, req.quotesOnly)
  },

  'hotwash:settings-save': async (req) => {
    const root = await requireProject(req.projectPath)
    return saveHotwashSettings(root, req.patch)
  },

  'hotwash:recording-status': async () => {
    const active = activeMicrophone()
    if (!active) return { recording: false, notice: false }
    return { recording: true, notice: (await hotwashSettings(active.root)).showRecordingNotice }
  },

  'providers:speech-models': async () => {
    const recommended = defaultWhisperModel(totalmem())
    return WHISPER_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      label: m.label,
      params: m.params,
      downloadBytes: m.downloadBytes,
      speed: m.speed,
      multilingual: m.multilingual,
      downloaded: isWhisperDownloaded(m),
      recommended: m.id === recommended.id,
    }))
  },

  'providers:download-speech-model': async (req) => {
    const model = requireSpeechModel(req.model)
    const job = jobs.start(
      'model-pull',
      async (ctx) => {
        ctx.progress(0, `Downloading ${model.name}`)
        const mb = (n: number): string => (n / 1e6).toFixed(1)
        await downloadWhisperModel(model, {
          signal: ctx.signal,
          onProgress: (p) =>
            ctx.progress(
              p.progress,
              `${model.name}: ${mb(p.loadedBytes)} / ${mb(p.totalBytes)} MB`,
            ),
        })
        ctx.log(`Downloaded ${model.name}`)
        return { model: model.name }
      },
      { payload: { model: model.name, kind: 'speech' } },
    )
    return { jobId: job.id }
  },

  'providers:delete-speech-model': async (req) => {
    const model = requireSpeechModel(req.model)
    await fs.rm(safeJoin(speechModelsDir(), ...model.id.split('/')), {
      recursive: true,
      force: true,
    })
  },
})
