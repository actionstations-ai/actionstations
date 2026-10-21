# ADR-0007: Structured output from LLMs

Date: 2026-10-21 · Status: Accepted · Issue: #25

## Context
Every generation stage produces JSON validated against a zod schema (scenario overview, phase plan, MSEL rows, inject fields). Providers vary: Anthropic supports tool use, some OpenAI-compatible servers support `response_format: json_schema`, and many local models support neither.

## Decision
Per call, use the strongest mechanism the provider supports:
1. **Anthropic:** one forced tool whose `input_schema` is the stage schema (zod converted to JSON Schema).
2. **OpenAI-compatible:** `response_format: { type: "json_schema" }` when the server advertises it.
3. **Fallback:** instruct the model to answer in a single fenced `json` block, extract it, parse.

The result is always parsed with the stage's zod schema. On failure, one repair round sends the validation errors back to the model; if that also fails, the stage stops and shows the error and raw output to the user.

## Consequences
- Stages are provider-agnostic; the pipeline only sees validated objects.
- Local models work, with more repair rounds expected.
- Wire schemas stay within the JSON Schema subset all three paths handle; zod refinements run only after parsing.
