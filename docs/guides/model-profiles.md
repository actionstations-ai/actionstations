# Model profiles

Every model family has sampling settings its makers recommend. Action Stations keeps a table of
them and
applies the matching profile to every request an OpenAI-compatible server (LM Studio, vLLM,
llama.cpp) or Ollama receives. A model with no profile is called exactly as before.

## What a profile holds

| Field               | Meaning                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `match`             | Case-insensitive pattern tested against the model id; the first profile that matches is used |
| `sampling`          | `temperature`, and `top_p`, `top_k`, `min_p` where the card gives them                       |
| `source`            | The Hugging Face `generation_config.json` and model card the numbers come from               |
| `temperaturePolicy` | How the card's temperature combines with the prompt's per-stage temperature (below)          |
| `reasoning`         | `effort` (low, medium, high), `switch` (thinking on or off) or `none`, and the default level |
| `draftModel`        | Optional small model of the same family for speculative decoding                             |

| Family                | Sampling from the card                         | Temperature policy | Reasoning                    |
| --------------------- | ---------------------------------------------- | ------------------ | ---------------------------- |
| Qwen3 Thinking (2507) | temperature 0.6, top_p 0.95, top_k 20, min_p 0 | profile            | always on                    |
| Qwen3 Instruct (2507) | temperature 0.7, top_p 0.8, top_k 20, min_p 0  | stage              | none                         |
| Qwen3.5               | temperature 1.0, top_p 0.95, top_k 20, min_p 0 | profile            | switch, off (measured)       |
| Qwen3.6               | temperature 1.0, top_p 0.95, top_k 20, min_p 0 | profile            | switch, on                   |
| Qwen3.8               | temperature 1.0, top_p 0.95, top_k 20, min_p 0 | profile            | effort, medium               |
| gpt-oss               | temperature 1.0, top_p 1.0                     | stage              | effort, medium               |
| Gemma 4               | temperature 1.0, top_p 0.95, top_k 64          | profile            | none (the card uses a token) |
| GLM-4.7               | temperature 1.0, top_p 0.95                    | stage              | none                         |
| Nemotron 3.5          | temperature 1.0, top_p 0.95                    | profile            | switch, on                   |

The Qwen cards also list `presence_penalty` (0 to 1.5). It is left out: a presence penalty
discourages repeating a token, and the JSON the stages return repeats the same keys on every row.

## Profile temperature and stage temperature

Prompt files set a temperature per stage (0 for the four checking stages, up to 0.8 for
creative ones). The two combine like this:

- **`profile`**: the card's temperature is always used. For the Qwen thinking models, gpt-oss,
  Gemma 4 and Nemotron the card warns that greedy or near-greedy decoding loops or degrades
  reasoning, so a stage's 0 would hurt the model it is meant to steady. Stages that need
  repeatable output still get it from the fixed seed (`options.seed`) and from structured output.
- **`stage`**: the stage's temperature is used when it sets one; the card's value is the
  fallback. For models whose cards allow lower temperatures (Qwen3 Instruct, GLM-4.7, whose card
  uses 0 for some tasks).

`top_p`, `top_k` and `min_p` always come from the profile.

## Output cap and reasoning

A stage's `maxTokens` in `prompts/*.md` is sized for the answer. A thinking model spends part of
the same budget on reasoning, so when a profile's `reasoning.tokens` is set and thinking is on,
that figure (halved at low effort, doubled at high) is added to the stage cap. The request is
then limited to what the model's context window leaves after the prompt (the window comes from
the provider's model list; if it is not listed, no limit applies). If a reply still stops at the
length limit, the stage asks once more with a doubled cap (at most 12,000 tokens more, and never
past the context) and logs the retry.

## Provider options

Set these in the provider's `options` (they are not in the settings screen: they suit a
benchmark or a power user, and the defaults are what most people want).

| Option            | Values                               | Effect                                              |
| ----------------- | ------------------------------------ | --------------------------------------------------- |
| `modelProfile`    | `"off"`                              | Ignore profiles: only the stage temperature is sent |
| `reasoningEffort` | `off`, `on`, `low`, `medium`, `high` | Overrides the profile's reasoning default           |
| `draftModel`      | a model id, or `"off"`               | Draft model for speculative decoding                |

How reasoning reaches the server:

- Effort models (gpt-oss, Qwen3.8): `reasoning_effort` on OpenAI-compatible servers, `think`
  with the level on Ollama.
- Switch models (Qwen3.5, Qwen3.6, Nemotron 3.5): `chat_template_kwargs.enable_thinking` on
  OpenAI-compatible servers, `think: true | false` on Ollama.

## Measured defaults

Quick suite, one run each, Apple M-series with 128 GB, 32K context, seed 11. One case per task,
so treat differences of a few points as noise; the standard suite should confirm these.

| Model and setting                                    | Overall | Drafting reliability   | Wall time (s) |
| ---------------------------------------------------- | ------- | ---------------------- | ------------- |
| Qwen3.5-9B MLX, old settings (thinking on)           | 62.6    | 100% (2 stages failed) | 1486          |
| Qwen3.5-9B MLX, card sampling, thinking on           | 63.2    | 100%                   | 1034          |
| Qwen3.5-9B MLX, card sampling, thinking off          | 66.6    | 100%                   | 1380          |
| gpt-oss-120b MLX, old settings                       | 54.3    | 58%                    | 231           |
| gpt-oss-120b MLX, card sampling, medium effort       | 41.5    | 58%                    | 186           |
| gpt-oss-120b MLX, card sampling, low effort          | 41.9    | 58%                    | 190           |
| gpt-oss-120b MLX, card sampling, high effort         | 49.8    | 55%                    | 171           |
| gpt-oss-120b MLX, stage temperature + top_p, medium  | 46.6    | 55%                    | 171           |
| gpt-oss-120b GGUF, stage temperature + top_p, medium | 67.3    | 100%                   | 1436          |

What this decided:

- **Qwen3.5 thinks off by default.** Critique scored 44 with thinking off against 32 and 15 with
  it on, and the old settings (greedy stages, thinking on) lost two stages to replies cut off at
  the length limit. This is a single case; set `reasoningEffort` to `on` to turn thinking back on.
- **gpt-oss temperature stays the stage's.** Forcing the card's 1.0 on every stage did not score
  higher than the old settings; the profile adds the card's `top_p`.
- **gpt-oss reasoning effort stays at the card's medium.** Low, medium and high scored within
  noise of each other and ran in the same time on MLX.
- **gpt-oss-120b uses the GGUF build.** The MLX build completed only 55 to 58% of drafting stages
  in every setting, the GGUF build all of them, so its profile has `preferredBuild: gguf` with the
  reason. Other families prefer MLX unless a profile says otherwise.
- **No profile names a draft model.** LM Studio refuses speculative decoding for MLX models
  ("not supported for batched MLX models"), which is why the first Qwen draft run failed every
  stage. The adapter now repeats such a request without `draft_model` and stops sending it. With
  a GGUF target (gpt-oss-120b with gpt-oss-20b as the draft) scores and wall time matched the run
  without a draft (67.3 in 1425 s against 67.3 in 1436 s), so no speedup was measured.

Tokens per second were not recorded by the benchmark; wall time is the speed measure.

## Speculative decoding

LM Studio accepts a `draft_model` field. It is sent only when a draft model is named (by the
profile or `options.draftModel`) and the server's model list shows it installed; otherwise the
request is unchanged. The draft must share the main model's tokenizer.

## MLX on Apple Silicon

On a Mac, prefer the MLX build (format `safetensors` in `lms ls --json`) unless the model's profile
says otherwise (`preferredBuild`; gpt-oss-120b is measured better as GGUF, see above):

```bash
lms get https://huggingface.co/mlx-community/gpt-oss-120b-MXFP4-Q4
lms get https://huggingface.co/lmstudio-community/gemma-4-26B-A4B-it-MLX-4bit
```

The benchmark records the profile it used in each run file (`model.inference`), so runs with
and without a profile can be told apart. To run without it, set `BENCH_PROFILE=off`; to set
the reasoning level, `BENCH_EFFORT=low`; to name a draft model, `BENCH_DRAFT=<model id>`.
