# ADR-0031: One outbound gate at provider resolution, with keyed deterministic placeholders

Date: 2026-10-28 · Status: Accepted · Issue: #433 · Spec: [0433](../specs/0433-cloud-preview-and-redaction.md)

## Context

Users who route a task to a cloud model (Anthropic today, any OpenAI-compatible endpoint, a remote Ollama or ComfyUI) need to see what leaves the computer before it goes, approve it, and keep people's names, phone numbers, emails and addresses away from the vendor. Requests come from many places (every pipeline stage, inject text, media briefs, critique, embeddings during ingest and retrieval, image, video and voice generation), and new adapters keep arriving. A check inside each caller or each adapter would be missed sooner or later.

## Decision

**One gate where providers are built.** `src/main/providers/resolve.ts` is the only place callers get text, embedding and media providers. When `isRemoteProvider(config)` is true (kind `anthropic`, or a base URL host that is not loopback, unless the user marks a LAN host "On my network, treat as local"), the provider it returns is wrapped by `src/main/providers/outbound/gate.ts`. Local providers are returned unwrapped, so they do no gate work at all. Adapters are unchanged. An ESLint rule forbids building providers from the registry or adapter modules outside `src/main/providers/`, and a test enumerates every adapter kind and task and asserts that a remote config always comes back wrapped. The Providers page connection tests and the Workflows page test renders use an ungated path: they send fixed sample text, never project content.

**Job context without plumbing.** The job manager runs each job inside an `AsyncLocalStorage` scope (`src/main/jobs/scope.ts`), so the gate knows the job and project of an embedding batch or a media render without every caller passing it. `runStage` also attaches the retrieved excerpts (`ChatRequest.outbound`), which the gate strips before the adapter runs.

**Approval bound to bytes.** The gate builds a manifest of the request as it will be sent and a SHA-256 over the request body and destination. The user's decision must echo that hash, and the gate re-hashes the exact object it hands to the adapter before sending. A repair round or a settings change is a different request.

**Keyed deterministic placeholders.** Each detected value becomes `[[CATEGORY_XXXX]]`, XXXX being base32 of HMAC-SHA256(project key, category + normalized value). The same value gets the same placeholder in every request of the project, so stages see a consistent cast and prompt caching keeps working. The 32-byte key is kept with the API keys in `safeStorage`, never in the project folder. The placeholder-to-value mapping exists only in main-process memory for the app session; replies are restored on this computer. Embedding and media requests are previewed and approved but never redacted: redacted embeddings would degrade search for good, and images or audio cannot be mapped back.

**A record without content.** Every cloud request appends one line to `<project>/cloud-sends.jsonl`: time, provider, host, model, task, stage, document ids and heading paths, sizes, redaction counts, how it was approved and the request hash. No text, no values, no mapping.

## Consequences

- Any future adapter is covered by construction; a remote Ollama or ComfyUI is gated the day it is configured.
- Detection is pattern-based and misses things (an all-caps name, a nickname). The dialog says so, shows the unredacted value next to each placeholder, and the Always-redact list fixes repeat misses. Machine-learning detection can be added later behind the same detector interface.
- On a computer without the project's key (or without an OS keychain) placeholders are spelled differently; nothing else changes.
- The send log travels with the project folder and names section headings, which is the point: it answers "what did we send about this project".
