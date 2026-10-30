# Benchmarking local models

The benchmark measures how well a free local model does the work Action Stations asks of it,
on your own computer, and produces a result file you can submit so the published table
(`docs/benchmarks/`) and the per-memory recommendations grow. It costs nothing: it runs only
against LM Studio or Ollama on this machine, with no cloud model and no cloud judge.

It drives the built app headless through the same IPC the screens use, in a throwaway settings
folder, so your own settings, projects and API keys are never read or changed.

## What it runs

Three tasks, on the fictional example projects that ship with the app (`examples/`):

| Task     | What the model does                                                                                                                                                                           | How it is scored                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ideation | Proposes six scenario ideas from an example's plans                                                                                                                                           | Valid ideas, no near-duplicates, cited sections that resolve, spread of threat families, the source check on why each idea teaches                                                     |
| Drafting | Writes a scenario from a fixed brief: overview, roles, phases, every MSEL phase, the documents and the review pass (no injects or media)                                                      | Stages that succeed, the app's own lint checks, citations (resolved, coverage, and rows the source check labels grounded), a structure rubric drawn from the Scenario 3 reference MSEL |
| Critique | Reviews a hand-corrected example scenario with planted defects (an out-of-order row, a duplicate, a missing decision point, an unknown facility identifier, an implausibly fast restoration…) | Share of planted defects a note finds, minus notes on rows with nothing wrong                                                                                                          |

Every score is 0 to 100 and computed without a model. The overall score weights drafting 0.5,
critique 0.25 and ideation 0.25. The cases, weights and thresholds are in
`bench/suites/quick.json` and `bench/suites/standard.json`; the planted defects are in
`bench/defects/`.

Two suites:

- **quick**: one case per task on the City of Millbrook water corpus, plus a second critique
  case. A check that a model works at all; under an hour for a 9B model on a 32 GB Mac.
- **standard**: three corpora, five briefs and six critique cases, three repeats with fixed
  seeds (11, 23, 37). This is the suite the published table uses; plan for an evening.

## Before you start

1. Build the app: `pnpm install` then `pnpm build:app`.
2. Start LM Studio or Ollama and have the model you want to test downloaded.
3. Give the model a **32K context**. The suites run at 32,768 tokens, which the MSEL stage needs.
   - Ollama: nothing to do; the benchmark sets `num_ctx` for each request.
   - LM Studio: load the model with `lms load <model id> --context-length 32768 -y`. The
     benchmark warns when the loaded context is smaller, and long stages then fail and count
     against the model.

## Run it

```bash
pnpm bench -- --models ollama:qwen3.5:9b --suite quick
pnpm bench -- --models lmstudio:qwen/qwen3.5-9b,ollama:qwen3:30b --suite standard
```

| Option                    | Meaning                                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--models <ref,…>`        | `ollama:<name from ollama list>` or `lmstudio:<model id from lms ls>`                                                                                                                                                                     |
| `--suite quick\|standard` | Default `quick`                                                                                                                                                                                                                           |
| `--repeats N`             | 1 to 3; default from the suite (quick 1, standard 3)                                                                                                                                                                                      |
| `--out <dir>`             | Where run files and the generated projects go; default `.tmp/bench`                                                                                                                                                                       |
| `--base-url <url>`        | A non-default port of LM Studio or Ollama, still on 127.0.0.1                                                                                                                                                                             |
| `--embedder local\|hash`  | `local` (default) searches the plans with the bge-small-en-v1.5 model the app uses, downloaded once (about 130 MB) into `.cache/bench/models` after you confirm; `hash` runs fully offline with weaker search and is marked in the result |
| `--yes`                   | Confirm the one-time embedder download without a prompt                                                                                                                                                                                   |
| `--resume`                | Continue after an interruption from `<out>/state.json`                                                                                                                                                                                    |
| `--clean`                 | Delete the generated projects in `<out>/work/` after the run                                                                                                                                                                              |

| `--judge lmstudio:<model>` | Optional local judge: scores how plausible up to 30 cited MSEL rows are, quoting the row and passage (a score with a quote that is not in the text is dropped). Local models only, off by default, never part of the overall score. The scores are marked publishable only when the judge agrees with the maintainer's human-scored rows in `bench/calibration/rows.json` (weighted kappa 0.6 or more, 60 rows); without that file they are kept but marked unpublished |
| `--determinism` | Runs two repeats at the same seed and reports whether their scores and lint counts match (replaces `--repeats`) |

Judge scores and the determinism result appear in the run file (`judge`, `determinism`) and
the terminal summary.

The benchmark refuses any endpoint that is not on this machine; there is no option to allow
one. It also refuses to run when prompt overrides are present, so every run uses the shipped
prompts. After the first case it prints an estimate of the time left.

When a model finishes, the terminal shows a short table and the path of its run file,
`<date>-<model>-<machine>.json`. The generated projects stay in `<out>/work/` so you can open
them in the app and see what the model wrote.

## Read the result

- **Median** per task and overall: with repeats, the middle of the repeats.
- **Range**: the lowest and highest overall score over the repeats. A range wider than 15 points
  is marked **unstable**.
- **Drafting reliability**: the share of pipeline stages that succeeded. A stage that fails
  after its repair round is recorded in `failures` with the error, and the case goes on as far
  as the app allows.
- `details` in each task holds per-case scores, lint counts per code, the structure items that
  passed and the planted defects found or missed.

## Submit a run

Run files hold scores, model metadata (name, quantization, size, digest) and coarse hardware
(platform, chip or GPU name, RAM and VRAM rounded to GB). They never hold a host name, user name
or file path, and the report refuses a file that does.

1. Run the **standard** suite with the local embedder.
2. Copy the run file to `docs/benchmarks/runs/`.
3. Run `pnpm bench:report`. It validates every run file, merges runs of the same model and
   writes `docs/benchmarks/model-benchmarks.json` and the tables in
   `docs/benchmarks/README.md`.
4. Open a pull request with the run file and the regenerated report. The maintainer reruns any
   run that would change a recommendation before merging it.

Runs from another suite version or scoring version are kept but listed as archived, never
ranked with the current ones. Changing a case, weight or threshold in a suite file bumps its
`suiteVersion`.

## Recommendations per memory size

For each memory tier of the setup screen (under 10 GB, 10–24 GB, 24–72 GB, 72 GB and up), the
report recommends the model with the highest median overall score that fits the smallest
machine in the tier and passes the floor: every task at least 50, drafting reliability at least
90%, and stable. "Fits" is the size on disk plus an estimate of the context cache (a tenth of
the weights at 32K); the lowest tier assumes 5.5 GB. A tier with no such model says so. The
setup recommendations in the app are updated by hand from this report.

## Smoke test

`pnpm e2e` includes `e2e/bench-smoke.spec.ts`, which runs the quick suite against the app's
in-process mock provider (about a minute) and validates the run file. It needs no model.
