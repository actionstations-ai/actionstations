# ComfyUI (images and video)

[ComfyUI](https://github.com/comfyanonymous/ComfyUI) runs image and video diffusion models locally. The app sends it workflows in ComfyUI's API format, writes the inject's media brief into the workflow's inputs, and downloads the results. It is used for **photographic** media only: scene photos, CCTV-style stills, the photo attached to a social post, and short clips animated from a scene image. Anything with text that players must read (posts, tickets, boards, documents) is rendered from templates instead, because image models produce garbled text.

Verified with ComfyUI 0.42.0 on macOS (Apple Silicon, PyTorch 2.14.1 with the MPS backend, Python 3.12).

## 1. Install ComfyUI

With [uv](https://docs.astral.sh/uv/) (any Python virtual-environment tool works the same way):

```bash
git clone https://github.com/comfyanonymous/ComfyUI ~/ComfyUI
cd ~/ComfyUI
uv venv --python 3.12
uv pip install torch torchvision torchaudio      # macOS: standard wheels include MPS
uv pip install -r requirements.txt
```

On Windows or Linux with an NVIDIA GPU, install the CUDA build of PyTorch instead (the command for your CUDA version is on [pytorch.org](https://pytorch.org/get-started/locally/)).

Check that PyTorch sees the GPU:

```bash
.venv/bin/python -c "import torch; print(torch.__version__, torch.backends.mps.is_available())"   # macOS: True
```

Start the server on localhost only:

```bash
.venv/bin/python main.py --listen 127.0.0.1 --port 8188
```

Open `http://127.0.0.1:8188` once to confirm the UI loads.

## 2. Download the model files

The app ships two default workflows in [`comfy/workflows/`](../../../comfy/workflows/README.md). Both use ComfyUI core nodes only, so no custom node packs are needed.

| Workflow         | Media | File                                  | Folder (inside `~/ComfyUI/models/`) | Size   | Source                                                                                                      |
| ---------------- | ----- | ------------------------------------- | ----------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `sdxl-photo`     | image | `sd_xl_base_1.0.safetensors`          | `checkpoints/`                      | 6.9 GB | [stabilityai/stable-diffusion-xl-base-1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) |
| `image-to-video` | video | `ltxv-2b-0.9.8-distilled.safetensors` | `checkpoints/`                      | 6.3 GB | [Lightricks/LTX-Video](https://huggingface.co/Lightricks/LTX-Video)                                         |
| `image-to-video` | video | `t5xxl_fp16.safetensors`              | `text_encoders/`                    | 9.8 GB | [comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders)               |

Download them from the Hugging Face pages (the files are under **Files and versions**) and place them in those folders. Restart ComfyUI after adding models.

What the defaults do and how long they take on Apple Silicon (MPS):

- **`sdxl-photo`**: SDXL base 1.0 text-to-image at 1216 × 832, 25 steps. Style suffixes push towards phone photos, press photos, CCTV frames and portraits. Measured through the app's **Test render**: 18.7 s per image with the model loaded.
- **`image-to-video`**: LTX-Video 2B distilled animates the inject's scene image into an H.264 MP4 at 1024 × 576, 24 fps, up to 5 seconds. Measured: 29.6 s for a 3-second clip. Wan 2.2 was evaluated and produced broken frames on MPS, so it is not a default; with a CUDA GPU you can import Wan's official API-format workflow yourself. See [ADR-0011](../../adr/0011-video-model-ltxv.md).

## 3. Connect it in the app

1. **Providers → Detect local services → Add** next to ComfyUI (or **Add provider → Type: ComfyUI**, Base URL `http://127.0.0.1:8188`). The card shows **Reachable** and the latency.
2. In **Routing**, set **Image** and **Video** to ComfyUI.
3. Open **Workflows** in the sidebar. The header shows **Connected** and the ComfyUI version. Each workflow card shows its bindings and either **All nodes available** or the list of node types ComfyUI does not have. **Recheck nodes** asks ComfyUI again (after installing a custom node pack, for example).
4. Open a workflow and run **Test render** with a short prompt to see one image (or clip) end to end.

![Workflows connected to ComfyUI](../images/workflows.png)

The **Defaults** row picks the workflow each media type uses when an inject does not name one (built in: image → `sdxl-photo`, video → `image-to-video`, no audio default).

## Prompts that work with SDXL

The media brief stage writes the image prompt; when you edit a brief or a prompt, keep these in mind:

- **Describe things positively.** SDXL ignores negation: "no screens" produces screens. Write "departure boards powered off and dark".
- **Never rely on text in the image.** Signs, screens and documents come out garbled. Text belongs in a template; a photo can sit inside a template's image slot (see the [template guide](../templates.md#image-slots)).
- **Name the camera.** "Phone photo", "security camera still, high angle, timestamp overlay" or "press photo" changes the look more than adjectives do.

## Your own workflows

Any workflow exported from ComfyUI with **Workflow → Export (API)** can be imported on the **Workflows** page (**Import workflow**, then choose the media type). You then bind the brief's values (prompt, negative prompt, seed, width, height, duration, input image, voice text) to node inputs in the binding editor. Imported workflows go to the app's data folder (global) or `<project>/comfy/workflows/` (one project); a project workflow wins over a global one with the same id, which wins over a built-in. The binding format and sources are described in [`comfy/workflows/README.md`](../../../comfy/workflows/README.md).

## Troubleshooting

| Symptom                                                       | Fix                                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Detect says ComfyUI "Not found"                               | ComfyUI is not running, or listens elsewhere. Start it with `--listen 127.0.0.1 --port 8188`.                        |
| A workflow card lists missing nodes                           | Install the node pack that provides them (for imported workflows), restart ComfyUI, then **Recheck nodes**.          |
| Render fails with a missing model / "value not in list" error | The model file is not in the folder the workflow expects (table above) or ComfyUI was not restarted after adding it. |
| Renders are very slow on a Mac                                | Check `torch.backends.mps.is_available()` is `True`; without MPS, ComfyUI runs on the CPU.                           |
| Video frames smear into colour after the first frame          | A model that does not work on MPS (seen with Wan 2.2). Use the built-in LTX-Video workflow.                          |
| Images show garbled signs or screens                          | Expected for diffusion models. Describe screens as dark or off, and put text in a template.                          |
