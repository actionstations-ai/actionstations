# ADR-0048: Tracked changes in the plan's own Word file, and a memo for everything else

Date: 2026-10-29 · Status: Accepted · Issue: #431

## Context

An after-action report says "revise EOP section 6.4". The plan's owner works in Word and reviews
every change with Accept and Reject. The app keeps the imported original of each plan
(`documents/<id>/original.docx`) and its extracted text, so it can propose the wording and show
where it goes. A PDF, slide deck or spreadsheet has no paragraph model to mark up: its text is
extracted without runs or styles, so "tracked changes in a PDF" would be a new file nobody can
accept.

## Decision

- A proposal becomes real `w:del` / `w:ins` revisions in a **copy** of the plan's DOCX, authored
  "Action Stations" (or `redlines.author`), dated at export. Only words that change are marked:
  the excerpt is word-diffed against the proposal and the runs around the changed words keep
  their formatting. The original is never written; the copy goes to the folder the user chooses,
  never inside the project's `documents/` folder.
- Plans that are not Word files, and proposals whose text cannot be found in a body paragraph
  (table cells, text boxes, text split by fields), go into a change memo: a new DOCX (and
  optionally a PDF) that quotes the current text, the proposed text, the marked-up difference,
  the reason and the exercise that found it. The export says which proposals went where.
- XML is edited with `@xmldom/xmldom` (MIT, about 0.5 MB installed, no native code). It keeps
  namespaces, prefixes and attribute order, which Word checks; `fast-xml-parser` does not keep
  mixed content in order. `jszip` (already a dependency) reads and writes the package. No DTD or
  entity is read: a document that declares either is refused, and a package that inflates to more
  than 200 MB is refused. Only `word/document.xml` and the modified date in `docProps/core.xml`
  change; every other part is copied as it was.
- Proposed wording is checked: the quoted excerpt must be in the section's own text (whitespace
  and quote marks normalized) or the proposal is sent back once and then dropped; the proposal is
  labelled by the source check (#423) against the cited section.
- Nothing is applied to the imported text. When the organization updates its plan and the new
  version is linked to the old (`supersedesDocumentId`), the accepted proposals are read against
  the new text: applied, not applied, or needs review.

## Consequences

- Plan owners review changes where they already work. The word-level marks are short enough to
  read; a proposal that rewrites a sentence shows as several small revisions, which Word groups
  by author.
- Paragraph marks are never deleted: a proposal spread over two paragraphs puts its new words in
  the first and removes the old words from both, leaving the paragraph break for the plan's
  owner to remove. Tables, text boxes and fields are out of scope and fall back to the memo.
- `w:trackRevisions` is not set in `word/settings.xml`, so that file stays byte-identical;
  revisions show in Word's review pane without it.
- One new direct dependency (`@xmldom/xmldom`, already installed beneath `mammoth` at 0.8).
