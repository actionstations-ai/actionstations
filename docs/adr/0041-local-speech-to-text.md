# ADR-0041: Local speech to text for the hot wash

Date: 2026-10-29 · Status: Accepted · Issue: #425

## Context

Facilitators want the hot wash recorded and transcribed so the AAR can quote participants.
Participants are told their words stay in the room, so audio must never leave the computer,
and the app must stay free of new native code to build and sign per platform (ADR-0004).

## Decision

- A `transcribe` provider task and a `SpeechToTextProvider` interface. The built-in
  `local-whisper` adapter runs Whisper ONNX models (onnx-community) through
  `@huggingface/transformers`, the runtime the app already ships for embeddings, in its own
  Electron `utilityProcess` (`src/main/providers/speech/stt-*`). The worker reads the WAV in
  30 s windows; like Whisper's own seek loop, a last segment that runs into the window end is
  dropped and heard again from its start in the next window. Everything before that point is
  saved to `transcript.json` after each window, which is the resume point.
- `openai-compatible` servers (whisper.cpp, speaches, mlx-audio) may serve `transcribe` only
  when their base URL is a loopback address, checked when resolving and before every request.
  No cloud adapter implements speech to text. With nothing routed, the built-in models are used.
- Models are downloaded only on a click, pinned to a commit with a sha256 per file
  (`speech/local-whisper/models.ts`, shared download code in `embedding/model-files.ts`).
  Encoder fp32 with a q8 decoder for tiny.en and base; q8 for both in small and large-v3-turbo.
  transformers.js has no language detection: multilingual models are given the language the
  user picks (English by default).
- Capture runs in the renderer: a 16 kHz `AudioContext` and an AudioWorklet from the app
  bundle send ~1 s PCM16 chunks through `hotwash:append`. Main appends them to `audio.pcm`
  (with a placeholder WAV header) and fills in the header on Stop or recovery, so audio is
  never copied. The session permission handler allows only `media` with `['audio']`, for the
  main window's app page, within 10 s of `hotwash:mic-arm`; everything else stays denied.
- Owner decision: audio is deleted once its transcript is saved, unless the project setting
  "Keep the audio" is on.

## Consequences

Measured on Apple M-series (in-process, 159 s of speech): whisper-tiny.en 2.3 min per hour of
audio, whisper-base 2.8 min per hour, whisper-small 6 min per hour; peak process memory with
whisper-base loaded about 1.6 GB. NFR-4 (base: 60 min in ≤ 20 min) is met with room to spare;
x64 numbers still need a run on the Windows VM. No Metal or GPU acceleration: users who want it
can run a local whisper.cpp server. A crash of the worker fails the job, and Retry continues
from the last saved window.
