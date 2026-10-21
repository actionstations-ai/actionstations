# ADR-0009: Audio and TTS

Date: 2026-10-21 · Status: Accepted · Issue: #35

## Context
Voice injects (radio calls, voicemails, phone calls, PA announcements) need speech plus effects that sell the medium. ComfyUI is the primary media provider, but it is not always installed, and the TTS path must be testable without it. Adding ffmpeg as a runtime dependency would complicate packaging on all three platforms.

## Decision
- **Primary TTS:** a ComfyUI TTS workflow under `comfy/workflows/`, driven by the ComfyUI `MediaProvider`.
- **Fallback TTS:** a deterministic local `MediaProvider` that uses macOS `say`, Windows SAPI (PowerShell `System.Speech`), or `espeak` / `espeak-ng` on Linux when present. Used when ComfyUI is unavailable and in tests.
- **Post-FX:** a pure TypeScript DSP chain on WAV buffers: band-pass (radio), compression and limiting (phone), ambience bed mixing. No ffmpeg.
- **Encoding:** WAV internally; MP3 export via `lamejs`.

## Consequences
- Voice injects work on any machine with a system voice; quality improves with ComfyUI.
- The DSP code is ours to test and maintain, with unit tests on synthetic signals.
- System voices differ per OS, so fallback audio is not byte-identical across platforms; tests assert structure (duration, sample rate, levels), not bytes.
