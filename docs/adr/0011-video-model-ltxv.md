# ADR-0011: LTX-Video as the default local video model

Date: 2026-10-21 · Status: Accepted · Issue: #33

## Context

Short video injects (shaky phone footage, a CCTV clip, a news b-roll) are generated locally through ComfyUI from a scene still (image-to-video). The reference machine is Apple Silicon (MPS). Candidates that run on ComfyUI core nodes without custom nodes: LTX-Video 2B and Wan 2.2 TI2V 5B.

## Decision

Ship `comfy/workflows/image-to-video.json` using **LTX-Video 2B 0.9.8 distilled**, core nodes only, 1024×576 at 24 fps, ~3 s, H.264 MP4 via core `SaveVideo`. Measured on ComfyUI 0.42.0/MPS: 29.6 s for a 3.04 s clip (73 frames) with coherent motion. Wan 2.2 TI2V 5B was tested and rejected: 529 s at 1024×576 and 1075 s at 1280×704, with corrupted frames after frame 0 on MPS. Users can import any other API-format workflow and bind it on the Workflows page.

## Consequences

- Video injects are practical on a laptop (~30 s each); quality is "plausible phone clip", not cinematic.
- Every video asset also gets a poster PNG for the inject deck (docs/03 rule 5).
- Revisit Wan (or successors) when MPS support matures; the workflow store makes swapping a default a settings change, not a code change.
