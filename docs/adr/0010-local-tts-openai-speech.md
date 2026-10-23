# ADR-0010: Local TTS through the OpenAI-compatible speech API

Date: 2026-10-21 · Status: Accepted · Issue: #19, #35

## Context

ADR-0009 made ComfyUI the primary TTS path. On this project's reference machine (Apple Silicon), the best local voices — VoxCPM2 and Qwen3-TTS (VoiceDesign takes a free-text voice description, ideal for SimCell characters) — run natively under MLX via `mlx-audio`, whose server exposes an OpenAI-compatible `POST /v1/audio/speech`. ComfyUI TTS custom nodes for these models are not reliable on macOS/MPS.

## Decision

- The `openai-compatible` adapter also implements `createMedia` with capability `audio`: one `/v1/audio/speech` request per `voiceLines` entry, joined into one 44.1/48 kHz WAV with a short gap between speakers. `voiceStyle` is sent as both `instructions` (OpenAI) and `instruct` (mlx-audio); VoiceDesign models get a neutral description when none is given.
- Default local setup: `mlx_audio.server --host 127.0.0.1 --port 8765` with `mlx-community/VoxCPM2-8bit` (default) and `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16` (described voices). Measured: a two-speaker phone call renders in 1.7–3.2 s.
- ComfyUI remains the image/video provider and an optional TTS provider for users who already have TTS workflows; routing (`audio` task) chooses.
- Post-FX (radio band-pass, phone compression, ambience) stays in pure TypeScript per ADR-0009.

## Consequences

- Remote TTS (OpenAI, any OpenAI-compatible host) works with no new adapter.
- mlx-audio is Apple-Silicon only; Windows/Linux users use the system-voice provider (ADR-0009 fallback, #215), a ComfyUI TTS workflow they import, or a remote OpenAI-compatible TTS.
- mlx-audio reports some request errors mid-stream (HTTP 200 with an empty body); the adapter treats empty/truncated audio as a `PROVIDER` error.
