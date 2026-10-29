// Build the full HTML of each exported document (MSEL, Master Inject Deck, C/E Handbook,
// Player Briefing Packet, the HSEEP set (#420), the EEG packet (#421) and the Exercise Plan
// bundle) from templates/export and the export model.
import { aarView } from './aar'
import { seamHandbookSection } from '../generate/seams'
import { eegView } from './eeg'
import { documentBodyHtml, hasHeading, markdownToHtml, stripEndNote } from './escape'
import { dropDuplicateHeaderFacts } from './header-facts'
import { blocksView } from './hseep/blocks'
import { HSEEP_EYEBROWS, hseepBlocks, hseepEndNote, markingOf, type HseepDoc } from './hseep'
import { BLANK_FORMS, embedBlankForm, type EmbeddedForm } from './forms'
import type { ExportModel } from './model'
import { DOC_LABELS, embeddedFontsCss, pageCss, type DocKey } from './page'
import { printCss, renderExportTemplate, trusted } from './templates'
import {
  assetSrc,
  deckView,
  mselView,
  pathView,
  scenarioHeading,
  teamRows,
  titleFacts,
  durationText,
  locationText,
  type RenderMode,
} from './views'

export type ExportDoc = DocKey | 'exercise_plan' | 'handouts' | 'controller_handouts' | 'path'

export const EXPORT_DOC_LABELS: Record<ExportDoc, string> = {
  ...DOC_LABELS,
  exercise_plan: 'Exercise Plan',
  handouts: 'Player Handouts',
  controller_handouts: 'Controller Materials',
  path: 'MSEL (one path)',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function footerText(model: ExportModel): string {
  const org = model.project.orgName || model.project.name
  return [org, `v${model.scenario.version}`, formatDate(model.generatedAt)]
    .filter(Boolean)
    .join(' · ')
}

function mselSection(model: ExportModel, prefix: string): string {
  return renderExportTemplate('msel', mselView(model, prefix))
}

function deckSection(model: ExportModel, prefix: string, mode: RenderMode): string {
  return renderExportTemplate('deck', deckView(model, prefix, mode))
}

/** The EEG packet (#421): one guide per capability, blank rating boxes, no observations. */
function eegSection(model: ExportModel, prefix: string): string {
  return renderExportTemplate('eeg', eegView(model, prefix))
}

/** The AAR/IP (#419); a "no report yet" body when nothing has been drafted. */
function aarSection(model: ExportModel, prefix: string): string {
  return renderExportTemplate('aar', aarView(model, prefix))
}

/** A generated document's markdown minus its end note and the header facts it repeats. */
function bodyMarkdown(md: string, facts: { label: string }[]): string {
  return dropDuplicateHeaderFacts(
    stripEndNote(md),
    facts.map((f) => f.label),
  )
}

function handbookSection(model: ExportModel, prefix: string): string {
  const { scenario: s, docs } = model
  const facts = titleFacts(model, [['Exercise date', '____________']])
  const md = withSeamSection(s, bodyMarkdown(docs.handbook, facts))
  const rubric = hasHeading(md, /rubric|grading|evaluation/i) ? [] : (s.rubric?.metrics ?? [])
  const needsHotwash = !hasHeading(md, /hot\s*wash|debrief/i)
  const structuredHotwash = s.hotwash && (s.hotwash.questions.length || s.hotwash.methodDescription)
  return renderExportTemplate('handbook', {
    prefix,
    title: {
      id: `${prefix}handbook-title`,
      eyebrow: 'Controller / Evaluator (C/E) Handbook',
      heading: scenarioHeading(model),
      sub: s.subtitle ?? '',
      facts,
    },
    bodyHtml: trusted(md.trim() ? documentBodyHtml(md) : fallbackHandbookHtml(model)),
    rubric,
    hotwash:
      needsHotwash && structuredHotwash
        ? { method: s.hotwash!.methodDescription, questions: s.hotwash!.questions }
        : undefined,
    hotwashHtml:
      needsHotwash && !structuredHotwash && docs.hotwash.trim()
        ? trusted(documentBodyHtml(docs.hotwash, 3))
        : undefined,
    simcell: hasHeading(md, /simcell script/i) ? [] : s.simcellScripts,
    endNote: 'End of Handbook',
  })
}

/**
 * FR-8 / FR-13: the plan seams section is part of the handbook. A handbook.md written before
 * the scenario had seams (or none at all) gets it from the scenario here.
 */
function withSeamSection(s: ExportModel['scenario'], md: string): string {
  if (!s.seams?.length || hasHeading(md, /plan seams this exercise tests/i)) return md
  const section = seamHandbookSection(s)
  return md.trim()
    ? `${md.trimEnd()}

${section}
`
    : ''
}

/** A handbook body from structured data when no handbook.md has been generated yet. */
function fallbackHandbookHtml(model: ExportModel): string {
  const s = model.scenario
  const parts = [
    '## Exercise Overview',
    `Location: ${locationText(s)} · Duration: ${durationText(s)}`,
    s.overview ? `**Scope:** ${s.overview.theme} ${s.overview.threat}` : '',
    s.objectives.length ? '**Objectives:**' : '',
    ...s.objectives.map((o) => `- ${o.name ? `**${o.name}:** ` : ''}${o.text}`),
    s.seams?.length ? seamHandbookSection(s) : '',
  ]
  return markdownToHtml(parts.filter(Boolean).join('\n\n'))
}

function briefingSection(model: ExportModel, prefix: string, forms: EmbeddedForm[]): string {
  const { scenario: s, docs } = model
  const facts = titleFacts(model, [['Exercise time', s.brief.startWallClock ?? '']])
  const md = bodyMarkdown(docs.briefing, facts)
  return renderExportTemplate('briefing', {
    prefix,
    title: {
      id: `${prefix}briefing-title`,
      eyebrow: 'Player Briefing Packet',
      heading: scenarioHeading(model),
      sub: s.subtitle ?? '',
      facts,
    },
    bodyHtml: trusted(md.trim() ? documentBodyHtml(md) : ''),
    teams: hasHeading(md, /team/i) ? [] : teamRows(s),
    forms: forms.map((f) => ({ label: f.label, html: trusted(f.html) })),
    endNote: 'End of Briefing Packet. Blank forms follow.',
  })
}

/** Player handouts or controller materials: the scenario's hand-written markdown as is. */
function handoutsSection(
  model: ExportModel,
  prefix: string,
  doc: 'handouts' | 'controller_handouts',
): string {
  return renderExportTemplate('briefing', {
    prefix: `${prefix}${doc}-`,
    title: {
      id: `${prefix}${doc}-briefing-title`,
      eyebrow: EXPORT_DOC_LABELS[doc],
      heading: scenarioHeading(model),
      sub: model.scenario.subtitle ?? '',
      facts: [],
    },
    bodyHtml: trusted(documentBodyHtml(model.docs[doc], 2, true)),
    teams: [],
    forms: [],
    endNote: `End of ${EXPORT_DOC_LABELS[doc]}`,
  })
}

/** The project logo for the cover (#217), when one is set and on disk. */
function coverLogo(model: ExportModel, mode: RenderMode): string {
  const rel = model.project.brand.logoPath
  return rel && model.available.has(rel) ? assetSrc(model, rel, mode) : ''
}

/** One HSEEP document (#420): title block plus its blocks in HSEEP order. */
function hseepSection(model: ExportModel, prefix: string, doc: HseepDoc): string {
  const s = model.scenario
  return renderExportTemplate('hseep', {
    prefix,
    page: doc,
    title: {
      id: `${prefix}${doc}-title`,
      eyebrow: HSEEP_EYEBROWS[doc],
      heading: scenarioHeading(model),
      sub: s.subtitle ?? '',
      facts: titleFacts(model),
    },
    blocks: blocksView(hseepBlocks(model, doc)),
    endNote: hseepEndNote(doc),
  })
}

function coverSection(model: ExportModel, prefix: string, mode: RenderMode): string {
  const s = model.scenario
  return renderExportTemplate('cover', {
    prefix,
    marking: markingOf(model),
    logo: coverLogo(model, mode),
    org: model.project.orgName || model.project.name,
    heading: scenarioHeading(model),
    sub: s.subtitle ?? '',
    facts: titleFacts(model, [
      ['Exercise date', '____________'],
      ['Version', `v${s.version}`],
      ['Generated', formatDate(model.generatedAt)],
    ]),
    contents: [
      DOC_LABELS.explan,
      DOC_LABELS.sitman,
      'Controller and Evaluator Handbook',
      DOC_LABELS.msel,
      DOC_LABELS.deck,
      `${DOC_LABELS.briefing} (with blank ICS 201 form)`,
    ],
  })
}

/** Only the ICS 201 goes into the packet; the players/ folder also gets ICS 203 separately. */
const packetForms = (): EmbeddedForm[] =>
  BLANK_FORMS.filter((f) => f.type === 'ics_201_prefill').map((f) =>
    embedBlankForm(f.type, f.label),
  )

function wrap(model: ExportModel, doc: ExportDoc, body: string, forms: EmbeddedForm[]): string {
  const label = EXPORT_DOC_LABELS[doc]
  return renderExportTemplate('layout', {
    title: `${label} — ${model.scenario.title}`,
    fontsCss: trusted(embeddedFontsCss()),
    printCss: trusted(printCss()),
    pageCss: trusted(
      pageCss(
        { title: scenarioHeading(model), footer: footerText(model), marking: markingOf(model) },
        label,
      ),
    ),
    formCss: trusted(forms.map((f) => f.css).join('\n')),
    body: trusted(body),
  })
}

/** The complete, self-contained HTML of one exported document. */
export function buildDocumentHtml(model: ExportModel, doc: ExportDoc, mode: RenderMode): string {
  switch (doc) {
    case 'msel':
      return wrap(model, doc, mselSection(model, ''), [])
    case 'path':
      return wrap(model, doc, renderExportTemplate('path', pathView(model, '')), [])
    case 'deck':
      return wrap(model, doc, deckSection(model, '', mode), [])
    case 'handbook':
      return wrap(model, doc, handbookSection(model, ''), [])
    case 'eeg':
      return wrap(model, doc, eegSection(model, ''), [])
    case 'aar':
      return wrap(model, doc, aarSection(model, ''), [])
    case 'briefing': {
      const forms = packetForms()
      return wrap(model, doc, briefingSection(model, '', forms), forms)
    }
    case 'handouts':
    case 'controller_handouts':
      return wrap(model, doc, handoutsSection(model, '', doc), [])
    case 'explan':
    case 'sitman':
    case 'sitman_player':
    case 'handbook_hseep':
      return wrap(model, doc, hseepSection(model, '', doc), [])
    case 'exercise_plan': {
      // HSEEP bundle order (#420): cover, ExPlan, SitMan, C/E Handbook, MSEL, deck, EEGs (when
      // the scenario has guides, #421), briefing.
      const forms = packetForms()
      const body = [
        coverSection(model, 'plan-', mode),
        hseepSection(model, 'xp-', 'explan'),
        hseepSection(model, 'sm-', 'sitman'),
        hseepSection(model, 'hb-', 'handbook_hseep'),
        mselSection(model, 'ms-'),
        deckSection(model, 'dk-', mode),
        ...(model.scenario.evaluation.eegs.length ? [eegSection(model, 'eg-')] : []),
        briefingSection(model, 'br-', forms),
      ].join('\n')
      return wrap(model, doc, body, forms)
    }
  }
}
