# ADR-0021: Optional setup of local model tools, or cloud APIs only

Date: 2026-10-24 · Status: Accepted · Issue: #334 · Milestone: 0.4.0 Domain packs

## Context

Action Stations generates exercises with a text model and, optionally, images, video and voice. Today the user installs LM Studio, Ollama, ComfyUI or a voice server on their own, then presses "Detect local services". The owner asked for two things:

1. setup makes sure these dependencies are installed, or can be installed automatically;
2. the user decides whether anything is installed at all. Cloud APIs only is a first-class path.

Constraints from CLAUDE.md: local-first and privacy-first (no telemetry, no network calls except on the user's action), keys in the OS keychain, provider calls only through adapters. The electron-builder installers must not bundle these tools: they are large, licensed separately, and differ per platform.

## Research (measured 2026-10-24)

Signing identities were read from the vendors' current installers. On macOS this used `codesign -dv` and `spctl -a` on the downloaded DMG and on the app inside it, mounted read-only. On Windows only the Authenticode certificate table of each `.exe` was fetched, with HTTP range requests, and printed with `openssl pkcs7`. Nothing was installed. Sizes are the `Content-Length` of the latest installer on that date.

|                                 | LM Studio                                                                                                                                    | Ollama                                                                                                                                                                                       | ComfyUI Desktop                                                                                                                                                                                            | Local voice (mlx-audio)                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Publisher                       | Element Labs Inc.                                                                                                                            | Ollama Inc. (macOS cert: Infra Technologies, Inc)                                                                                                                                            | Comfy Org (legal entity in both certs: Drip Artificial Inc)                                                                                                                                                | Prince Canuma (Blaizzy), PyPI package                              |
| Stable "latest" URL             | `https://lmstudio.ai/download/latest/<os>/<arch>` 302 → `installers.lmstudio.ai/<os>/<arch>/<ver>/LM-Studio-<ver>-<arch>.{dmg,exe,AppImage}` | `https://ollama.com/download/Ollama.dmg`, `/OllamaSetup.exe` 307 → `github.com/ollama/ollama/releases/latest/download/…`. The GitHub releases API lists every asset with a `sha256:` digest. | `https://download.comfy.org/<os>/<format>/<arch>` 307 → `dl.todesktop.com/241130tqe9q3y/…`                                                                                                                 | `pip`/`uv tool install mlx-audio` from PyPI (0.6.1)                |
| Formats                         | macOS arm64 DMG; Windows x64 and arm64 NSIS `.exe`; Linux x64 and arm64 AppImage. `darwin/x64` answers 400 (Intel Macs unsupported).         | macOS DMG (universal, Apple Silicon and Intel); Windows `OllamaSetup.exe`; Linux `.tar.zst` plus `install.sh`                                                                                | macOS arm64 DMG (not signed itself; the app inside is); Windows x64 NSIS `.exe`; Linux AppImage. `mac/dmg/x64` answers 404.                                                                                | Python wheel                                                       |
| macOS Team ID                   | `D65G88RHWN` ("Developer ID Application: Element Labs Inc"), notarized                                                                       | `3MU9H2V9Y9` ("Developer ID Application: Infra Technologies, Inc"), notarized; the DMG itself is also signed                                                                                 | `6FXBT88W8J` ("Developer ID Application: Drip Artificial Inc"), notarized                                                                                                                                  | none                                                               |
| Windows Authenticode subject CN | `Element Labs Inc.` (DigiCert EV)                                                                                                            | `Ollama Inc.` (DigiCert EV)                                                                                                                                                                  | `Drip Artificial Inc` (DigiCert EV)                                                                                                                                                                        | none                                                               |
| sha256 from the vendor          | not published for desktop installers                                                                                                         | yes: GitHub release asset digests and `sha256sum.txt`                                                                                                                                        | not published (no GitHub release assets)                                                                                                                                                                   | PyPI publishes per-file sha256                                     |
| Download size                   | macOS 571 MB, Windows 619 MB, Linux x64 1.02 GB                                                                                              | macOS 221 MB, Windows 1.66 GB, Linux amd64 1.51 GB                                                                                                                                           | macOS 196 MB, Windows 181 MB, Linux 221 MB                                                                                                                                                                 | 2.3 MB wheel plus MLX dependencies                                 |
| Installed size                  | 701 MB app on macOS (measured)                                                                                                               | 664 MB app on macOS (measured); Windows needs at least 4 GB (vendor)                                                                                                                         | 434 MB app on macOS (measured); vendor recommends at least 4.85 GB per installation (Python environment)                                                                                                   | about 1 GB with dependencies (approximate)                         |
| License                         | Proprietary: LM Studio Desktop App Terms (personal and internal business use, no redistribution)                                             | MIT                                                                                                                                                                                          | Desktop: AGPL-3.0-or-later (commercial license available); ComfyUI: GPL-3.0                                                                                                                                | MIT                                                                |
| Install method (vendor docs)    | macOS: drag the app to Applications. Windows: run the installer. Linux: run the AppImage.                                                    | macOS: drag to Applications; first launch asks to link the CLI into `/usr/local/bin`. Windows: run `OllamaSetup.exe`, no admin needed. Linux: `install.sh` or `tar x -C /usr` with `sudo`.   | macOS: drag to Applications. Windows: run the NSIS installer.                                                                                                                                              | `uv tool install mlx-audio` (or pip)                               |
| Start                           | `lms server start` (`~/.lmstudio/bin/lms`, present after the app's first launch), or open the app                                            | open `Ollama.app` / `ollama serve`                                                                                                                                                           | open the app (it runs its own server on 127.0.0.1:8000); source installs: `python main.py`                                                                                                                 | `mlx_audio.server --host 127.0.0.1 --port 8765`                    |
| Models                          | `lms get <model> --yes`                                                                                                                      | `POST /api/pull` (same as `ollama pull`)                                                                                                                                                     | files in the model folders. A running ComfyUI reports them at `GET /internal/folder_paths`; Desktop keeps them under `~/ComfyUI-Shared` (macOS) or `%LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Shared` (Windows) | downloaded from Hugging Face by the server on first use of a model |
| System requirements (vendor)    | macOS 14+ on Apple Silicon; Windows x64 with AVX2 or ARM; Linux Ubuntu 20.04+. 16 GB RAM recommended.                                        | macOS 14+; Windows 10 22H2+                                                                                                                                                                  | macOS 13+ on Apple Silicon; Windows 10+                                                                                                                                                                    | Apple Silicon only                                                 |

## Decision

**A choice, not a default install.** First-run setup gets a step "How do you want to run models?" with three options. Settings has the same choice in a **Local tools** section. The choice is stored as `settings.setup.mode`:

- **Cloud APIs only:** the user adds an API key on the next step. No tool rows are shown, nothing is detected beyond what the text step already does, and nothing is downloaded or installed.
- **Local tools:** LM Studio or Ollama for text, ComfyUI for images and video, local voice.
- **A mix:** both.

Each tool is its own row. The row shows what the tool does, the download and disk size, the license with a link, and one of three states:

- **Detected:** installed and running. The probe answered on 127.0.0.1.
- **Installed, not running:** the app or CLI is in a known location, with **Start** where the tool supports it.
- **Not installed:** **Download and install**, **Open the download page**, or **Skip**.

Skip is stored per tool in `settings.setup.skipped` and can be undone. Models are offered after the tools, from the same rows.

**Where the code lives.**

- `src/main/setup/`: `catalog.ts` holds the pinned vendor data. The other modules are `detect.ts`, `hardware.ts`, `fetch.ts`, `verify.ts`, `install.ts`, `start.ts` and `models.ts`.
- IPC: `setup:*` in `src/shared/ipc/setup.ts`.
- Jobs: the kind `tool-install` for installs; model downloads use `model-pull`.
- UI: `src/renderer/src/components/local-tools/`, used by the wizard step and by the Settings section.

**Trust model.**

1. **Only on a click.** Detection reads files and probes 127.0.0.1. It never contacts a vendor. A download starts only from **Download and install** or a model's **Download** button. It runs as a job with progress and Cancel. There are no background downloads, update checks or telemetry.
2. **Only from pinned vendor hosts.** Each tool has a start URL and an allowlist of hosts. LM Studio: `lmstudio.ai`, `installers.lmstudio.ai`. Ollama: `ollama.com`, `api.github.com`, `github.com`, `release-assets.githubusercontent.com`, `objects.githubusercontent.com`. ComfyUI: `download.comfy.org`, `dl.todesktop.com`. Model files: `huggingface.co` and `*.hf.co`. Redirects are followed by hand, and every hop must be https on an allowed host. A byte cap per installer, an idle timeout and Cancel remove the partial file.
3. **sha256 where the vendor publishes one.** For Ollama the job reads the asset's `sha256:` digest from the GitHub releases API and refuses a mismatch. Model files for ComfyUI are pinned to a Hugging Face revision and to the file's sha256 (the LFS object id). LM Studio and ComfyUI Desktop publish no hash, so for them the signature is the only check.
4. **Publisher signature before anything runs.**
   - **macOS:** the job mounts the DMG read-only with `-nobrowse`. It then runs `codesign --verify --deep --strict` on the `.app`, reads its `TeamIdentifier` from `codesign -dv`, and requires the pinned Team ID. It also requires `spctl --assess --type execute` to accept the app (notarized Developer ID).
   - **Windows:** `Get-AuthenticodeSignature` must report `Valid`, and the signer subject's CN must equal the pinned name.
   - Anything else (unsigned, ad-hoc signed, another team, another subject, a revoked certificate) is refused and the file is deleted.
5. **The vendor's documented install, with the OS in charge of rights.**
   - **macOS:** the verified `.app` is copied with `ditto` into `/Applications`, or into `~/Applications` when `/Applications` is not writable for the user. The copy's Team ID is verified again, and the image is detached.
   - **Windows:** the verified installer is opened with the shell like a double-click, never with silent or elevation flags. If it needs admin rights, Windows shows its own UAC prompt.
   - The app never calls `sudo`, `osascript … with administrator privileges` or `runas`.
6. **Models through the tool's own pull.**
   - Ollama: `POST /api/pull` on 127.0.0.1, through the existing adapter.
   - LM Studio: `lms get <model> --yes`. The model id comes from the app's list, never from free text.
   - ComfyUI: a verified download into the checkpoint folder that the running ComfyUI reports.
   - Voice models are fetched by mlx-audio itself on first use, which is the user's "Speak a test line" click.

**What is never done:** silent elevation, background or scheduled downloads, auto-updates of these tools, piping a script into a shell (`curl … | sh`), running an installer whose signature was not verified, or sending anything about the machine to anyone.

**Per-OS support.** In the matrix below, "Install" means one-click download, verify and install. "Page" means **Open the download page** only.

| Tool                    | macOS Apple Silicon             | macOS Intel             | Windows x64        | Windows arm64 | Linux         |
| ----------------------- | ------------------------------- | ----------------------- | ------------------ | ------------- | ------------- |
| LM Studio               | Install                         | not supported by vendor | Install            | Install       | Page          |
| Ollama                  | Install (+ sha256)              | Install (+ sha256)      | Install (+ sha256) | Page          | Page          |
| ComfyUI Desktop         | Install                         | not supported by vendor | Install            | Page          | Page          |
| Local voice (mlx-audio) | Guided: copy the command, Start | not supported           | not supported      | not supported | not supported |

Linux is page-only. The LM Studio and Comfy Desktop AppImages carry no signature and no published hash. Ollama's documented install extracts into `/usr` with `sudo` or pipes a script into a shell, and the trust model refuses both.

Local voice is guided, not one-click. mlx-audio is a Python package with no signed installer and no publisher identity to pin. Installing it pulls many packages from PyPI, and only their index hashes could be checked. The row therefore shows the exact command (`uv tool install mlx-audio`) and the vendor page, then detects and starts the server once it is installed.

**Hardware-based model recommendations.** `hardware.ts` reads total RAM, the platform and architecture, and VRAM from `nvidia-smi` when it is present. The text-model budget is:

- 70 % of RAM on Apple Silicon (unified memory);
- VRAM on a discrete NVIDIA GPU;
- otherwise half of RAM, labelled "runs on the CPU, slow".

Recommendations by budget:

| Budget        | Ollama                   | LM Studio                 |
| ------------- | ------------------------ | ------------------------- |
| 72 GB or more | `gpt-oss:120b` (65.4 GB) | `openai/gpt-oss-120b`     |
| 24 GB or more | `qwen3:30b` (18.6 GB)    | `qwen/qwen3-30b-a3b-2507` |
| 10 GB or more | `qwen3.5:9b` (6.6 GB)    | `qwen/qwen3.5-9b`         |
| less          | `qwen3.5:4b` (3.3 GB)    | `qwen/qwen3.5-4b`         |

Embeddings use `nomic-embed-text` (0.27 GB) in Ollama. LM Studio ships its own nomic embedding model. ComfyUI gets two offers, matching the default workflows:

- images: SDXL base 1.0 (6.9 GB, CreativeML Open RAIL++-M);
- video: LTX-Video 2B 0.9.8 distilled (6.3 GB, LTX-Video Open Weights License) plus the T5-XXL fp16 text encoder (9.8 GB, Apache-2.0), when the budget is 16 GB or more.

Ollama sizes come from the registry manifests. The LM Studio download depends on the variant `lms` picks and is shown as approximate.

**Vendor URL changes.** Every URL, host and identity lives in `catalog.ts`. If a vendor moves its downloads to a host outside the allowlist, changes its signing identity, or stops publishing a digest that was expected, the job fails with a message that names the cause. The row then offers **Open the download page**: a vendor page opened in the browser, never fetched by the app. Updating the catalog is a code change with this ADR's table as the record. A new signing identity is never accepted automatically.

## Consequences

- Cloud-only users never see a tool row and never download anything. Local users get one-click installs on macOS and Windows with a verified publisher.
- The pinned identities need maintenance. Ollama signs on macOS as "Infra Technologies, Inc" and Comfy as "Drip Artificial Inc". A rename or a new certificate breaks install until the catalog is updated. The fallback is the download page.
- What the vendors do not make verifiable:
  - LM Studio and ComfyUI Desktop publish no hashes, so for them integrity rests on the signature alone.
  - ComfyUI Desktop's DMG is not signed (only the app inside is).
  - Linux AppImages carry neither a signature nor a published hash.
  - mlx-audio has no publisher signature.
  - Recommended LM Studio model sizes depend on the variant `lms get` resolves.
  - Ollama's `/api/pull` checks layer digests against the registry manifest, but the manifest itself is not signed.
- Installed tools update themselves through their own updaters. The app does not manage versions after install.
- Tests use a local http server, fixture binaries and a recorded `codesign`/PowerShell output. They never download a real installer.
