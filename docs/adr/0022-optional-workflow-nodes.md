# ADR-0022: Optional node groups in ComfyUI workflows

Date: 2026-10-25 · Status: Accepted · Issue: #356 · Builds on [ADR-0018](0018-packs.md), [ADR-0021](0021-local-tools-setup.md)

## Context

`sdxl-photo` repaints lit signs in scenes whose screens are blank with the power on (`lighting: "screens-off"`). A colour rule finds the large saturated boards but cannot tell small, pale or white-lettered signs from windows, sky or clothing (#356). A text-prompted detector finds more of them and also finds the people the repaint must leave alone. No ComfyUI core node does that with permissively licensed weights: core `SAM3_Detect` needs Meta's SAM 3 weights (SAM License, gated download, not Apache-2.0 or MIT), and core `RTDETR_detect` only knows the COCO classes. The established GroundingDINO + SAM package (storyicon/comfyui_segment_anything, Apache-2.0, last changed March 2024) calls `BertModel.get_head_mask` and `get_extended_attention_mask`, which transformers 5 (ComfyUI 0.42's environment) no longer has. The detector is therefore a custom node package plus a model that most users will not have.

ComfyUI refuses a whole prompt when any node class in it is unknown, even a node no output depends on. A shipped workflow that names the detector nodes would fail for everyone without them.

## Decision

**A workflow can mark nodes as an optional group.** In the API-format JSON, `_meta.optional: "<group>"` puts a node in a group, and `_meta.fallback: { "<input>": <value> }` on another node gives the value an input takes when its link points into a group that is left out. ComfyUI ignores `_meta`, so the file stays a valid API workflow and still imports and opens in ComfyUI.

**The provider decides per render.** After binding, `runnableWorkflow` (`src/main/providers/media/comfyui/optional.ts`) asks the server `GET /object_info/<class>` once for each class in a group. A group is left out when a class is not installed, or when a literal combo input names a value the server does not list (for example a model folder that is not there). Left-out nodes are removed, fallbacks are wired in, and a link into a removed node without a fallback is an error. The progress message names the group and the reason. The workflow hash in provenance is that of the workflow actually sent.

**Reporting.** `requiredNodes` no longer counts optional nodes, so a missing optional node is not a "missing node". Workflow entries list `optionalNodes` and, once the server was asked, `missingOptionalNodes`; the Workflows page shows them as an info badge. Pack review lists optional custom nodes separately from required ones (they run code when installed, but the workflow works without them).

**No automatic install.** The local-tools setup (ADR-0021) does not install the detector. A custom node package is Python code from a git repository with pip dependencies; it has no publisher signature or pinned hash that the setup's trust model could check, and the weights alone are useless without it. The ComfyUI guide documents the manual install.

**The `sdxl-photo` detector.** [kijai/ComfyUI-Florence2](https://github.com/kijai/ComfyUI-Florence2) (MIT, a native re-implementation that needs no remote code) with [microsoft/Florence-2-large](https://huggingface.co/microsoft/Florence-2-large) (MIT, safetensors) in `models/LLM/Florence-2-large`. Florence-2 object detection runs on eight overlapping tiles of the top 42% of the frame twice: once keeping sign labels (signboard, television, street sign, scoreboard, banner and similar), once keeping people (person, man, woman, face, clothing and similar). The repaint mask is the sign boxes plus the colour mask, minus the people boxes grown by 10 px. Florence-2 phrase grounding was tried as a third pass. It found more small signs, but it also returned tile-sized boxes when nothing matched and a box over a screen that included a head in front of it, so it is not used.

## Consequences

- Users without the detector get the colour-mask repaint, as before. Users with it get more signs repainted, at a cost: on Apple Silicon the custom node runs Florence-2 on the CPU, about 2 minutes per screens-off image instead of about 45 s (measured 109–139 s on sample-run I-10). Lit and power-loss scenes never run the detector.
- Any workflow, including user and pack workflows, can use the same mechanism. A pack author who marks nodes optional must give fallbacks.
- The node ids, tile layout and band are sized for 1216 × 832, like the colour mask. Other sizes still render, but tiles do not cover the frame exactly.
- A node class or model check costs one small HTTP request per class per render of a workflow with optional groups.

## Follow-up: detector speed and what else was tried (#356)

- **GPU-safe grows.** The detector group grows its masks with `Morphology` dilations instead of `GrowMask`. `GrowMask` converts to numpy and fails when ComfyUI keeps tensors on the GPU, which is what `--gpu-only` does. With `--gpu-only`, the node pack puts Florence-2 on the GPU on Apple Silicon: 41–45 s per screens-off image instead of 115–135 s, and fp32 gives the same boxes as the CPU. The flag is a server-wide choice, so the guide documents it and the app does not require it. The colour-only path keeps `GrowMask` so it stays pixel-identical to before, which means that path does not yet run under `--gpu-only`.
- **Not adopted** (measured on sample-run I-10, seeds 1001–1006; details in `comfy/workflows/README.md`):
  - A stock-node light-source pass. It repainted part of a head that the people boxes missed.
  - A separate unlit repaint prompt. It made no visible change.
  - Finer or coarser tiling. It costs more, or it finds fewer people.
  - Florence-2-base and greedy decoding. Neither gave a reliable saving, and greedy decoding lost a face box.
  - fp16 or bf16. Boxes change, or the run is 7× slower.
  - RT-DETR person boxes. They need the experimental layer compositor to become a mask, and they still miss far crowds.
- Small far-off screens, white-lettered boards and lit fascias still stay lit in every seed. Removing them safely needs per-pixel segmentation of people and signs, which no permissively licensed ComfyUI node offers today.
