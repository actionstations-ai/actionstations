# ComfyUI workflows

Default workflows the app ships for AI media. Each workflow is two files:

- `<id>.json` — the workflow in ComfyUI **API format** (`{ "<nodeId>": { class_type, inputs } }`).
- `<id>.bindings.json` — the sidecar: name, media type, description and the **bindings** that
  write values from an inject's media brief into node inputs, plus optional `styles`
  (prompt suffix per `imageStyle`), `negativePrompt` (used when the brief has none), and for
  video `fps`, `frameStep` and `maxDurationSec`.

A binding is `{ "target": ["<nodeId>", "inputs", "<input>"], "source": "<source>" }`. Sources:
`imagePrompt` (brief prompt + style suffix), `videoPrompt` (falls back to the image prompt),
`negativePrompt`, `seed` (random when the job has none; recorded in provenance), `width`,
`height`, `durationSec` (seconds; converted to a `frameStep·n + 1` frame count when the target
input is a frame count such as `length`), `inputImage` (the scene image, uploaded to ComfyUI's
input folder), `text` / `voiceStyle` / `speaker` (voice lines), `referenceAudio`, and `literal`
(a fixed `value`). A source with no value leaves the workflow's own value in place.

Where workflows live (looked up in this order):

| Layer   | Folder                                                                                                                   | Notes                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Project | `<project>/comfy/workflows/`                                                                                             | Used for jobs whose output folder is inside that project.       |
| Global  | `<userData>/comfy/workflows/`                                                                                            | Imported on the Workflows page.                                 |
| Default | this folder (the core bundled pack's `workflows/`, `app-resources/packs/ai.actionstations.core/workflows/` in a release) | Read-only; edited bindings go to `<userData>/comfy/overrides/`. |

Between Global and Default sit the `workflows/` of enabled installed packs (read-only; edited bindings go to
`<userData>/comfy/overrides/packs/<packId>/`). When a pack workflow renders media for a project it
is copied into `<project>/comfy/workflows/` and recorded in `<project>/packs.json` (ADR-0018).

The default workflow per media type is stored in `<userData>/comfy/defaults.json`
(built-in: image → `sdxl-photo`, video → `image-to-video`; no audio default).

Every render records `provenance.workflowHash` (SHA-256 of the bound workflow, key-order
independent), `model` (first checkpoint / diffusion model named in it) and `seed`.

## `sdxl-photo` — documentary photo (image)

SDXL base 1.0 text-to-image, 1216×832, `dpmpp_2m` / `karras`, 25 steps, CFG 6.5. Style
suffixes for `phone`, `press`, `cctv`, `screen` and `portrait` push towards phone-photo and
photojournalism realism. Core nodes only.

- Model: `models/checkpoints/sd_xl_base_1.0.safetensors`
  ([stabilityai/stable-diffusion-xl-base-1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)).
- Measured (ComfyUI 0.42.0, Apple Silicon, MPS): **15.6 s** per image with the model loaded.
- SDXL cannot render legible text and ignores negation ("no screens"). Describe the scene
  positively ("departure boards powered off and dark"); text-bearing media is always
  template-rendered ([CONTRIBUTING.md, Project rules 5](../../CONTRIBUTING.md#project-rules)).

## `image-to-video` — LTX-Video 2B distilled (video)

Animates the inject's scene image into a short H.264 MP4 using only ComfyUI **core nodes**
(`CheckpointLoaderSimple`, `CLIPLoader` with type `ltxv`, `LTXVImgToVideo`, `LTXVConditioning`,
`LTXVScheduler`, `SamplerCustom`, `CreateVideo`, `SaveVideo`). It renders 1024×576 at 24 fps
with 8 `euler` steps and CFG 1. `durationSec` is clamped to 5 s and converted to `8n + 1` frames
(3 s → 73 frames). The input image is copied next to the clip and used as its poster.

| File                                  | Folder                  | Size   | Source                                                                                        |
| ------------------------------------- | ----------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `ltxv-2b-0.9.8-distilled.safetensors` | `models/checkpoints/`   | 6.3 GB | [Lightricks/LTX-Video](https://huggingface.co/Lightricks/LTX-Video)                           |
| `t5xxl_fp16.safetensors`              | `models/text_encoders/` | 9.8 GB | [comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders) |

Measured on ComfyUI 0.42.0 with Apple Silicon (MPS): a 3.04 s clip (73 frames, 1024×576) takes
**29.6 s** from queueing to download. The output is coherent: people walk and the camera holds
steady.

Wan 2.2 TI2V 5B was also tried (core `Wan22ImageToVideoLatent` with the fp16 UMT5 encoder,
because MPS has no fp8). On MPS it produced unusable output: the first frame was fine, then the
frames broke into colour smears. That happened at 1024×576 (529 s per 3 s clip) and at the
native 1280×704 (1075 s). Wan is not shipped as a default. Users with a CUDA GPU can import
the official Wan 2.2 template (exported in API format) as a video workflow.

## Adding a ComfyUI TTS workflow (optional)

Speech normally goes through the OpenAI-compatible TTS adapter (mlx-audio, ADR-0010); ComfyUI
TTS is for users who already run a TTS custom node pack. To use one:

1. In ComfyUI, build a workflow that speaks a text input and ends in a node that saves audio
   (core `SaveAudio` writes FLAC/MP3/Opus; many TTS packs ship their own save node). Export it
   with **Workflow → Export (API)**.
2. On the **Workflows** page choose **Import workflow**, pick the file and media type
   **Audio (TTS)**.
3. Bind the text input to **Voice text** (all voice lines joined), and, if the node takes them,
   a voice description to **Voice style** and a speaker / voice id to **Speaker**. Bind the seed
   input to **Seed** for reproducible takes.
4. Click **Recheck nodes** — missing custom nodes are listed per workflow — then **Test render**.
5. Set it as the **Audio** default and route the `audio` task to the ComfyUI provider under
   Providers → Routing.

The radio / phone / PA / terminal-ambience post-FX (`src/main/providers/media/audio-fx/`) apply
to any TTS output, whichever provider produced it.
