# Spec 0425: Private hot wash transcription for the AAR

Issue: #425 · Milestone: 0.7.0 · Status: Implemented (see Implementation notes) · Depends on: — · Related: #419 (AAR/IP draft), #417 (session log), #415 (hot wash from devices), #433 (preview and redact what goes to cloud models), #429 (SimCell voice calls)

## Summary

The facilitator records the hot wash in Facilitate, and Action Stations transcribes it on
this computer with a local Whisper model. The transcript has timestamps, can be corrected,
and lets the facilitator mark quotes. The AAR/IP draft (#419) cites those quotes. The audio
and the transcript stay in the project folder. Nothing is uploaded, and the model download is
the only network call. It runs only when the user clicks.

## Requirements

### User stories

- As a facilitator, I want to record the hot wash with one button, so that I can lead the
  discussion without taking notes at the same time.
- As a facilitator, I want the recording transcribed on my laptop, so that I can tell
  participants that their words do not leave the room.
- As an exercise planner, I want quotes with timestamps in the AAR draft, so that each
  strength and area for improvement is backed by what participants said.
- As a facilitator with an old laptop, I want to choose a smaller model, so that
  transcription finishes before I write the AAR.
- As a facilitator who recorded on a phone, I want to import that audio file, so that I get
  the same transcript.

### Functional requirements

- **FR-1** New provider task `transcribe` in `PROVIDER_TASKS` (`src/shared/schemas/provider.ts`).
  All speech-to-text goes through a new `SpeechToTextProvider` interface in
  `src/main/providers/types.ts`, so Project rules 4 holds.
- **FR-2** A built-in adapter `local-whisper` runs Whisper ONNX models through
  `@huggingface/transformers` in an Electron `utilityProcess`. This is the same runtime, worker
  pattern and download code as local embeddings (ADR-0005). It works on macOS (arm64),
  Windows (x64) and Linux (x64) without new native modules.
- **FR-3** Optional second adapter: `openai-compatible` gains a `transcribe` capability that
  calls `POST {baseUrl}/audio/transcriptions` (whisper.cpp `whisper-server`, speaches,
  mlx-audio). For the `transcribe` task, the app refuses any provider whose `baseUrl` host
  is not a loopback address (`127.0.0.0/8`, `::1`, `localhost`). It returns `AppError('PROVIDER',
'Transcription runs only on this computer…')`.
- **FR-4** Model choice in Settings › Speech to text, with size, download size, expected speed and
  language support per row. The models are `whisper-tiny.en`, `whisper-base` (default), `whisper-small`
  and `whisper-large-v3-turbo`. Each one downloads only when the user clicks **Download**.
  Downloads are pinned to a Hugging Face commit and checked against sha256 (same mechanism as
  `MODEL_PINS` in `src/main/providers/embedding/model-files.ts`). The download is a
  `model-pull` job with progress and Cancel.
- **FR-5** Facilitate gets a **Record hot wash** control in the hot wash panel
  (`HotWashPanel.tsx`), with Start, Pause, Resume and Stop. It also shows the elapsed time, a
  live input level meter and the selected microphone. Recording can also start before ENDEX,
  for example to capture a mid-exercise discussion. It is not tied to the exercise clock.
- **FR-6** Before the first recording in a scenario, a consent dialog asks the facilitator to
  confirm that everyone present was told about the recording. The confirmation is stored
  with the recording (`consentConfirmedAt`). An optional line, "This discussion is being
  recorded", shows on the presentation window while recording runs (default on).
- **FR-7** Audio is written continuously to the project as 16 kHz mono 16-bit PCM. After a crash
  or quit, the recording is recovered up to the last second written, and the app offers
  it at the next open.
- **FR-8** **Import audio** accepts `.wav .mp3 .m4a .ogg .webm` (≤ 4 h, ≤ 1 GB). The file is decoded
  in the renderer (`AudioContext.decodeAudioData`) and resampled to 16 kHz mono with
  `OfflineAudioContext`, then stored like a recording. No ffmpeg is needed.
- **FR-9** **Transcribe** starts a `transcribe` job: 30 s windows with overlap, segment
  timestamps, progress per window, Cancel, and resume from the last finished window after a
  restart. Language is automatic by default, or the user can set it (English models skip
  detection).
- **FR-10** The transcript editor lists segments with start time (recording time and wall
  clock), text and speaker label. The user can play a segment's audio, edit its text, merge
  or split segments, set the speaker from the scenario roles or as free text, and **mark a
  quote**. A quote can be linked to an objective, an MSEL row and, once #421 lands, a Core
  Capability. Edits keep the model output (`originalText`), so the AAR shows edited text and
  the change stays visible.
- **FR-11** Redaction: **Redact** on a segment replaces its text with `[redacted]` and drops its
  quote marks. **Delete audio** removes the recording's audio file and keeps the transcript.
  Both actions are logged in the transcript (`redactions[]`, no content).
- **FR-12** Retention setting per project: keep audio until deleted (default), or delete audio
  automatically once its transcript is saved. Stop asks once per recording when the setting is
  unset.
- **FR-13** AAR input: `hotwash:transcripts` returns the transcripts and marked quotes for a
  scenario. #419 reads them as an input source that cites `transcript:<id>#<segmentId>`. The
  session log (#417) gets `hotwash.recording` and `hotwash.transcript` entries (ids and times
  only, no text).
- **FR-14** If the AAR draft is routed to a cloud text provider, the AAR screen warns that
  transcript text will be sent to that provider and names it. With #433, the text goes through
  its preview and redaction step.
- **FR-15** Exports: transcripts (Markdown and JSON) are included in the scenario ZIP only when
  **Include hot wash transcript** is ticked (default off). Audio is included only when
  **Include hot wash audio** is ticked (default off, and the size is shown).

### Non-functional requirements

- **NFR-1** Cost: no paid service. The models are MIT-licensed OpenAI Whisper weights in ONNX
  form, and the runtime is already shipped (CONTRIBUTING, Project rules 1).
- **NFR-2** Privacy: audio never leaves the computer (FR-3). The only network call is the
  user-started model download from `huggingface.co` / `*.hf.co` (Project rules 3). No
  transcript text goes into logs, `provider-calls.jsonl` or job payloads, only counts and
  durations.
- **NFR-3** Accessibility: WCAG 2.2 AA. Every recorder control has a text label and a keyboard
  shortcut that does not clash with Facilitate's Space/N/D. The recording state is announced
  through the existing `StatusLine` live region. The level meter has a text equivalent ("Input
  level: good / low / clipping"), and the editor works without a mouse.
- **NFR-4** Performance targets, to be measured in task 2 and recorded in the ADR: `whisper-base`
  transcribes 60 min of audio in ≤ 20 min on an M1 or an 8-core x64 CPU from 2020, with peak
  worker memory ≤ 1.5 GB. `whisper-small` is the recommended accuracy/speed balance on
  16 GB machines. Recording must not drop audio while the clock and presentation window run.
- **NFR-5** Platforms: macOS arm64, Windows x64 and Linux x64 AppImage (the targets in
  `electron-builder.yml`). Microphone access follows each OS's privacy controls (Design §5).
- **NFR-6** Storage: 16 kHz mono PCM is about 115 MB per hour. Facilitate shows the free disk
  space before recording and warns below 1 GB.

### Out of scope

- Live captions while recording; transcription runs after Stop. Revisit with #429.
- Speaker diarization (automatic "who spoke"). Speakers are set by hand (Open question 2).
- Recording from players' devices (#415 covers text contributions).
- Cloud speech-to-text of any kind.
- Translating transcripts (#435).

## Design

### 1. Provider interface (`src/main/providers/types.ts`)

```ts
export interface TranscribeJob {
  /** Absolute path of a 16 kHz mono PCM16 WAV inside the project. */
  audioPath: string
  model?: string
  language?: string // ISO 639-1; undefined = detect
  /** Resume after this many seconds (windows before it are already done). */
  fromSec?: number
  signal?: AbortSignal
}
export interface TranscriptSegmentOut {
  startSec: number
  endSec: number
  text: string
  avgLogProb?: number
}
export interface SpeechToTextProvider {
  readonly id: string
  readonly kind: ProviderKind
  readonly config: ProviderConfig
  listModels(signal?: AbortSignal): Promise<ModelInfo[]> // kind: 'speech'
  health(signal?: AbortSignal): Promise<ProviderHealth>
  transcribe(
    job: TranscribeJob,
    onSegment: (s: TranscriptSegmentOut, progress: number) => void,
  ): Promise<{ language: string; model: string }>
}
// AdapterModule gains: createSpeechToText?: (config, secret) => SpeechToTextProvider
```

- `ProviderKind` gains `'local-whisper'`. `ModelInfo.kind` gains `'speech'`.
- `providers/resolve.ts` gains `resolveSpeechToTextProvider(projectPath)` and an exported
  `isLoopbackUrl(url)` guard for FR-3. The guard runs at resolve time and again in the adapter
  before each request, so an edited `settings.json` cannot route around it.
- `providers/registry.ts` discovers `src/main/providers/speech/local-whisper/adapter.ts`.
- The `mock` adapter gets `createSpeechToText`, which returns fixed segments for tests and e2e
  (`TTX_MOCK_PROVIDERS=1` routes `transcribe` to it).

**Why transformers.js over whisper.cpp.** Both are MIT. whisper.cpp is faster on Apple
Silicon (Metal), but shipping it means a native binary or addon for three platforms. It would
need code signing on macOS (`build/entitlements.mac.plist` already relaxes library
validation) and a Windows build, and it would be a new native dependency to rebuild per
Electron version (ADR-0004). The app already ships `@huggingface/transformers` with
`onnxruntime-node` (CPU only since #401) and already runs it in a crash-isolated
`utilityProcess` with pinned, hash-checked downloads. Whisper through the same path adds no
binary, no new install step and no new trust surface. Users who want Metal speed can run
whisper.cpp's or mlx-audio's server locally and select it through FR-3. Revisit if NFR-4
targets are missed.

### 2. Models (`src/main/providers/speech/local-whisper/models.ts`)

| Id (UI label)                            | Source repo (pinned commit, sha256 per file) | Params | Approx. download (q8 / fp32 encoder) | Languages    |
| ---------------------------------------- | -------------------------------------------- | ------ | ------------------------------------ | ------------ |
| `whisper-tiny.en` (Fastest, English)     | `onnx-community/whisper-tiny.en`             | 39 M   | ~45 MB                               | English      |
| `whisper-base` (Default)                 | `onnx-community/whisper-base`                | 74 M   | ~80 MB                               | multilingual |
| `whisper-small` (Recommended on 16 GB)   | `onnx-community/whisper-small`               | 244 M  | ~260 MB                              | multilingual |
| `whisper-large-v3-turbo` (Most accurate) | `onnx-community/whisper-large-v3-turbo`      | 809 M  | ~850 MB                              | multilingual |

Sizes are estimates. Task 2 measures the real ones and records the pinned revision and hashes
the same way `MODEL_PINS` does. The quantization (`dtype`) per model is chosen in task 2 for
the best word error rate at NFR-4 speed. Files live in `userData/models/<org>/<name>/`, which
is shared with embeddings. `model-files.ts` is generalized: `REQUIRED_FILES` becomes per model
family (embedding vs. speech encoder/decoder files).

### 3. Worker (`src/main/providers/speech/`)

```
speech/
  stt-host.ts       utilityProcess lifecycle (mirror of embedding/embed-host.ts): spawn on demand,
                    one job at a time, kill on cancel, fresh process after a crash
  stt-protocol.ts   zod messages host <-> worker: start, segment, progress, done, error
  stt-worker.ts     loads transformers.js with allowRemoteModels=false, reads the WAV in
                    30 s windows (stride 5 s), runs the 'automatic-speech-recognition' pipeline
                    with return_timestamps: true, posts each segment
  local-whisper/adapter.ts, provider.ts, models.ts
```

The worker reads audio in windows, so memory does not grow with recording length. A crash
fails the job with `AppError('PROVIDER')`. The finished windows are already saved (FR-9), so
**Retry** resumes from there.

### 4. Data model

New zod schemas in `src/shared/schemas/hotwash.ts`. Persisted under
`scenarios/<id>/hotwash/<recordingId>/` (project-relative POSIX paths, `SafeId` ids):

```ts
HotwashRecording = z.looseObject({
  id: SafeId,
  title: z.string().default('Hot wash'),
  source: z.enum(['microphone', 'import']),
  importedFrom: z.string().optional(), // original file name only, no path
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.optional(),
  exerciseMinAtStart: z.number().nonnegative().optional(), // FacilitatorState clock at Start
  durationSec: z.number().nonnegative().default(0),
  audioPath: RelPath.optional(), // .../audio.wav; absent after Delete audio
  sampleRate: z.literal(16000),
  channels: z.literal(1),
  device: z.string().optional(), // label shown to the user
  consentConfirmedAt: IsoDateTime.optional(),
  pauses: z.array(z.object({ atSec: z.number(), resumedAt: IsoDateTime.optional() })).default([]),
  status: z.enum(['recording', 'recovered', 'ready', 'transcribing', 'transcribed', 'error']),
}) // recording.json

TranscriptSegment = z.object({
  id: SafeId,
  startSec: z.number(),
  endSec: z.number(),
  text: z.string(),
  originalText: z.string(), // model output, never edited
  speaker: z.object({ roleId: Id.optional(), label: z.string() }).optional(),
  quote: z
    .object({
      objectiveIds: z.array(Id).default([]),
      rowIds: z.array(z.string()).default([]),
      capability: z.string().optional(),
      note: z.string().optional(),
    })
    .optional(),
  redacted: z.boolean().default(false),
  lowConfidence: z.boolean().default(false),
})
Transcript = z.looseObject({
  id: SafeId,
  recordingId: SafeId,
  model: z.string(),
  providerId: z.string(),
  language: z.string(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  doneUntilSec: z.number().default(0),
  segments: z.array(TranscriptSegment).default([]),
  redactions: z
    .array(
      z.object({ at: IsoDateTime, segmentId: SafeId.optional(), kind: z.enum(['text', 'audio']) }),
    )
    .default([]),
}) // transcript.json
```

Layout:

```
scenarios/<id>/hotwash/<recordingId>/
  recording.json
  audio.pcm        while recording (append-only); renamed to audio.wav with a header on Stop
  audio.wav
  transcript.json
```

`PROJECT_GITIGNORE` in `project/store.ts` (written by `createProject`) gains `scenarios/*/hotwash/**/audio.*`, so a
project kept in git does not commit voices by accident. `Project` (`src/shared/schemas/project.ts`, a `looseObject`, so older builds keep the field)
gains `hotwash: { deleteAudioAfterTranscript?: boolean, showRecordingNotice: boolean }`, optional. Existing projects get the line appended the first time a recording starts.

### 5. Capture path and permissions

- **Renderer.** `routes/facilitate/use-recorder.ts` calls `getUserMedia({ audio: { deviceId,
channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } })`.
  An `AudioWorkletNode` (`recorder-worklet.ts`, loaded from the app bundle, no `blob:`)
  downsamples to 16 kHz Int16 and posts about 1 s chunks. The hook sends each chunk with
  `hotwash:append` and draws the level meter from the same frames.
- **Main.** `src/main/hotwash/recorder.ts` appends chunks to `audio.pcm` with one serialized
  writer per recording (the same pattern as `facilitator/state.ts`) and `fsync`s every 10 s.
  Stop writes the WAV header (reusing `providers/media/audio-fx/wav.ts`), renames the file and
  updates `recording.json`. When a project opens, `recoverRecordings(root)` turns any leftover
  `audio.pcm` into `status: 'recovered'`.
- **Permission handler.** `src/main/index.ts` today denies every permission. It changes to
  allow exactly one case. The permission must be `media`, `mediaTypes` must equal `['audio']`,
  the requesting frame URL must pass `isAppUrl`, the webContents must be the main window, and
  `hotwash/arm.ts` must hold an armed flag that `hotwash:record-start` set within the last 10 s.
  Everything else stays denied, including the presentation and render windows. The check
  handler answers the same way for `media`, so `enumerateDevices` shows labels only after a
  start.
- **macOS.** `electron-builder.yml` `mac.extendInfo.NSMicrophoneUsageDescription`: "Action
  Stations records the hot wash on this computer when you press Record. Audio is not
  uploaded." `build/entitlements.mac.plist` adds `com.apple.security.device.audio-input`, and its
  header comment is updated. Before the first start, `systemPreferences.askForMediaAccess('microphone')`
  runs. When access is denied, the error explains System Settings › Privacy & Security ›
  Microphone.
- **Windows.** If access is blocked in Settings › Privacy › Microphone, `getUserMedia` fails
  with `NotAllowedError`, and the error says where to allow it.
- **Linux.** PulseAudio/PipeWire through Chromium. The AppImage needs no extra flags. Covered
  by the Docker AppImage smoke test with a null sink.
- **CSP.** `media-src` already allows `ttx-media:` for playback. No CSP change for capture.

### 6. IPC (`src/shared/ipc/hotwash.ts`, new domain file; handlers `src/main/ipc/handlers/hotwash.ts`)

| Channel                                      | Request                                                                         | Response                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| `hotwash:record-start`                       | `{ projectPath, scenarioId, title?, consent: true, exerciseMin? }`              | `HotwashRecording`                         |
| `hotwash:append`                             | `{ projectPath, recordingId, scenarioId, seq: int, pcm: Uint8Array (≤ 64 KB) }` | `{ ok: true }`                             |
| `hotwash:record-pause` / `-resume` / `-stop` | `{ projectPath, scenarioId, recordingId }`                                      | `HotwashRecording`                         |
| `hotwash:import`                             | `{ projectPath, scenarioId, name, pcm chunks via append }`                      | `HotwashRecording`                         |
| `hotwash:list`                               | `{ projectPath, scenarioId }`                                                   | `{ recordings, transcripts }`              |
| `hotwash:transcribe`                         | `{ projectPath, scenarioId, recordingId, model?, language? }`                   | `{ jobId }` (job kind `transcribe`)        |
| `hotwash:transcript-save`                    | `{ projectPath, scenarioId, transcript, revision }`                             | `Transcript` (stale revision → `CONFLICT`) |
| `hotwash:redact`                             | `{ …, segmentId }`                                                              | `Transcript`                               |
| `hotwash:delete-audio` / `hotwash:delete`    | `{ …, recordingId }`                                                            | `void`                                     |
| `hotwash:transcripts`                        | `{ projectPath, scenarioId, quotesOnly?: boolean }`                             | AAR input (FR-13)                          |
| `providers:speech-models`                    | `void`                                                                          | models with downloaded state               |
| `providers:download-speech-model`            | `{ model }`                                                                     | `{ jobId }` (`model-pull`)                 |

`hotwash:append` refuses out-of-order `seq` and recordings that are not `recording`. The
`Uint8Array` is checked with `z.instanceof(Uint8Array)` and the size cap. Push event:
`hotwash:changed` `{ scenarioId }`.

### 7. UI

Hot wash panel (Facilitate), recording:

```
┌ Hot wash ───────────────────────────────────────────────────────────┐
│ ● Recording  00:23:41   Mic: MacBook Pro Microphone ▾   Level ▮▮▮▮▯ good │
│ [ Pause ]  [ Stop ]                    Free space: 41 GB            │
│ Questions | Rubric | Notes | Recordings (2)                         │
└─────────────────────────────────────────────────────────────────────┘
```

Transcript editor (route `/p/:projectKey/scenarios/:scenarioId/hotwash/:recordingId`):

```
┌ Hot wash, 28 Oct 14:05 · whisper-small · English      [Export ▾] ┐
│ ▶ 00:01:12  14:06  Ops Director ▾   "We lost twenty minutes because │
│                                      nobody knew who calls CISA."  │
│              [★ Quote → Objective 2 · I-07]  [Edit] [Redact]       │
│ ▶ 00:01:40  14:06  (speaker) ▾      "The SimCell call helped…"     │
│ …                                                                  │
│ Filter: [All] [Quotes] [Low confidence]        Search [_________]  │
└────────────────────────────────────────────────────────────────────┘
```

Settings › Speech to text: a model table (FR-4) with Download/Delete. It also lists the
loopback servers found by `providers:detect-local` (whisper.cpp server on 8080, speaches on
8000, mlx-audio on 8765) and the routing select for `transcribe`.

### 8. AAR hand-off (#419)

`hotwash:transcripts` returns, per transcript, quote segments with `{ citeKey:
'T<n>', recordingTitle, wallClock, speakerLabel, text, objectiveIds, rowIds, capability }`.
When the full transcript is wanted, it also returns non-redacted segments. The AAR prompt
cites `T<n>` keys the way generation cites `C<n>` chunk keys (`schemas/generation.ts`). Redacted
segments are never returned.

## Security and privacy

| Threat                                                     | Mitigation                                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio sent to a cloud STT endpoint by misconfiguration     | Loopback-only guard at resolve and request time (FR-3). No cloud adapter implements `createSpeechToText`.                                                                               |
| Recording without people knowing                           | Consent confirmation (FR-6), visible recording indicator, optional on-screen notice, nothing records while the app is hidden without the indicator in the window title ("● Recording"). |
| A web page or the presentation window using the microphone | Permission granted only to the main window's app URL, audio only, only while armed (Design §5).                                                                                         |
| Voices committed to git or shared in an export             | `.gitignore` entry, exports exclude audio and transcripts by default (FR-15).                                                                                                           |
| Transcript text sent to a cloud model for the AAR          | Warning naming the provider (FR-14), #433 redaction preview, redacted segments never leave `hotwash:transcripts`.                                                                       |
| Tampered model files                                       | Pinned revision and sha256 per file (FR-4), downloads only from `huggingface.co` / `*.hf.co`.                                                                                           |
| Path escape through `recording.json`                       | Every path through `safeJoin`/`safeJoinReal`; `audioPath` must equal the recording folder's `audio.wav`.                                                                                |
| Disk filling during a long session                         | Free-space check and warning (NFR-6), auto-stop at 4 h with a notice.                                                                                                                   |

## Testing

- **Unit (Vitest):** WAV header writer and PCM recovery (`hotwash/recorder.test.ts`), `isLoopbackUrl`
  incl. `127.1`, `[::1]`, `localhost.example.com` (refused), and IPv4-mapped IPv6. Also schema
  round-trip and forward compatibility (unknown keys survive save), window/stride planning
  and resume from `doneUntilSec`, the permission handler decision table
  (`index.permissions.test.ts`), and the segment merge/split/redact reducers.
- **Contract:** `local-whisper` against a recorded fixture (a 20 s public-domain clip from
  LibriVox, stored with Git LFS, transcribed once and stored as expected segments with a word
  error rate tolerance). `openai-compatible` transcribe against an msw fixture.
- **Live (`LIVE=1`):** real `whisper-base` download and transcription of the fixture.
  `whisper.cpp` server if `TTX_LIVE_STT_URL` is set.
- **Component:** recorder controls, consent dialog, transcript editor keyboard flow
  (happy-dom).
- **e2e (Playwright):** launch with Chromium's `--use-fake-device-for-media-stream` and
  `--use-file-for-fake-audio-capture=<fixture.wav>`, record 5 s, stop, transcribe with the mock
  provider, mark a quote, and check that `hotwash:transcripts` returns it. Close every
  window (no stray app windows).
- **Packaged smoke:** macOS DMG prompts for the microphone (manual checklist in
  `docs/RELEASING.md`), Windows UTM VM, Linux Docker AppImage with a PulseAudio null sink.

## Tasks

1. **Schemas and IPC contracts.** `src/shared/schemas/hotwash.ts`, `src/shared/ipc/hotwash.ts`,
   register in `src/shared/ipc/index.ts`, plus `PROVIDER_TASKS`/`ProviderKind`/`ModelInfo.kind`
   additions in `src/shared/schemas/provider.ts` with tests.
2. **Speech provider plumbing and local-whisper adapter.** `src/main/providers/types.ts`,
   `registry.ts`, `resolve.ts` (`resolveSpeechToTextProvider`, `isLoopbackUrl`),
   `src/main/providers/speech/{stt-host,stt-protocol,stt-worker}.ts`, `speech/local-whisper/*`,
   `mock/adapter.ts`, generalized `embedding/model-files.ts`, contract test and fixture. Measure
   NFR-4 and pin the models. Add ADR `docs/adr/00NN-local-speech-to-text.md`.
3. **openai-compatible transcribe (loopback only).** `src/main/providers/text/openai-compatible/`
   transcribe module, `local-detect.ts` probes, msw contract test.
4. **Recorder in main.** `src/main/hotwash/{recorder,arm,store,recover}.ts`, handlers
   `src/main/ipc/handlers/hotwash.ts`, permission handler change in `src/main/index.ts`,
   `electron-builder.yml` `extendInfo`, `build/entitlements.mac.plist`, `.gitignore` line in
   `project/store.ts` `createProject`.
5. **Recorder UI.** `routes/facilitate/use-recorder.ts`, `recorder-worklet.ts`,
   `RecorderControls.tsx`, consent dialog, `HotWashPanel.tsx` tabs, presentation notice in the
   present route, shortcuts in `use-shortcuts.ts`. Component tests and the fake-device e2e.
6. **Import audio.** Renderer decode/resample (`routes/facilitate/import-audio.ts`) and the
   import flow. Tests with mp3 and m4a fixtures.
7. **Transcribe job and transcript editor.** `jobs` kind `transcribe` with resume, route
   `routes/hotwash/` (editor, playback through `mediaUrl`, quote linking, redaction), plus
   Settings › Speech to text (`routes/settings/`).
8. **AAR and export hand-off.** `hotwash:transcripts`, session log entries (with #417), export
   options in `src/main/export/run.ts` + `zip.ts`, the cloud warning on the AAR screen (with
   #419/#433), and a new guide `docs/guides/facilitate.md` (hot wash recording section; no Facilitate guide exists yet).

## Open questions

1. **Default retention of audio.** Keep until deleted, or delete after transcription?
   _Recommendation:_ keep by default, and ask once at Stop with "Delete audio after
   transcription" pre-selected off. Facilitators often re-check a quote against the audio when
   writing the AAR.
2. **Speaker diarization.** Add a local diarization model (pyannote segmentation ONNX) later?
   _Recommendation:_ not in 0.7.0. Manual speaker labels plus quotes are enough for the AAR.
   Open a follow-up issue once NFR-4 numbers are known.
3. **Default model.** `whisper-base` or `whisper-small`? _Recommendation:_ the default is
   `whisper-base` on machines with < 16 GB RAM and `whisper-small` otherwise (read via
   `setup/hardware.ts`). The user always sees and confirms the download size.
4. **Recording the whole exercise, not only the hot wash.** _Recommendation:_ allowed (FR-5) but
   not promoted. The consent dialog wording covers "this session", and the AAR treats any
   recording as a source.

## Implementation notes (#425)

Where the build differs from the text above, and why:

- **Retention (owner decision, overrides FR-12 and Open question 1):** audio is deleted once its
  transcript is saved, unless the project setting `hotwash.keepAudio` is on. Settings are
  `HotwashSettings { keepAudio, showRecordingNotice }` in `project.json`.
- **Consent (FR-6):** asked before every recording, not only the first, so every
  `consentConfirmedAt` is a fresh confirmation.
- **Channels:** `hotwash:mic-arm` arms the permission before `getUserMedia` (record-start comes
  after the stream opens); `hotwash:import-start` starts an import; `hotwash:recording-status`
  and the `hotwash:recording` event drive the presentation notice; `providers:delete-speech-model`
  removes a model. `hotwash:transcript-save` carries `recordingId`.
- **Windowing (FR-9):** a seek loop instead of fixed 30 s / 5 s overlap windows. Fixed overlap
  with midpoint ownership lost sentences at window boundaries in measurement; the seek loop
  re-hears a cut-off last segment from its start. The resume point is the next window's start.
- **Language:** transformers.js has no language detection, so multilingual models get the
  language the user picks (English by default).
- **Capture:** the AudioContext runs at 16 kHz (Chromium resamples); `audio.pcm` holds a
  placeholder WAV header that Stop or recovery fills in, then it is renamed to `audio.wav`.
- **Import (FR-8):** limited to 1 GB and two hours, since decoding happens in memory.
- **Models:** pins and dtypes in `speech/local-whisper/models.ts`; measurements in ADR-0041.
- **Not in this change (follow-ups):** `local-detect` probes for whisper.cpp / speaches /
  mlx-audio servers; session log entries (#417); export options for transcripts and audio
  (FR-15; nothing hot wash related is exported today, which matches the default); the AAR
  cloud-provider warning (FR-14) is in since #498: the Draft dialog names the provider when marked quotes would go to a cloud model, and the quotes reach the draft as `tr:T<n>` evidence; x64 speed measurement on the Windows VM.
