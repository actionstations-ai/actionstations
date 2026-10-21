# ADR-0005: Embeddings

Date: 2026-10-21 · Status: Accepted · Issue: #13

## Context

Hybrid retrieval (FTS5 + vectors) needs an embedding for every chunk. The app is local-first: it must not download models or call a network service unless the user asks. Tests and offline users still need vector search to work.

## Decision

- Embedders implement `EmbeddingProvider` (`src/main/providers/types.ts`) with fixed `dims`.
- **Default local embedder:** `@huggingface/transformers` running `Xenova/bge-small-en-v1.5` (384 dimensions) in a worker thread. The model is downloaded only on an explicit user action ("Download local embedding model") into Electron `userData`, never silently.
- **Provider embedders:** Ollama (`nomic-embed-text`) and any OpenAI-compatible `/v1/embeddings` endpoint, selectable through the `embed` task in provider routing.
- **Fallback and test embedder:** a deterministic feature-hashing embedder (384 dimensions, no model, no network). It is used when nothing else is configured and in all automated tests.
- The index records the embedder id and dimension; changing embedder triggers a re-embed.

## Consequences

- Retrieval always works, even on a fresh offline install; quality improves when the user opts into a real model.
- Tests are deterministic and need no model download.
- Switching embedders means re-embedding the whole project index.

## Status note (2026-10-21, #14)

Until #65 lands, the local ONNX embedder runs in the main process, not a worker thread. Batch size is 8: under Electron's runtime a batch of 32 full-length passages crashed the process while 8 and 16 did not. Measured on the NCIA plans (131 chunks), hybrid mode: "FIDS failure" ranks TIRP 13.6 first with both the hash embedder and bge-small; bge-small lifts ASP 6.4 for "access control failure fail unlocked" from 8th to 4th. Embedding 500 chunks: hash 82 ms, bge-small 5.9 s.
