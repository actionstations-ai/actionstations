# Model profiles

Every model family has sampling settings its makers recommend. Action Stations keeps a table of
them (`src/shared/model-profiles.json`, checked by `src/shared/schemas/model-profile.ts`) and
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
| Qwen3.5, Qwen3.6      | temperature 1.0, top_p 0.95, top_k 20, min_p 0 | profile            | switch, on                   |
| Qwen3.8               | temperature 1.0, top_p 0.95, top_k 20, min_p 0 | profile            | effort, medium               |
| gpt-oss               | temperature 1.0, top_p 1.0                     | profile            | effort, medium               |
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

## Speculative decoding

LM Studio accepts a `draft_model` field. It is sent only when a draft model is named (by the
profile or `options.draftModel`) and the server's model list shows it installed; otherwise the
request is unchanged. The draft must share the main model's tokenizer.

## MLX on Apple Silicon

On a Mac, LM Studio runs MLX builds (format `safetensors` in `lms ls --json`) faster than GGUF
builds of the same model. Prefer them:

```bash
lms get https://huggingface.co/mlx-community/gpt-oss-120b-MXFP4-Q4
lms get https://huggingface.co/lmstudio-community/gemma-4-26B-A4B-it-MLX-4bit
```

The benchmark records the profile it used in each run file (`model.inference`), so runs with
and without a profile can be told apart. To run without it, set `BENCH_PROFILE=off`; to set
the reasoning level, `BENCH_EFFORT=low`; to name a draft model, `BENCH_DRAFT=<model id>`.
