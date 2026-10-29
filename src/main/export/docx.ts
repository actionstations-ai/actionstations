// Optional Word export (#44) of the C/E Handbook and the Player Briefing Packet: markdown
// tokens become real Word headings, paragraphs, lists and tables (no HTML import), plus the
// structured rubric / SimCell / team tables when the markdown lacks them. The HSEEP documents
// (#420) reuse these helpers from hseep/docx.ts.
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx'
import { Lexer, type Token, type Tokens } from 'marked'
import { aarView, type AarView } from './aar'
import { eegView, evaluatorCopies } from './eeg'
import { hasHeading, stripEndNote, stripSectionMarkers } from './escape'
import type { ExportModel } from './model'
import { EXERCISE_MARKING } from './page'
import { scenarioHeading, teamRows, titleFacts } from './views'

export type DocxBlock = Paragraph | Table
type Block = DocxBlock
interface RunStyle {
  bold?: boolean
  italics?: boolean
  code?: boolean
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const

const SAFE_HREF = /^(https?:|mailto:)/i

function inlineRuns(tokens: Token[] | undefined, style: RunStyle = {}): ParagraphChild[] {
  const out: ParagraphChild[] = []
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'strong':
        out.push(...inlineRuns((t as Tokens.Strong).tokens, { ...style, bold: true }))
        break
      case 'em':
        out.push(...inlineRuns((t as Tokens.Em).tokens, { ...style, italics: true }))
        break
      case 'codespan':
        out.push(run((t as Tokens.Codespan).text, { ...style, code: true }))
        break
      case 'br':
        out.push(new TextRun({ text: '', break: 1 }))
        break
      case 'link': {
        const link = t as Tokens.Link
        const children = inlineRuns(link.tokens, style)
        if (SAFE_HREF.test(link.href))
          out.push(new ExternalHyperlink({ link: link.href, children }))
        else out.push(...children)
        break
      }
      default: {
        const nested = (t as { tokens?: Token[] }).tokens
        if (nested?.length) out.push(...inlineRuns(nested, style))
        else out.push(run(decodeEntities((t as { text?: string }).text ?? t.raw), style))
      }
    }
  }
  return out
}

/** marked keeps HTML entities in inline text; Word needs the characters. */
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export const run = (text: string, style: RunStyle = {}): TextRun =>
  new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    ...(style.code ? { font: 'Consolas', size: 18 } : {}),
  })

function cell(children: Paragraph[], header = false): TableCell {
  return new TableCell({
    children,
    ...(header ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E4DC' } } : {}),
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
  })
}

export function table(header: string[], rows: (Paragraph[] | string)[][]): Table {
  const para = (v: Paragraph[] | string) => (typeof v === 'string' ? [new Paragraph(v)] : v)
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((h) =>
          cell([new Paragraph({ children: [run(h, { bold: true })] })], true),
        ),
      }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(para(c))) })),
    ],
  })
}

function listBlocks(list: Tokens.List, level: number, counter: { n: number }): Paragraph[] {
  const instance = list.ordered ? ++counter.n : 0
  return list.items.flatMap((item) => {
    const textTokens = item.tokens.filter((t) => t.type !== 'list')
    const nested = item.tokens.filter((t): t is Tokens.List => t.type === 'list')
    const children = textTokens.flatMap((t) =>
      inlineRuns((t as { tokens?: Token[] }).tokens ?? [t]),
    )
    const p = list.ordered
      ? new Paragraph({ children, numbering: { reference: 'ordered', level, instance } })
      : new Paragraph({ children, bullet: { level } })
    return [p, ...nested.flatMap((n) => listBlocks(n, Math.min(level + 1, 5), counter))]
  })
}

function tokenBlocks(tokens: Token[], headingShift: number, counter: { n: number }): Block[] {
  const out: Block[] = []
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': {
        const h = t as Tokens.Heading
        const level = Math.min(6, Math.max(1, h.depth + headingShift))
        out.push(new Paragraph({ heading: HEADINGS[level - 1], children: inlineRuns(h.tokens) }))
        break
      }
      case 'paragraph':
        out.push(
          new Paragraph({
            children: inlineRuns((t as Tokens.Paragraph).tokens),
            spacing: { after: 120 },
          }),
        )
        break
      case 'list':
        out.push(...listBlocks(t as Tokens.List, 0, counter))
        break
      case 'table': {
        const tb = t as Tokens.Table
        out.push(
          table(
            tb.header.map((h) => decodeEntities(h.text)),
            tb.rows.map((r) => r.map((c) => [new Paragraph({ children: inlineRuns(c.tokens) })])),
          ),
          new Paragraph(''),
        )
        break
      }
      case 'blockquote':
        out.push(...tokenBlocks((t as Tokens.Blockquote).tokens, headingShift, counter))
        break
      case 'code':
        out.push(new Paragraph({ children: [run((t as Tokens.Code).text, { code: true })] }))
        break
      case 'hr':
        out.push(
          new Paragraph({
            border: { bottom: { style: 'single', size: 6, color: 'B9B6AD', space: 1 } },
          }),
        )
        break
      case 'html':
        // Raw HTML in model text is kept as plain text, never interpreted.
        if (t.raw.trim()) out.push(new Paragraph(t.raw.trim()))
        break
      default:
        break
    }
  }
  return out
}

/**
 * Markdown body (leading title headings dropped, shallowest heading → Heading `topLevel`).
 * `keepTitles` keeps the leading headings (a section cut out of a larger document).
 */
export function markdownBlocks(md: string, topLevel = 2, keepTitles = false): Block[] {
  const tokens = new Lexer({ gfm: true }).lex(stripEndNote(stripSectionMarkers(md)))
  let i = 0
  while (
    !keepTitles &&
    i < tokens.length &&
    (tokens[i]!.type === 'space' ||
      (tokens[i]!.type === 'heading' && (tokens[i] as Tokens.Heading).depth <= 2))
  )
    i++
  const body = tokens.slice(i)
  const depths = body.flatMap((t) => (t.type === 'heading' ? [(t as Tokens.Heading).depth] : []))
  const shift = depths.length ? topLevel - Math.min(...depths) : 0
  return tokenBlocks(body, shift, { n: 0 })
}

export function titleBlocks(
  model: ExportModel,
  eyebrow: string,
  extra: [string, string][],
): Block[] {
  const facts = titleFacts(model, extra)
  return [
    new Paragraph({
      children: [run(eyebrow.toUpperCase(), { bold: true })],
      spacing: { after: 60 },
    }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [run(scenarioHeading(model))] }),
    ...(model.scenario.subtitle
      ? [new Paragraph({ children: [run(model.scenario.subtitle, { italics: true })] })]
      : []),
    new Paragraph({
      children: facts.flatMap((f, i) => [
        ...(i ? [run('   ·   ')] : []),
        run(`${f.label}: `, { bold: true }),
        run(f.value),
      ]),
      spacing: { after: 240 },
    }),
  ]
}

export function heading2(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text)] })
}

function handbookExtras(model: ExportModel): Block[] {
  const { scenario: s, docs } = model
  const out: Block[] = []
  const metrics = s.rubric?.metrics ?? []
  if (metrics.length && !hasHeading(docs.handbook, /rubric|grading|evaluation/i)) {
    out.push(
      heading2('Evaluation & Grading Rubric'),
      table(
        ['Metric', 'Fail', 'Pass', 'Excellence'],
        metrics.map((m) => [
          `${m.name} (${m.points} points)`,
          `☐ ${m.fail}`,
          `☐ ${m.pass}`,
          `☐ ${m.excellence}`,
        ]),
      ),
    )
  }
  if (s.simcellScripts.length && !hasHeading(docs.handbook, /simcell script/i)) {
    out.push(heading2('SimCell Scripts'))
    for (const sc of s.simcellScripts) {
      out.push(
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(sc.rolePlayed)] }),
        new Paragraph({ children: [run('When: ', { bold: true }), run(sc.trigger)] }),
        ...sc.hardQuestions.map(
          (q) => new Paragraph({ children: [run(`Ask: ${q}`)], bullet: { level: 0 } }),
        ),
        ...sc.concessions.map(
          (c) => new Paragraph({ children: [run(`Concede: ${c}`)], bullet: { level: 0 } }),
        ),
      )
    }
  }
  return out
}

function briefingExtras(model: ExportModel): Block[] {
  if (hasHeading(model.docs.briefing, /team/i) || !model.scenario.roles.length) return []
  return [
    heading2('Team Assignments & Standing Orders'),
    table(
      ['Team', 'Role', 'Standing Orders'],
      teamRows(model.scenario).map((t) => [t.team, t.role, t.orders.join(' ')]),
    ),
  ]
}

const markingOf = (model: ExportModel): string => model.conduct.marking.trim() || EXERCISE_MARKING

function runningHeader(model: ExportModel, label: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run(`${scenarioHeading(model)}  ·  ${markingOf(model)}  ·  ${label}`, {})],
      }),
    ],
  })
}

function runningFooter(marking: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            children: [
              `${marking}   ·   Page `,
              PageNumber.CURRENT,
              ' of ',
              PageNumber.TOTAL_PAGES,
            ],
          }),
        ],
      }),
    ],
  })
}

export function buildDocument(model: ExportModel, label: string, children: Block[]): Document {
  return new Document({
    creator: model.project.orgName || 'Action Stations',
    title: `${label} — ${model.scenario.title}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    numbering: {
      config: [
        {
          reference: 'ordered',
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } },
          })),
        },
      ],
    },
    sections: [
      {
        headers: { default: runningHeader(model, label) },
        footers: { default: runningFooter(markingOf(model)) },
        children,
      },
    ],
  })
}

export async function handbookDocx(model: ExportModel): Promise<Buffer> {
  const label = 'Controller / Evaluator Handbook'
  const doc = buildDocument(model, label, [
    ...titleBlocks(model, 'Controller / Evaluator (C/E) Handbook', [
      ['Exercise date', '____________'],
    ]),
    ...markdownBlocks(model.docs.handbook),
    ...handbookExtras(model),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run('End of Handbook', { italics: true })],
    }),
  ])
  return Packer.toBuffer(doc)
}

const RATING_BOXES = '☐ M   ☐ P   ☐ N   ☐ NO'

/** One EEG as Word blocks: heading, objectives, target, the critical tasks table, note space. */
function eegBlocks(eeg: ReturnType<typeof eegView>['eegs'][number]): Block[] {
  const out: Block[] = [
    heading2(`Exercise Evaluation Guide ${eeg.index}: ${eeg.capability}`),
    new Paragraph({ children: [run(eeg.definition, { italics: true })], spacing: { after: 120 } }),
  ]
  if (eeg.objectives.length)
    out.push(
      new Paragraph({ children: [run('Exercise objectives: ', { bold: true })] }),
      ...eeg.objectives.map((o) => new Paragraph({ children: [run(o)], bullet: { level: 0 } })),
    )
  if (eeg.target)
    out.push(
      new Paragraph({
        children: [run('Capability target: ', { bold: true }), run(eeg.target)],
        spacing: { after: 120 },
      }),
    )
  out.push(
    table(
      ['#', 'Critical task', 'Source', 'Expected by', 'Observation Keys', 'Rating', 'Notes'],
      eeg.tasks.map((t) => [
        t.id,
        t.timing ? `${t.task} (${t.timing})` : t.task,
        t.source,
        t.expectedBy,
        t.keys,
        RATING_BOXES,
        '',
      ]),
    ),
    new Paragraph(''),
  )
  for (const label of ['Observation notes', 'Analysis', 'Strengths', 'Areas for improvement'])
    out.push(
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(label)] }),
      new Paragraph(''),
      new Paragraph(''),
    )
  return out
}

/** One copy of the EEG packet as Word blocks; `copy` names the evaluator seat when several print. */
function eegCopyBlocks(model: ExportModel, copy: number | undefined): Block[] {
  const view = eegView(model, '', copy)
  return [
    ...(copy && copy > 1 ? [new Paragraph({ pageBreakBefore: true, children: [] })] : []),
    ...titleBlocks(model, 'Exercise Evaluation Guides (EEG)', [
      ['Exercise date', '____________'],
      ['Evaluator', copy ? `Evaluator ${copy}` : '____________'],
    ]),
    new Paragraph({
      children: [
        run(
          'Rate each critical task M (met), P (partially met), N (not met) or NO (not observed) and note what you saw. Ratings describe how the plan was followed, not how a person performed.',
        ),
      ],
      spacing: { after: 200 },
    }),
    ...view.eegs.flatMap(eegBlocks),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run(view.endNote, { italics: true })],
    }),
  ]
}

/** The EEG packet as a Word document (#421), from the same view as the PDF: one copy per evaluator seat. */
export async function eegDocx(model: ExportModel): Promise<Buffer> {
  const copies = evaluatorCopies(model)
  const blocks = Array.from({ length: copies }, (_, i) =>
    eegCopyBlocks(model, copies > 1 ? i + 1 : undefined),
  ).flat()
  return Packer.toBuffer(buildDocument(model, 'Exercise Evaluation Guides', blocks))
}

type AarCapability = AarView['capabilities'][number]
type AarFinding = AarCapability['strengths'][number]

/** Markdown prose as body blocks with headings kept below the finding's own heading. */
function proseBlocks(md: string): Block[] {
  return tokenBlocks(new Lexer({ gfm: true }).lex(stripSectionMarkers(md)), 3, { n: 0 })
}

function aarFindingBlocks(kind: 'Strength' | 'Area for Improvement', f: AarFinding): Block[] {
  const out: Block[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_4,
      children: [run(`${kind} ${f.n}: ${f.title}`)],
    }),
  ]
  if (kind === 'Area for Improvement')
    out.push(new Paragraph({ children: [run('Analysis:', { bold: true })] }))
  out.push(...proseBlocks(f.analysisMd))
  if (f.reference)
    out.push(new Paragraph({ children: [run('Reference: ', { bold: true }), run(f.reference)] }))
  if (kind === 'Area for Improvement') {
    out.push(
      new Paragraph({
        children: [run('Recommendation: ', { bold: true }), run(f.recommendation)],
      }),
      ...f.actions.map(
        (a) =>
          new Paragraph({
            children: [run(`${a.action} (${a.element})`)],
            bullet: { level: 0 },
          }),
      ),
    )
  }
  out.push(
    new Paragraph({
      children: [run(`Evidence: ${f.evidence}`, { italics: true })],
      spacing: { after: 160 },
    }),
  )
  return out
}

function aarCapabilityBlocks(c: AarCapability): Block[] {
  const out: Block[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(c.capability)] }),
  ]
  if (c.objectives.length)
    out.push(new Paragraph({ children: [run(`Objectives: ${c.objectives.join('; ')}`)] }))
  out.push(
    new Paragraph({
      children: [
        run('Rating: ', { bold: true }),
        c.rating ? run(c.rating, { bold: true }) : run('Rating pending', { italics: true }),
      ],
    }),
  )
  if (c.rationale) out.push(new Paragraph({ children: [run(c.rationale)] }))
  out.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: [run('Strengths')] }))
  if (!c.strengths.length)
    out.push(new Paragraph({ children: [run('No strengths recorded for this capability.')] }))
  for (const f of c.strengths) out.push(...aarFindingBlocks('Strength', f))
  out.push(
    new Paragraph({ heading: HeadingLevel.HEADING_4, children: [run('Areas for Improvement')] }),
  )
  if (!c.areas.length)
    out.push(
      new Paragraph({ children: [run('No areas for improvement recorded for this capability.')] }),
    )
  for (const f of c.areas) out.push(...aarFindingBlocks('Area for Improvement', f))
  return out
}

const IP_COLUMNS = [
  'Core Capability',
  'Issue/Area for Improvement',
  'Corrective Action',
  'Capability Element',
  'Primary Responsible Organization',
  'Organization POC',
  'Start Date',
  'Completion Date',
]

/**
 * The AAR/IP as a Word document (#419), from the same view as the PDF. The prose a person
 * edited in documents/aar.md is used when the view carries it; only confirmed ratings print.
 */
export async function aarDocx(model: ExportModel): Promise<Buffer> {
  const label = 'After-Action Report / Improvement Plan'
  const view = aarView(model)
  if (view.missing) {
    return Packer.toBuffer(
      buildDocument(model, label, [
        ...titleBlocks(model, label, []),
        new Paragraph({ children: [run(view.missing, { italics: true })] }),
      ]),
    )
  }
  const findings = view.findingsHtml
    ? markdownBlocks(`## Findings\n\n${view.findingsMd}`)
    : view.capabilities.flatMap(aarCapabilityBlocks)
  const doc = buildDocument(model, label, [
    ...titleBlocks(model, label, [
      ['Exercise date', model.aar?.exerciseDate ?? '____________'],
      ['Status', view.draft ? 'Draft (ratings pending)' : 'Reviewed'],
    ]),
    heading2('Exercise Overview'),
    table(
      ['Item', 'Detail'],
      view.overview.map((r) => [r.label, r.value]),
    ),
    new Paragraph({ children: [run(view.evidence)], spacing: { before: 120, after: 200 } }),
    heading2('Executive Summary'),
    ...proseBlocks(view.summaryMd),
    heading2('Analysis of Core Capabilities'),
    table(
      ['Objective', 'Core Capability', 'P', 'S', 'M', 'U', 'Status'],
      view.ratings.map((r) => [
        r.objective,
        r.capability,
        ...r.marks.map((m) => (m.marked ? 'X' : '')),
        r.pending ? 'Rating pending' : '',
      ]),
    ),
    new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run('Ratings Definitions')] }),
    ...view.legend.map(
      (l) =>
        new Paragraph({
          children: [run(`${l.label} (${l.code}): `, { bold: true }), run(l.definition)],
          spacing: { after: 80 },
        }),
    ),
    ...findings,
    heading2('Appendix A: Improvement Plan'),
    ...(view.plan.length
      ? [
          table(
            IP_COLUMNS,
            view.plan.map((r) => [
              r.capability,
              r.issue,
              r.action,
              r.element,
              r.organization,
              r.poc,
              r.startDate,
              r.dueDate,
            ]),
          ),
        ]
      : [new Paragraph({ children: [run('No corrective actions yet.')] })]),
    heading2('Appendix B: Exercise Participants'),
    ...(view.organizations.length
      ? view.organizations.map((o) => new Paragraph({ children: [run(o)], bullet: { level: 0 } }))
      : [
          new Paragraph({
            children: [run('Participating organizations to be completed (organizations only).')],
          }),
        ]),
    ...(view.hasFeedback
      ? [heading2('Appendix C: Participant Feedback Summary'), ...proseBlocks(view.feedbackMd)]
      : []),
    heading2('Appendix D: Acronyms'),
    table(
      ['Acronym', 'Meaning'],
      view.acronyms.map((a) => [a.term, a.meaning]),
    ),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run(view.endNote, { italics: true })],
    }),
  ])
  return Packer.toBuffer(doc)
}

export async function briefingDocx(model: ExportModel): Promise<Buffer> {
  const label = 'Player Briefing Packet'
  const doc = buildDocument(model, label, [
    ...titleBlocks(model, label, [['Exercise time', model.scenario.brief.startWallClock ?? '']]),
    ...markdownBlocks(model.docs.briefing),
    ...briefingExtras(model),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run('End of Briefing Packet', { italics: true })],
    }),
  ])
  return Packer.toBuffer(doc)
}
