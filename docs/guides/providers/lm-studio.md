# LM Studio

[LM Studio](https://lmstudio.ai) runs open-weight models locally and serves them through an OpenAI-compatible API. It is the reference text provider for this app: the sample scenario in `tests/fixtures/generate/sample-run/` was generated with it, and nothing leaves your computer.

Verified with LM Studio 0.4.26 on macOS (Apple Silicon, 128 GB) and the `lms` command-line tool it installs.

## 1. Install and choose a models folder

1. Install LM Studio from [lmstudio.ai](https://lmstudio.ai) and start it once. Install the `lms` CLI when it offers to (or from **Developer → Install lms CLI**).
2. **Use a dedicated, empty folder for models.** In **My Models**, set the models directory to a folder that only LM Studio uses, for example `~/Models/lmstudio`.

   LM Studio scans the whole models directory and stops indexing a folder that holds more than about 7,000 files. Pointing it at a shared folder (a Hugging Face cache, a folder that also holds Ollama blobs or ComfyUI models) leaves the model list empty or partial, and the app's model list with it. Keep other tools' models in their own folders (for example `~/Models/ollama`, `~/Models/huggingface`).

## 2. Download a model

Recommended for this app:

| Model                                  | Size  | Notes                                                                                                                            |
| -------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| `qwen/qwen3-30b-a3b-2507`              | 17 GB | Reference model. A full scenario (11 stages plus the revision pass) took 273 s on Apple Silicon with all 66 citations resolving. |
| `text-embedding-nomic-embed-text-v1.5` | 84 MB | Embedding model: route **Embeddings** to it and set Settings → Embeddings to "Configured provider".                              |

```bash
lms get qwen/qwen3-30b-a3b-2507
lms ls                      # lists downloaded models
```

Mixture-of-experts models such as Qwen3-30B-A3B are fast on a laptop because only about 3B parameters are active per token. Smaller dense models (7B to 14B) work for ideation but follow the long MSEL prompt less reliably.

## 3. Start the server and load the model with enough context

The app's MSEL stage sends up to about 30,000 input tokens per phase and asks for up to 7,000 output tokens. **Load models with a context length of at least 32,768.** A model loaded with LM Studio's default context length can be far smaller; check the CONTEXT column of `lms ps`. With too little context, long stages fail with truncated output.

```bash
lms server start            # or Developer tab → Start server (port 1234)
lms load qwen/qwen3-30b-a3b-2507 --identifier qwen3-30b-a3b-2507 --context-length 32768 -y
lms ps                      # IDENTIFIER, STATUS and CONTEXT of loaded models
```

`--identifier` sets the model name the API uses. The app sends whatever you type as the model, so the identifier and the app's **Default model** must match exactly.

### Just-in-time loading

With **Developer → Server settings → Just-in-Time model loading** on (the default), `/v1/models` lists every downloaded model, and a request for a model that is not loaded loads it first. That is convenient, but:

- the first request waits for the load (tens of seconds for a 17 GB model);
- a JIT load uses the model's default load settings, so **set the context length in the model's default settings** (in **My Models**, open the model's default load settings and set Context Length to 32768) or load it yourself with `lms load` as above;
- with "unload previous JIT model on load" on, routing two tasks to two different models makes LM Studio swap models back and forth. Route ideation, drafting and critique to the same model, or load both models up front.

## 4. Connect it in the app

1. **Providers → Detect local services.** LM Studio appears with its model count. Click **Add**.
2. The detected provider's **Default model** is the first chat model in alphabetical order, which is usually not the one you want. Click **Edit** on the LM Studio card, set **Default model** to `qwen3-30b-a3b-2507` (the identifier from step 3), and save.
3. Click **Test**. A working setup answers in well under a second once the model is loaded (measured: 265 ms, sample "OK").
4. In **Routing**, set **Ideation**, **Drafting** and **Critique** to LM Studio.

Manual setup instead of detection: **Add provider → Type: LM Studio**, Base URL `http://127.0.0.1:1234/v1`.

To use LM Studio on another machine on your network, enable serving on the local network in its server settings and use `http://<host>:1234/v1` as the base URL (prompts and document excerpts then travel over your network).

## Structured output

The app asks for JSON matching each stage's schema. For OpenAI-compatible servers it tries `response_format: json_schema` (strict) first, then `json_object`, then plain instructions, and remembers the first mode the server and model accept for the rest of the session. LM Studio supports `json_schema` for most models.

Reasoning models that think out loud (`<think>` blocks, gpt-oss channels) are supported; the reasoning is stripped before the JSON is parsed. With `openai/gpt-oss-20b` under `json_schema` mode, LM Studio can return a single truncated item ([#81](https://github.com/mdcrowley/tabletop-gen/issues/81)); use Qwen3-30B-A3B or set `jsonMode` to `json_object` for that provider (see [Advanced provider options](README.md#advanced-provider-options)).

## Troubleshooting

| Symptom                                                       | Fix                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Detect says LM Studio "Not found"                             | Start the server (`lms server start` or the Developer tab). Check `lms server status` reports port 1234.      |
| LM Studio's model list (and the app's) is empty or incomplete | The models folder is shared or too large. Point LM Studio at a dedicated folder (step 1).                     |
| `model not found` or LM Studio loads a different model        | The app's model name must equal the loaded **identifier** (`lms ps`), not the download key.                   |
| A stage stops mid-JSON or fails validation on long phases     | Context too small. Reload with `--context-length 32768` (and set it in the model's default settings for JIT). |
| First request after a pause takes a long time                 | JIT load or TTL unload. Preload with `lms load`, or raise the model's TTL.                                    |
| Machine runs out of memory                                    | Unload what you are not using: `lms unload --all`, then load one model.                                       |
