// The change memo (#431, FR-5): for plans that are not Word files, and for proposals whose
// paragraphs could not be marked, a document that quotes the current text, the proposed text
// and the marked-up difference, with the reason and the exercise that found it, so the plan's
// editors can apply it by hand. A new DOCX (same styles as the other exports) and a PDF of the
// same content.
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
  type ParagraphChild,
} from 'docx'
import type { Redline } from '@shared/schemas'
import { wordDiff, type DiffOp } from '@shared/redline/diff'
import { heading2, run, table } from '../export/docx'
import { escapeHtml } from '../export/escape'

export interface MemoEntry {
  redline: Redline
  /** Why this proposal is in the memo rather than marked in the plan. */
  reason: string
  /** Corrective action labels ("CA-0007") or the AAR/IP's own action texts. */
  actions: string[]
}

export interface MemoModel {
  orgName: string
  planTitle: string
  /** "Imported 2026-03-02" or the plan's version, whichever is known. */
  planVersion: string
  exercise: string
  date: string
  entries: MemoEntry[]
}

const DEL_COLOR = 'B42318'
const INS_COLOR = '0B5CAD'

export const memoOps = (e: MemoEntry): DiffOp[] =>
  wordDiff(e.redline.originalExcerpt, e.redline.proposedText)

/** Runs for the marked-up paragraph: struck-through red for deleted words, underlined blue for new ones. */
function markedRuns(ops: DiffOp[]): ParagraphChild[] {
  return ops.map((op) =>
    op.kind === 'equal'
      ? new TextRun({ text: op.text })
      : op.kind === 'del'
        ? new TextRun({ text: op.text, strike: true, color: DEL_COLOR })
        : new TextRun({
            text: op.text,
            underline: { type: UnderlineType.SINGLE },
            color: INS_COLOR,
          }),
  )
}

const labelled = (label: string, children: ParagraphChild[]): Paragraph =>
  new Paragraph({
    children: [run(`${label}: `, { bold: true }), ...children],
    spacing: { after: 80 },
  })

function entryBlocks(e: MemoEntry, n: number): (Paragraph | ReturnType<typeof table>)[] {
  const r = e.redline
  const where = `${r.target.headingPath}${r.target.page ? `, page ${r.target.page}` : ''}`
  return [
    heading2(`${n}. ${where}`),
    labelled('Current text', [run(`“${r.originalExcerpt}”`, { italics: true })]),
    labelled('Proposed text', [run(`“${r.proposedText}”`)]),
    labelled('Marked up', markedRuns(memoOps(e))),
    labelled('Why', [run(r.rationale || 'Not stated.')]),
    ...(e.actions.length ? [labelled('Corrective actions', [run(e.actions.join('; '))])] : []),
    labelled('Found in', [
      run(
        `${r.source.scenarioTitle}${r.source.capability ? `, ${r.source.capability.replace(/_/g, ' ')}` : ''}`,
      ),
    ]),
    ...(r.grounding === 'review' || r.grounding === 'unsupported'
      ? [
          labelled('Check', [
            run(
              'Part of the proposed wording is not stated in the current section; confirm it before use.',
            ),
          ]),
        ]
      : []),
    ...(e.reason ? [labelled('Note', [run(e.reason, { italics: true })])] : []),
  ]
}

export function memoDocument(model: MemoModel): Document {
  const facts: [string, string][] = [
    ['Plan', model.planTitle],
    ['Version', model.planVersion],
    ['Exercise', model.exercise],
    ['Date', model.date],
  ]
  return new Document({
    creator: model.orgName || 'Action Stations',
    title: `Change memo — ${model.planTitle}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [run(`Proposed changes to ${model.planTitle}`)],
          }),
          table(
            ['', ''],
            facts.map(([k, v]) => [k, v]),
          ),
          new Paragraph({
            spacing: { before: 160, after: 160 },
            children: [
              run(
                'These changes are proposals from an exercise. None has been made in the plan. Deleted words are struck through; new words are underlined.',
              ),
            ],
          }),
          ...model.entries.flatMap((e, i) => entryBlocks(e, i + 1)),
        ],
      },
    ],
  })
}

export async function changeMemoDocx(model: MemoModel): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toBuffer(memoDocument(model)))
}

const markedHtml = (ops: DiffOp[]): string =>
  ops
    .map((op) =>
      op.kind === 'equal'
        ? escapeHtml(op.text)
        : op.kind === 'del'
          ? `<del><span class="sr-only">deleted: </span>${escapeHtml(op.text)}</del>`
          : `<ins><span class="sr-only">inserted: </span>${escapeHtml(op.text)}</ins>`,
    )
    .join('')

function entryHtml(e: MemoEntry, n: number): string {
  const r = e.redline
  const where = `${r.target.headingPath}${r.target.page ? `, page ${r.target.page}` : ''}`
  return `<section class="entry"><h2>${n}. ${escapeHtml(where)}</h2>
<p><b>Current text:</b> <i>“${escapeHtml(r.originalExcerpt)}”</i></p>
<p><b>Proposed text:</b> “${escapeHtml(r.proposedText)}”</p>
<p><b>Marked up:</b> ${markedHtml(memoOps(e))}</p>
<p><b>Why:</b> ${escapeHtml(r.rationale || 'Not stated.')}</p>
${e.actions.length ? `<p><b>Corrective actions:</b> ${escapeHtml(e.actions.join('; '))}</p>` : ''}
<p><b>Found in:</b> ${escapeHtml(r.source.scenarioTitle)}</p>
${e.reason ? `<p class="note">${escapeHtml(e.reason)}</p>` : ''}</section>`
}

/** The memo as a self-contained HTML document for the PDF printer; `css` is the shared print CSS. */
export function changeMemoHtml(model: MemoModel, css: string): string {
  const facts = [
    ['Plan', model.planTitle],
    ['Version', model.planVersion],
    ['Exercise', model.exercise],
    ['Date', model.date],
  ]
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:">
<title>Change memo - ${escapeHtml(model.planTitle)}</title>
<style>${css}
body { font-family: var(--sans); font-size: 10.5pt; color: var(--ink); }
h1 { font-size: 18pt; margin: 0 0 8pt; } h2 { font-size: 12pt; margin: 14pt 0 4pt; break-after: avoid; }
.entry { break-inside: avoid; border-top: 1px solid var(--rule); padding-top: 4pt; }
del { color: #${DEL_COLOR}; text-decoration: line-through; } ins { color: #${INS_COLOR}; text-decoration: underline; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 2pt 10pt; } dt { font-weight: 600; } dd { margin: 0; }
.note { color: var(--muted); font-style: italic; }
</style></head><body>
<h1>Proposed changes to ${escapeHtml(model.planTitle)}</h1>
<dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>
<p>These changes are proposals from an exercise. None has been made in the plan. Deleted words are struck through; new words are underlined.</p>
${model.entries.map((e, i) => entryHtml(e, i + 1)).join('\n')}
</body></html>`
}
