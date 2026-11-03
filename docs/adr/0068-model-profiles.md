# ADR-0068: Per-model inference settings come from a profile table

## Context

Prompt files set one temperature per stage and nothing else was sent. Model cards disagree with
that: Qwen thinking models want temperature 0.6 to 1.0 with top_p 0.95 and top_k 20 and warn that
greedy decoding loops (four stages use temperature 0); gpt-oss wants temperature 1.0 and top_p
1.0. Reasoning effort and speculative decoding were not reachable at all.

## Decision

- A table of model families (`src/shared/model-profiles.json`, schema in
  `src/shared/schemas/model-profile.ts`) holds the card's sampling, the source URL, reasoning
  support and default, and an optional draft model. The first profile whose pattern matches the
  model id applies.
- `resolveInference` (`src/shared/model-profiles.ts`) combines it with the stage temperature: a
  profile marked `profile` always wins on temperature; one marked `stage` keeps the stage value.
  Unknown models, and providers with `options.modelProfile = "off"`, get the stage temperature only.
- The OpenAI-compatible and Ollama adapters apply the result (`top_p`, `top_k`, `min_p`,
  `reasoning_effort` or `chat_template_kwargs.enable_thinking`, `draft_model`; Ollama `options` and
  `think`). The draft model is sent only when the server lists it as installed.
- Defaults follow the quick-suite measurements in `docs/guides/model-profiles.md`: gpt-oss keeps the stage temperature and prefers GGUF, Qwen3.5 thinks off. No profile names a draft model.
- The benchmark records the profile in each run file.

## Consequences

- Output from the same prompts changes for known families (more varied, as the cards intend).
  Fixed seeds still make a run repeatable on one machine.
- Adding a family is a data change plus a test. The numbers must cite the card.
- The table must be kept current as model families ship; a stale entry is bounded to its pattern.
