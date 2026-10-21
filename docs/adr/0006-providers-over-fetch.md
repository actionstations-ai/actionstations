# ADR-0006: Provider adapters over fetch

Date: 2026-10-21 · Status: Accepted · Issue: #18

## Context
The app talks to Anthropic, OpenAI-compatible servers (LM Studio, Ollama `/v1`, vLLM, OpenRouter, OpenAI), Ollama's native API and ComfyUI. CLAUDE.md requires every call to go through `src/main/providers/*` and every adapter to have a recorded-fixture contract test plus an opt-in live test. Vendor SDKs differ in streaming, retry and transport behavior, and they make fixtures harder to record and replay.

## Decision
- All adapters are written on the platform `fetch` plus small in-house parsers for SSE and NDJSON streams. No vendor SDKs.
- Each adapter lives in `src/main/providers/<kind>/` and implements `TextProvider`, `EmbeddingProvider` or `MediaProvider`.
- Contract tests replay recorded HTTP fixtures; `LIVE=1` enables live tests against a configured endpoint.
- Shared retry/backoff and `provider_calls` logging (tokens, cost, latency) wrap every adapter.
- Anthropic defaults: `claude-opus-5-5` for ideation and critique, `claude-sonnet-5-5` for drafting; both overridable in provider routing.

## Consequences
- One transport to mock; fixtures are plain request/response files.
- We maintain our own request shapes and track API changes ourselves.
- No hidden network calls from SDK internals.
