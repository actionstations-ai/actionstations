# Providers and routing

A **provider** is a model or media service the app may call: a local LLM server, a cloud API, ComfyUI, or a local text-to-speech server. The app never contacts a provider you have not added, and nothing leaves your computer unless you add a remote one (Anthropic, or an OpenAI-compatible server on another machine).

| Guide                     | Provider type in the app | Used for                                      | Runs on                           |
| ------------------------- | ------------------------ | --------------------------------------------- | --------------------------------- |
| [LM Studio](lm-studio.md) | OpenAI-compatible        | Ideation, drafting, critique, embeddings      | macOS, Windows, Linux             |
| [Ollama](ollama.md)       | Ollama                   | Ideation, drafting, critique, embeddings      | macOS, Windows, Linux             |
| [Anthropic](anthropic.md) | Anthropic                | Ideation, drafting, critique                  | Cloud (API key, paid per token)   |
| [ComfyUI](comfyui.md)     | ComfyUI                  | Scene photos, short video clips, optional TTS | macOS (MPS), Windows/Linux (CUDA) |
| [Local TTS](local-tts.md) | OpenAI-compatible        | Voice: radio calls, voicemails, PA            | Apple Silicon (mlx-audio)         |

You need at least one text provider to generate scenarios. Everything else is optional: importing and searching documents works with no provider at all.

## Adding a provider

Open **Providers** in the sidebar.

- **Detect local services** probes LM Studio (`127.0.0.1:1234`), Ollama (`127.0.0.1:11434`) and ComfyUI (`127.0.0.1:8188`) on this computer only, with an 800 ms budget each, and offers **Add** for each one it finds.
- **Add provider** opens a form: **Type** (LM Studio, Ollama, Anthropic, OpenAI-compatible, ComfyUI), **Name**, **Base URL**, **Default model**, **API key** (Anthropic and OpenAI-compatible only) and **Enabled**.

![Detect local services](../images/detect-local.png)

Each provider card shows its reachability and latency, and has **Test** (a one-line chat request for text providers), **Edit** and **Remove**.

## Routing

The **Routing** table decides which provider and model each task uses:

| Task           | What it does                                                                  | Provider types offered                                 |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Ideation**   | "Give me ideas": scenario concepts from your documents.                       | Anthropic, OpenAI-compatible, Ollama                   |
| **Drafting**   | Overview, roles, phases, MSEL, handbook, rubric, briefing, hot wash, injects. | Anthropic, OpenAI-compatible, Ollama                   |
| **Critique**   | Reviews the draft; the MSEL is then revised from the findings.                | Anthropic, OpenAI-compatible, Ollama                   |
| **Embeddings** | Document embeddings when Settings → Embeddings is "Configured provider".      | OpenAI-compatible, Ollama                              |
| **Image**      | Photographic scene images (text-bearing media always use templates).          | ComfyUI                                                |
| **Video**      | Short clips animated from a scene image.                                      | ComfyUI                                                |
| **Audio**      | Voice lines for radio calls, voicemails and PA announcements.                 | OpenAI-compatible ([Local TTS](local-tts.md)), ComfyUI |

The **Model** column overrides the provider's default model for that task; leave it empty to use the default. A common setup is a strong model for drafting and critique and a faster one for ideation, or a cloud model only for critique.

![Providers and the routing table](../images/providers-routing.png)

**Project routing.** Each project has its own **Provider routing** page (project sidebar). A task set there overrides the global row for that project only; tasks left unassigned fall back to the global routing. Use it to keep one sensitive project on local models while others use a cloud model.

**What each prompt uses.** Every prompt file names its task (`task: ideate | draft | critique`); see [Prompts](../prompts.md).

## Embeddings

Search and retrieval for generation use embeddings, chosen under **Settings → Embeddings**:

| Mode                               | Status in this build                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keyword hashing** (default)      | Works offline, no download, about half a second to index the six NCIA reference documents. Use this.                                                                                                                                                                                                                                    |
| **Local model (on this computer)** | Better on paraphrase. The model (`Xenova/bge-small-en-v1.5`, 133 MB) is downloaded once by the setup wizard's **Search quality** step (**Settings → Run setup again**); choosing this mode in Settings alone does not download it, and Documents then shows "Not ready" ([#114](https://github.com/mdcrowley/tabletop-gen/issues/114)). |
| **Configured provider**            | Uses the provider and model on the **Embeddings** row of **Providers → Routing** (a project's own routing overrides it). Tested with LM Studio `text-embedding-nomic-embed-text-v1.5` and Ollama `nomic-embed-text` (768 dimensions each). The Embeddings row shows whether this mode is active and links to Settings.                  |

After changing the mode or the Embeddings routing, press **Rebuild index** on the project's Documents page. When the new embedder has different dimensions (384 for keyword hashing, 768 for nomic-embed-text), the stored vectors are dropped and rebuilt.

## Where settings and keys are stored

- Providers, routing and other preferences: `settings.json` in the app's data folder (Electron's `userData`), never in project folders.
- API keys: encrypted with the operating system's keychain through Electron `safeStorage` into `secrets.json` in the same folder (ciphertext only, owner-only permissions). Keys are never written to `settings.json`, project folders or logs, and never sent to the window. If the OS cannot encrypt (for example Linux without a keyring), the app refuses to store keys.
- Metering: one line per call in `provider-calls.jsonl` (model, tokens, duration, estimated cost for Anthropic). Never prompt text, never keys.

### Advanced provider options

A few per-provider options have no form field yet. Quit the app, edit the provider's `options` object in `settings.json`, and start the app again:

| Option                                         | Providers                 | Meaning                                                                                             |
| ---------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `timeoutMs`, `maxTokens`                       | all                       | Request timeout and output cap.                                                                     |
| `jsonMode`                                     | OpenAI-compatible         | Force `json_schema`, `json_object` or `prompt` structured output (default: negotiated, best first). |
| `headers`                                      | OpenAI-compatible         | Extra request headers (not secrets; use the API key field for those).                               |
| `inputUsdPerMTok`, `outputUsdPerMTok`          | OpenAI-compatible         | Prices for the cost estimate in the call log.                                                       |
| `embeddingDims`                                | OpenAI-compatible, Ollama | Embedding size when the server does not report it.                                                  |
| `ttsModel`, `voice`, `voices`, `speakerGapSec` | OpenAI-compatible         | Text-to-speech model, default voice, per-speaker voices, gap between speakers.                      |
| `numCtx`                                       | Ollama                    | Context window sent as `num_ctx`.                                                                   |
| `anthropicVersion`, `effort`, `fallbacks`      | Anthropic                 | API version header, effort level (default `high`), server-side model fallbacks.                     |

## Offline development

Launch with `TTX_MOCK_PROVIDERS=1` to add a built-in mock provider and route every task to it when routing is empty. It returns schema-valid output instantly; the e2e tests use it.

## General troubleshooting

| Symptom                                                               | Cause and fix                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Detect local services** says "Not found"                            | The service is not running, or listens on a different port or interface. Start it, or add it by hand with **Add provider**.                                              |
| Generate shows "No text model is set up for generation"               | Route Ideation, Drafting and Critique to an enabled provider. The same banner also appears when the embedder fails (see the message after it).                           |
| A stage fails with "Output did not match … after 1 repair attempt(s)" | The model could not produce valid JSON for that stage. Use a stronger model for Drafting, raise the context length, then **Continue from failure** on the scenario page. |
| A stage fails on a long prompt or the output stops mid-JSON           | The model's context window is too small. MSEL phases send up to about 30,000 input tokens; load models with at least 32K context.                                        |
| Provider card shows an error after an upgrade                         | **Edit** the provider and check the base URL, then **Test**.                                                                                                             |
