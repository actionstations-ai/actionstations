# ADR-0030: HSEEP documents as shared blocks; the MSEL workbook with exceljs

Date: 2026-10-28 · Status: Accepted · Issue: #420

## Context

The HSEEP document set (Exercise Plan, Situation Manual in two editions, Controller/Evaluator Handbook in HSEEP order) has to come out as PDF and Word with the same sections in the same order, and reviewers expect the MSEL as an Excel workbook they can sort and filter. `exceljs` is already a dependency (the XLSX ingest parser) and ships in the asar.

## Decision

- Each HSEEP document is built once as a list of blocks (`src/main/export/hseep/`: headings, paragraphs, fact tables, lists, tables, markdown) in HSEEP order. One template (`templates/export/hseep.html`) renders the blocks for PDF and preview; `hseep/docx.ts` renders the same blocks to Word. A blank exercise detail is an empty string in the blocks and prints as a fill-in line in both formats.
- The MSEL workbook is written by `src/main/export/xlsx.ts` with exceljs: every cell a plain string, no formulas, macros or external links; text that starts with `=`, `+`, `-`, `@`, tab or CR gets a leading space so no spreadsheet evaluates it. `tableWorkbook()` is the shared writer for later tables (the AAR's Improvement Plan, #419).
- Evaluation content (EEGs, Core Capabilities, critical tasks, #421) is read through one adapter, `src/main/export/evaluation.ts` (`evaluationOf()`), which turns `scenario.evaluation` into what the documents print. A scenario without guides prints fill-in lines and "not prepared yet" notes instead.
- Exercise details live in `scenario.json` under `conduct` (optional, read through `conductOf()`), so existing scenarios load unchanged and no format version bump is needed. The `sitman` stage never receives them.

## Consequences

- PDF and Word cannot drift apart: a section added to the blocks appears in both.
- The three HSEEP documents share one template instead of three; the spec's `explan.html`, `sitman.html` and `handbook-hseep.html` are one `hseep.html`.
- The workbook layout (19 columns, in order) is fixed by `MSEL_COLUMNS`; a later Excel MSEL import reads the same layout.
