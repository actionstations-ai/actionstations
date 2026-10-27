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
input folder), `text` / `voiceStyle` / `speaker` (voice lines), `referenceAudio`, `literal`
(a fixed `value`) and `lighting` (a `value` per brief lighting, `normal` when the brief names
none: `{ "dark": 0.92 }`; the value may be a node link such as `["11", 0]`, so a dark scene can
be wired through extra nodes). A source with no value leaves the workflow's own value in place.

**Optional nodes** (ADR-0022): a node whose `_meta.optional` names a group runs only when the
ComfyUI server can run every node of that group. Before queueing, the app asks
`/object_info/<class>` for each class in the group; if a class is not installed, or a literal
choice input (a model folder, for example) names a value the server does not list, the group's
nodes are removed. An input that linked into a removed node then takes the value its node's
`_meta.fallback` names (`{ "mask": ["47", 0] }`); without a fallback the render fails. Optional
classes are not counted as missing nodes; the Workflows card lists them as **Optional, not
installed**, and pack review lists optional custom nodes separately.

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

Every render records `provenance.workflowHash` (SHA-256 of the bound workflow as sent, after optional groups were removed, key-order
independent), `model` (first checkpoint / diffusion model named in it) and `seed`.

## `sdxl-photo` — documentary photo (image)

SDXL base 1.0 text-to-image, 1216×832, `dpmpp_2m` / `karras`, 25 steps, CFG 6.5. Style
suffixes for `phone`, `press`, `cctv`, `screen` and `portrait` push towards phone-photo and
photojournalism realism. Core nodes only, plus two optional groups for blank-screen scenes: a
FLUX.2 [klein] edit and a sign detector (below).

- Model: `models/checkpoints/sd_xl_base_1.0.safetensors`
  ([stabilityai/stable-diffusion-xl-base-1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)).
- Measured (ComfyUI 0.42.0, Apple Silicon, MPS): **15.6 s** per image with the model loaded.
- SDXL cannot render legible text and ignores negation ("no screens"); it also lights any
  screen it is asked to draw, "dark powered-off boards" included. Text-bearing media is always
  template-rendered ([CONTRIBUTING.md, Project rules 5](../../CONTRIBUTING.md#project-rules)).
- Dark scenes (#162): a brief that describes a power loss (outage, blackout, power failure,
  generators, emergency lighting) has `lighting: "dark"`. A brief whose screens are only blank
  (power on, e.g. a cyber attack) leaves them out of the prompt and gets `screens-off` (below).
  Three `lighting` bindings switch a dark scene's sampler to the dark start latent
  (node 11: a #404040 `EmptyImage` through `VAEEncode`, so the sampler starts dark) at denoise
  0.92, and to a positive prompt combined with "dark unlit ceiling in deep shadow" over the top
  40% of the frame (`ConditioningSetAreaPercentage`, node 13), where SDXL otherwise paints lit
  departure boards and signs. Lit scenes do not reach those nodes and render as before.
  Measured on the #141 brief (sample-run I-10), seeds 1001–1003: mean luma 87–116 with lit
  boards and signs before; 29–40 and no lit screens after. Prompt and negative-prompt changes
  alone (with a dark start latent) still left a lit board in 2 of 3 seeds.
- Blank screens with the power on (#356): a brief whose screens are dark or blank without a
  power loss has `lighting: "screens-off"`. The first pass is the lit scene, unchanged (same
  prompts, latent and seed as `normal`). One more `lighting` binding saves a repainted image
  (node 54) instead of the first decode. The repaint finds lit signs in the first decode with
  stock mask nodes (`ImageToMask`, `MaskComposite`, `ThresholdMask`, `InvertMask`,
  `SolidMask`, `Morphology`, `GrowMask`; nodes 21–47): saturated blue (b − r > 0.3, b > 0.35,
  r and g ≤ 0.35) or amber (r > 0.85, r − b > 0.55, g > 0.55; lit skin highlights reach
  r − b ≈ 0.36) pixels in the top 40% of the frame (`MaskComposite` y = 333, sized for
  832 px), closed (15 px) so sign text joins into boards, opened (7 px) to drop specks and
  grown by 8 px. It fills them with #1a1a1a, samples them again at denoise 0.55 with the same
  seed and prompts (`SetLatentNoiseMask`, nodes 48–53) and composites the result over the
  first decode through the mask, so pixels outside the mask are the lit render's. Without lit
  signs the mask is empty and the image is the first decode. `Morphology` needs ComfyUI's
  bundled `kornia` dependency.
  Area prompts over the top of the frame ("unlit ceiling" positive, "illuminated signs, sky"
  negative) cleared more signs but replaced heads in the crowd with hair or fabric (also at
  strength 0.5); confined to the top 20% they left people alone but changed the composition.
  They are not used: people must come out exactly as in the lit render.
  Measured on sample-run I-10 (boards blank, power on), seeds 1001–1006: mean luma 88–115
  (lit render 91–116); pixels changed only inside sign masks (0–5.3% of the frame, none below
  row 340); faces and people identical to the lit render in 6 of 6. The large saturated blue
  boards and signs are dark in 5 of 6 (1004 has none the mask finds), but every seed still
  shows some lit signage: small far-off screens, pale-blue signs, and black boards with
  white lettering, which these colour rules do not separate from windows, sky or clothing.
  The opt-in live test checks luma > 60 and lit-sign pixels < 0.3% of the top 40%.
- Optional FLUX.2 [klein] edit (#356, ADR-0022): nodes 120–173 form the optional group
  `flux2-klein-edit`. It uses core nodes only and three Apache-2.0 model files:

  | File                          | Folder              | Size   | Source                                                                                                      |
  | ----------------------------- | ------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
  | `flux-2-klein-4b.safetensors` | `diffusion_models/` | 7.8 GB | [black-forest-labs/FLUX.2-klein-4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)               |
  | `qwen_3_4b.safetensors`       | `text_encoders/`    | 8.0 GB | [Comfy-Org/Z-Image-Turbo](https://huggingface.co/Comfy-Org/Z-Image-Turbo) `split_files/text_encoders/`      |
  | `flux2-vae.safetensors`       | `vae/`              | 0.3 GB | [Comfy-Org/Flux-2-Dev](https://huggingface.co/Comfy-Org/Flux-2-Dev) `split_files/vae/` (FLUX.2 autoencoder) |

  When they are installed, the `screens-off` binding of node 9 saves node 166; without them
  node 9's `_meta.fallback` saves the repaint (node 54) as before, with or without the detector.
  The graph follows ComfyUI's _FLUX.2 klein 4B image edit_ template: the lit decode (node 8) is
  encoded at its own size (no rescale to 1 MP, so the edit lines up with it) and edited with
  `ReferenceLatent`, CFG 1, `euler`, 4 `Flux2Scheduler` steps and the job seed (node 133). The
  instruction is "Power off every screen, departure board, monitor, LED counter and illuminated
  sign. Keep each one in exactly the same place and size, but make its face solid glossy black
  with no text, no light and no colour, like a switched-off TV. Keep everything else exactly the
  same, including every person, face, the lighting and the architecture." A shorter wording
  ("switch off … keep everything else") removed the boards instead of blacking them.
  The edit redraws the whole frame, so only part of it is used. Per channel, lit minus edit
  (`MaskComposite` subtract clamps at 0, so only darkening counts) is summed; pixels darkened by
  more than 0.3 are opened (7 px, drops specks from the redrawn crowd) and then closed (15 px,
  fills boards). Within 30 px of those (three 21 px dilations; one 61 px `Morphology` kernel
  needs 64-bit indexing, which MPS lacks), pixels darkened by more than 0.15 join them (board
  lettering and dim board edges), the result grows 4 px and is cut to pixels the edit made darker
  at all (> 0.05). The edit is composited over the lit decode through that mask (node 156).
  Lit signs the edit left on are then handled the old way: the colour mask (node 46, grown 8 px
  with `Morphology`) minus what the edit already took is filled #1a1a1a and repainted with SDXL
  at denoise 0.55 with the scene prompts and seed (nodes 157–166). Opening after closing was
  tried and rejected: closing first joins the redrawn crowd into blobs (1006). The group uses no
  `GrowMask`, so it runs under `--gpu-only` too. The sign detector is not run when the edit is
  used.
  Measured on sample-run I-10, seeds 1001–1006, through the app (ComfyUI 0.42.0, Apple M5 Max),
  against the detector render of the previous version. "Changed" is pixels differing from the lit
  render by more than 12 in any channel; people and face boxes come from Florence-2-large object
  detection over the whole lit frame (4 × 4 tiles), not from the workflow.

  | Seed | Lit signs left by eye (edit)                                                | Changed, edit (detector) | In people boxes | In face boxes | Mean luma, edit (detector, lit) | Time, edit (detector) |
  | ---- | --------------------------------------------------------------------------- | ------------------------ | --------------- | ------------- | ------------------------------- | --------------------- |
  | 1001 | cyan screen behind the crowd, two small blue signs far left                 | 6.2% (5.6%)              | 16 px           | 0             | 87.0 (87.9, 90.7)               | 53 s (134 s)          |
  | 1002 | a few small out-of-focus screens and amber signs far back                   | 2.5% (1.6%)              | 566 px          | 0             | 113.6 (114.6, 115.7)            | 55 s (116 s)          |
  | 1003 | small signs at the far right                                                | 2.3% (1.9%)              | 0               | 0             | 95.5 (95.9, 97.3)               | 55 s (130 s)          |
  | 1004 | lit shop fronts below the boards, dimmed fascia lettering                   | 2.5% (1.5%)              | 4 px            | 0             | 96.1 (98.7, 99.6)               | 58 s (118 s)          |
  | 1005 | lower board row stays dim navy with one amber digit; small screens far left | 5.5% (5.0%)              | 245 px          | 0             | 111.9 (112.0, 114.5)            | 65 s (119 s)          |
  | 1006 | small screens at the shops                                                  | 1.0% (0.2%)              | 0               | 0             | 108.4 (108.7, 108.8)            | 65 s (107 s)          |

  Changed pixels lie in rows 0–372 and on screens, signs and their edges in every seed. The
  pixels inside people boxes are screens behind people that the boxes overlap (1002, 1005), the
  edge of a repainted shop fascia just above a head (1005) and a few pixels at the top of one
  distant head (1001); no face-box pixel changed. Compared with the detector, the edit also
  blacks out the white-lettered boards (1003), the whole FIDS board including its header (1005),
  the boards over the shops (1004) and more of the small screens (1002). Where the edit darkened
  a small screen only partly, it can look patchy (1002). Lit-sign colour pixels in the top 40%
  (the live test's measure): 0.01–0.13% (detector 0.02–0.22%). With `--gpu-only` the same seeds
  take 47–54 s and the live test passes (0.01–0.13%). Power-loss renders are pixel-identical to
  the previous version (seeds 1001–1003 compared), and lit renders do not reach either optional
  group.

- Optional sign detector (#356, ADR-0022): nodes 60–108 form the optional group
  `sign-detector`. They need the [ComfyUI-Florence2](https://github.com/kijai/ComfyUI-Florence2)
  custom nodes (MIT) and `models/LLM/Florence-2-large/` from
  [microsoft/Florence-2-large](https://huggingface.co/microsoft/Florence-2-large) (MIT); see the
  [ComfyUI guide](../../docs/guides/providers/comfyui.md#optional-sign-detector-for-blank-screen-scenes)
  for the install. Florence-2 object detection runs over eight overlapping tiles of the top 352 px
  (4 × 2, 352 × 208 px each, sized for 1216 × 832), twice per tile: once keeping sign labels
  (signboard, television, street sign, scoreboard, banner, billboard, computer monitor and similar),
  once keeping people (person, man, woman, human face or head, clothing, bags and similar). The
  repaint mask is the sign boxes plus the colour mask, grown 4 px, cut to the top 352 px, minus the
  people boxes grown 10 px. Both grows are `Morphology` dilations (nodes 109–112), not
  `GrowMask`: `GrowMask` converts its mask to numpy and fails when ComfyUI keeps tensors on the
  GPU (`--gpu-only`, below). Nodes 49, 51 and 54 take that mask; their `_meta.fallback` points them
  at the colour mask (node 47) when the group is left out, which gives exactly the colour-only
  render. Florence-2 phrase grounding ("illuminated sign. display screen. …") was tried as a third
  pass: it found white-lettered black boards and more small signs, but it also returned tile-sized
  boxes when nothing matched and, in seed 1001, a box over a screen that included the head of a
  person in front of it, which the repaint replaced. It is not used.
  Measured on sample-run I-10, seeds 1001–1006, through the app (ComfyUI 0.42.0, Apple Silicon;
  ComfyUI runs this node pack's Florence-2 on the CPU): 109–139 s per image instead of about
  45 s; mean luma 86–115 (lit render 91–116); changed pixels 0.1–5.6% of the frame, all in rows
  32–320 and all on signs; faces and people identical to the lit render in 6 of 6. Compared with
  the colour mask alone, the detector also darkens the FIDS board and the board row in 1005, the
  signs over the shops in 1003 and 1004 and a far-left sign in 1001. Every seed still keeps some
  lit signage the detector does not label: small screens far down the hall (1002, 1004, 1005),
  white-lettered black boards (1003), a blue-lit shop fascia (1006), small far-left signs and a
  cyan screen behind the crowd (1001).
- Detector speed (#356): the node pack loads Florence-2 on ComfyUI's text-encoder device, which
  is the CPU on Apple Silicon unless ComfyUI starts with `--gpu-only`. Measured on the same seeds:
  115–135 s per screens-off image by default, 41–45 s with `--gpu-only` (Florence-2 on the GPU;
  power-loss images 21–24 s either way). Florence-2-large on the GPU in fp32 returns the same boxes
  as on the CPU (all 16 passes, seeds 1001–1006); fp16 on the GPU moves boxes and drops or adds
  one per image, and bf16 on the CPU is about 7× slower than fp32, so the loader stays at fp32.
  `--gpu-only` also moves the text encoders, so a seed renders a slightly different image than
  without it (3–15% of pixels differ on these seeds). With neither the detector nor the FLUX.2
  [klein] edit, screens-off scenes do not run under `--gpu-only` yet: the colour mask still uses
  `GrowMask` (node 47), kept so the colour-only render stays exactly as before.
- Tried for #356 and not used (sample-run I-10, seeds 1001–1006):
  - A light-source pass with stock mask nodes (bright lettering on dark boards, saturated blue
    or amber light, joined and cleaned with `Morphology`, minus the people boxes and everything
    below them). It darkened the FIDS header in 1005 and a screen in 1006. In 1001 it also
    repainted the top of a head under a cyan screen that the people boxes did not cover. Looser
    versions also hit glass-roof panes (1004) and the tiny crowd in 1006. A skin-colour exclusion
    zone covered nearly the whole warm-lit frame, so nothing was left to repaint.
  - A separate repaint prompt ("switched-off blank black screens…"): no visible change from the
    scene prompt. Small repainted areas can still come back with a lit dot.
  - Smaller tiles (8 × 4) for Florence-2: more people found, but small signs were still missed,
    other labels were hallucinated (train, toilet, curtain), and the cost is 4× on the CPU.
    Four full-height tiles: half the cost, but they miss up to 13% of the people area the 4 × 2
    tiles find.
  - Florence-2-base: not faster on the CPU (14–44 s against 37–47 s for eight tiles), because it
    sometimes produces long degenerate outputs. Greedy decoding (one beam): 20% faster, but it
    missed a face box in 1002.
  - Florence-2 phrase grounding as the sign pass: tile-sized boxes when nothing matches (see
    above).
  - RT-DETR v4 person boxes (core `RTDETR_detect`): fast (about 2 s for eight tiles), but
    turning boxes into a mask needs the experimental layer compositor (at most 50 boxes per
    call), and it still missed most of the tiny crowd in 1006.

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
