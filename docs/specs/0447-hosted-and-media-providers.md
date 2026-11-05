# Spec 0447: Hosted model providers and cloud media generators

Issue: #634 (epic) · Milestone: 0.7.0 · Status: Draft · Related: ADR-0006, ADR-0007, ADR-0031, ADR-0068

## Summary

Users who do not run local models, or whose organization uses a cloud service other than Anthropic, can connect OpenAI, Google Gemini and the common OpenAI-compatible hosted services (OpenRouter, Mistral, Groq, DeepSeek, xAI, Together, Azure OpenAI) for text and embeddings, and cloud generators for media: ElevenLabs and OpenAI for voices, OpenAI and Gemini for images, and fal.ai and Replicate for images and video. Every one of them goes through the existing cloud gate: nothing leaves the computer until the user has set up that provider, and documents are redacted and approved as they are for Anthropic today.

## Requirements

### User stories

- As a facilitator whose organization pays for OpenAI or Gemini, I want to pick it from the provider list, paste a key and generate an exercise, without finding a base URL.
- As a facilitator without a GPU, I want realistic voices for radio calls and voicemails from ElevenLabs, with a different voice for each speaker.
- As a facilitator, I want short video injects from a cloud video model, and to see before a batch starts how many paid calls it will make.
- As an IT admin, I want every cloud provider to be visible as one, so I know what leaves our network and can turn it off.

### Functional requirements

**Text and embeddings**

- **FR-1 Presets.** The add-provider dialog lists, besides the current entries: **OpenAI**, **Google Gemini**, **OpenRouter**, **Mistral**, **Groq**, **DeepSeek**, **xAI**, **Together AI** and **Azure OpenAI**. Each preset fills the base URL, requires a key, marks the provider as cloud, and suggests a default model that the user can change; **Load models** lists what the key can use. Gemini uses Google's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`). The generic **OpenAI-compatible** entry stays for anything else.
- **FR-2 Hosted behavior.** For a cloud OpenAI-compatible provider the adapter: sends `max_completion_tokens` where the service requires it (OpenAI), sends no local sampling extras from model profiles (`top_k`, `min_p`, `chat_template_kwargs`, draft models) unless the profile is explicitly enabled, and skips the LM Studio retries. Structured output still tries `json_schema`, then `json_object`, then prompt-only, and remembers what worked (ADR-0007).
- **FR-3 Azure OpenAI.** The base URL is the deployment URL; the key goes in the `api-key` header; `api-version` is an option with a current default and is kept as a query parameter on every request.
- **FR-4 Prices.** **Advanced** in the dialog takes input and output prices per million tokens (optional). With prices, the jobs tray and the cost line show the estimated cost of a run, as they do for Anthropic; without, they show tokens only and say the price is not set.
- **FR-5 Embeddings.** OpenAI and Gemini presets can serve the **Embed** task (`text-embedding-3-small`, `gemini-embedding-001` as suggestions). Changing the embedding provider asks to rebuild the search index, as today.

**Media**

- **FR-6 The routed model reaches media generators.** The model chosen on a routing row for **Image**, **Video** or **Audio** is used for that task (today only text tasks pass it).
- **FR-7 Images.** OpenAI and Gemini presets can serve the **Image** task through the images endpoint (`gpt-image-*`, `gemini-2.5-flash-image` and newer; the model list decides). fal.ai and Replicate can serve it with any image model the user names. Image injects stay photographic: text-bearing injects keep using templates (project rule 5).
- **FR-8 Voices.** **ElevenLabs** serves the **Audio** task: the provider lists the account's voices; **Voices** in the dialog maps each speaker role to a voice (with a default for any other speaker); the model is selectable (multilingual by default). OpenAI's speech endpoint can serve **Audio** with a voice per speaker, and the dialog warns that OpenAI's current speech models are scheduled to shut down on January 6, 2027.
- **FR-9 Video.** **fal.ai** and **Replicate** serve the **Video** task with a model the user picks (suggestions in the dialog, any model id allowed). The generated still is sent as the starting image when the model takes one. The app maps its brief (prompt, negative prompt, duration, aspect ratio, starting image) to the model's input names through a small table of known models and an editable mapping for others. Jobs are submitted and polled until done, with progress in the jobs tray, cancel, and a timeout; the result is downloaded at once (both services delete outputs after a short time).
- **FR-10 Paid media confirmation.** Before a batch that will call a paid media provider, the app shows how many image, video and audio calls it will make per provider, with an estimated cost when a price per call is set in **Advanced**, and asks to continue. A setting turns the confirmation off per provider.
- **FR-11 Sound effects (optional).** ElevenLabs can also produce a short ambience or effect track from the brief's sound note when the inject asks for one; off by default.

**Everywhere**

- **FR-12 Cloud gate.** All new providers are cloud providers: they show the cloud badge, and their requests go through redaction, approval and the send log like Anthropic's (ADR-0031). **Never send documents** keeps document excerpts out of text requests, as for any cloud provider; media requests carry no excerpts, and their prompts are redacted and approved. The starting image is approved by its hash.
- **FR-13 Health and errors.** **Test connection** checks the key with a cheap call (model list or account endpoint), never a paid generation. Errors are shown in plain words: invalid key, no credit, model not available, rate limited (with the retry time), content refused by the service.

### Non-functional requirements

- **NFR-1 Cost:** the app adds no cost of its own; every paid call is to a service the user set up with their own key, and paid media needs a confirmation (FR-10). Live tests against paid services never run in CI and need `LIVE=1 LIVE_PAID=1` plus keys in the environment.
- **NFR-2 Privacy:** no SDKs; every request is made by the adapter with `fetch`; keys are stored with the operating system's encryption as today and never written to settings, logs or project files. Nothing is sent at startup.
- **NFR-3 Accessibility:** the new dialog sections (Advanced, Voices, model mapping) meet WCAG 2.2 AA like the rest of the dialog: labels, keyboard order, errors announced.
- **NFR-4 Provider-agnostic:** all calls go through adapters under `src/main/providers/` (project rule 4).

### Out of scope

- Google's native video API and OpenAI video: OpenAI's video API shut down on September 24, 2026 and the Gemini API's Veo 3.1 previews on October 22, 2026; cloud video comes through fal.ai and Replicate, which host current video models (Veo, Kling, Wan and others) behind one stable API.
- Gemini's native API for text (the OpenAI-compatible endpoint covers chat, structured output, streaming and embeddings).
- Speech-to-text in the cloud (hot wash transcription stays on this computer).
- Voice cloning in cloud services.

## Design

### Kinds and presets

- `ProviderKind` gains `elevenlabs`, `fal` and `replicate`. Hosted text services stay `openai-compatible`, distinguished by preset: the preset id is saved in `options.preset` (`openai`, `gemini`, `openrouter`, `mistral`, `groq`, `deepseek`, `xai`, `together`, `azure-openai`) and sets `options.network: 'remote'`, `options.modelProfile: 'off'` and, for OpenAI, `options.maxTokensParam: 'max_completion_tokens'`.
- `KEY_REQUIRED_KINDS` adds the three new kinds; presets mark their key as required.
- `provider-network.ts` treats the three new kinds as remote, like `anthropic`.

### openai-compatible changes (`src/main/providers/text/openai-compatible/`)

- `chat.ts`: `maxTokensParam`; LM Studio retries only for a local provider; profile extras only when the profile is on.
- `http.ts`/`apiBase`: keep query parameters (Azure `api-version`); `options.auth: 'api-key'` sends the key in `api-key` instead of `Authorization`.
- `images.ts` (new): `POST /images/generations` with `model`, `prompt`, `size`, `n: 1`; reads `b64_json` (or downloads `url`); writes a PNG in the job's folder; `createMedia` advertises `image` when `options.imageModel` is set or the image route names a model.
- `speech.ts`: `options.ttsModel` separate from the chat model; per-speaker voices from `options.voices`.

### New adapters (`src/main/providers/media/<kind>/adapter.ts`)

- **elevenlabs:** `GET /v1/voices` (list and health), `POST /v1/text-to-speech/{voice_id}?output_format=pcm_44100` with `xi-api-key`; PCM wrapped as WAV with the existing `wav.ts`; voice lines rendered in turn and joined as today's speech output is. Optional `POST /v1/sound-generation` for FR-11.
- **fal:** submit `POST https://queue.fal.run/{model}`, poll the returned status URL until `COMPLETED`, fetch the response URL, download the video or image URL in the result. `Authorization: Key <key>`. Starting image as a data URI.
- **replicate:** `POST /v1/models/{owner}/{name}/predictions` with `Prefer: wait=60`, then poll `GET /v1/predictions/{id}` until `succeeded`/`failed`/`canceled`; download output URLs with the token. Starting image as a data URI.
- **Input mapping** (`media/cloud-video/inputs.ts`): known models → field names (`prompt`, `negative_prompt`, `duration`/`duration_seconds`, `aspect_ratio`, `image_url`/`start_image`/`image`); `options.inputMap` overrides; unknown fields are not sent.
- **Polling** shares one helper with backoff (2 s → 15 s), the job's abort signal, and a timeout (15 min video, 3 min image).

### Media plumbing

- `MediaJob.model?: string`, set from the routing ref in `media-assets.ts` and the SimCell voice path.
- Paid-media confirmation: before `media-job.ts` starts a batch, it counts the calls per paid provider and asks the renderer (`media:confirm-batch`); the answer and the per-provider "don't ask again" setting are stored in settings.
- `guardMedia` hashes the request with the routed model instead of `defaultModel`.

### Renderer

- `catalog.ts`: the presets above; `KIND_LABELS` for the new kinds.
- `ProviderDialog.tsx`: **Advanced** (prices; per-call media price; Azure api-version; JSON mode override), **Voices** (ElevenLabs and OpenAI speech: speaker → voice, voice list loaded from the provider), **Video model inputs** (fal and Replicate: the mapping, prefilled for known models).
- The main-side options check stops rejecting option names that merely contain "token" (`maxTokensParam`), and still rejects anything that looks like a secret value.

### Docs

New user guides under `docs/guides/providers/`: `openai.md`, `gemini.md`, `hosted-services.md` (OpenRouter, Mistral, Groq, DeepSeek, xAI, Together, Azure), `elevenlabs.md`, `cloud-video.md` (fal.ai and Replicate). Written for users: what is sent, what it costs, how to set it up; no internal references. The providers overview gets a table of what each provider can do.

## Security and privacy

- New kinds are remote by kind; there is no way to mark them local.
- Keys: one per provider, OS-encrypted; sent only in the documented header to the provider's own host; never in URLs (fal and Replicate result URLs are fetched with the header, not a query key).
- Downloads: only from the provider's hosts or the URLs in its signed response; size limits (video 200 MB, image 30 MB, audio 50 MB); content type checked before writing.
- Media prompts can carry scenario details: they are redacted and approved by the gate before sending, as text prompts are.

## Testing

- Contract tests per adapter against recorded or documented responses: success, polling, failure, content refusal, invalid key, rate limit, cancel, timeout; a fake HTTP server for the polling adapters.
- openai-compatible: OpenAI `max_completion_tokens`, profile extras off, Azure header and query, images endpoint.
- Renderer tests for the new dialog sections; gate tests that the new kinds are remote and wrapped by the cloud gate.
- `LIVE=1 LIVE_PAID=1` live tests with the smallest request each service allows, never in CI.

## Tasks

1. **#635** Hosted text presets and openai-compatible fixes (FR-1–FR-5), Azure, Advanced prices; guides `openai.md`, `gemini.md`, `hosted-services.md`.
2. **#636** Media plumbing: routed model to media (FR-6), paid-media confirmation (FR-10), dialog Advanced/Voices scaffolding.
3. **#637** OpenAI and Gemini images, OpenAI speech voices (FR-7, FR-8 OpenAI part).
4. **#638** ElevenLabs adapter (FR-8, FR-11); guide `elevenlabs.md`.
5. **#639** fal.ai adapter for images and video (FR-7, FR-9); guide `cloud-video.md`.
6. **#640** Replicate adapter for images and video (FR-7, FR-9).

## Open questions

- **Keys for live checks.** The adapters are tested against documented responses; a run against the real services needs the owner's keys (OpenAI, Gemini, ElevenLabs, fal.ai, Replicate) in `~/.actionstations/secrets.env`. Recommendation: add them before the release that ships this, and run `LIVE_PAID=1` once.
