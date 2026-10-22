# Ollama

[Ollama](https://ollama.com) runs open-weight models locally with a small command-line server. The app talks to Ollama's native API (`/api/chat` with a JSON-schema `format`, `/api/embed`), so structured output works without extra settings.

Verified with Ollama 0.40.7 on macOS (Apple Silicon).

## 1. Install a current version

Install from [ollama.com/download](https://ollama.com/download) or with Homebrew (`brew install ollama`), then check the version:

```bash
ollama --version            # 0.40 or later
```

**On recent macOS releases, old Ollama builds do not work:** 0.18 failed to initialize Metal and could not run models on the GPU; 0.40.7 works. If `ollama run` reports a Metal or GPU initialization error, upgrade before anything else.

## 2. Start the server with a models folder and enough context

```bash
OLLAMA_MODELS=~/Models/ollama OLLAMA_CONTEXT_LENGTH=32768 ollama serve
```

- `OLLAMA_MODELS` keeps Ollama's blobs in their own folder. Do not share it with LM Studio's models folder (LM Studio stops indexing folders with more than about 7,000 files).
- `OLLAMA_CONTEXT_LENGTH` sets the default context window. Ollama otherwise chooses 4K, 32K or 256K depending on available VRAM, and the app's MSEL stage needs about 32K. You can instead set it per provider with the `numCtx` option (see [Advanced provider options](README.md#advanced-provider-options)).
- The macOS menu-bar app starts its own server; quit it first if you want to run `ollama serve` with your own environment.

## 3. Pull models

```bash
ollama pull qwen3:30b-a3b-instruct-2507-q4_K_M   # chat model for generation (19 GB)
ollama pull nomic-embed-text                      # embedding model (274 MB)
ollama list
```

Any chat model Ollama serves can be used. The suggested tag is the Ollama build of the model the LM Studio reference runs use (Qwen3-30B-A3B Instruct 2507); it was not run through a full scenario on Ollama for this guide. Mixture-of-experts models like it give the best speed for their quality on a laptop; very small models (1B to 3B) answer the connection test and short stages but are not good enough to write a full MSEL.

## 4. Connect it in the app

1. **Providers → Detect local services.** Ollama appears with its model count. Click **Add**.
2. The detected provider's default model is the first chat model in alphabetical order. Click **Edit** and set **Default model** to the model you pulled (the exact name from `ollama list`, including the tag, for example `qwen3:30b-a3b-instruct-2507-q4_K_M`).
3. Click **Test**. Measured with `qwen2.5:3b`: "OK" in 21 ms with the model loaded, 11.7 s when Ollama first had to load it.
4. In **Routing**, assign Ideation, Drafting and Critique (or only some of them) to Ollama.

Manual setup: **Add provider → Type: Ollama**, Base URL `http://127.0.0.1:11434`.

Ollama also exposes an OpenAI-compatible API at `http://127.0.0.1:11434/v1`. Prefer the native **Ollama** type: it passes the JSON schema and `num_ctx` directly.

## Troubleshooting

| Symptom                                                     | Fix                                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Detect says Ollama "Not found"                              | Start `ollama serve` (or the menu-bar app). `curl http://127.0.0.1:11434/api/version` should print the version.               |
| Metal / GPU initialization error, or generation on CPU only | Upgrade Ollama (0.18 failed on recent macOS; 0.40.7 works).                                                                   |
| `model "…" not found`                                       | The app's model name must match `ollama list` exactly, including the tag. `ollama pull` it first.                             |
| The first request is slow, later ones fast                  | Ollama loads the model on first use and unloads it after 5 minutes idle. Set `OLLAMA_KEEP_ALIVE=1h` when starting the server. |
| Long stages return truncated or invalid JSON                | Context too small: start the server with `OLLAMA_CONTEXT_LENGTH=32768`, or set `numCtx` on the provider.                      |
| Models are stored in the wrong place                        | `OLLAMA_MODELS` must be set in the environment of the server process, not the shell you run `ollama pull` in.                 |
