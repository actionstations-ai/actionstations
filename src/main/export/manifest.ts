// Machine-readable exports: scenario.json (the full scenario with injects inlined) and
// scenario.md (front matter manifest per docs/05 §Export manifest — id, version, generated
// at, provider summary, sha256 of every media file — followed by a readable body).
import { dump } from 'js-yaml'
import { capabilityName } from '@shared/core-capabilities'
import type { Scenario, StageRun } from '@shared/schemas'
import { citationSource } from './eeg'
import { mdCell, mdTable, stripSectionMarkers } from './escape'
import type { ExportedFile } from './media'
import type { ExportModel } from './model'
import { groupRows, phaseHeading, toText } from './views'

export const EXPORT_FORMAT = 'tabletop-gen/scenario-export'
export const EXPORT_FORMAT_VERSION = 1

export function scenarioJson(model: ExportModel): string {
  const doc = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: model.generatedAt,
    project: { id: model.project.id, name: model.project.name, orgName: model.project.orgName },
    scenario: { ...model.scenario, injects: model.injects },
    documents: model.docs,
    // Survey definitions only (#422): responses never leave the project folder this way.
    ...(model.surveys.length ? { surveys: model.surveys.map((s) => s.survey) } : {}),
  }
  return `${JSON.stringify(doc, null, 2)}\n`
}

export interface ProviderSummary {
  provider: string
  model: string
  stages: number
  inputTokens: number
  outputTokens: number
  costUsd?: number
}

/** One line per provider + model used by the scenario's stage runs. */
export function providerSummary(provenance: StageRun[]): ProviderSummary[] {
  const byKey = new Map<string, ProviderSummary>()
  for (const run of provenance) {
    if (run.status !== 'ok' || !run.providerRef) continue
    const provider = run.providerRef.providerId
    const model = run.model ?? run.providerRef.model ?? ''
    const key = `${provider}\u0000${model}`
    const s = byKey.get(key) ?? { provider, model, stages: 0, inputTokens: 0, outputTokens: 0 }
    s.stages++
    s.inputTokens += run.inputTokens ?? 0
    s.outputTokens += run.outputTokens ?? 0
    if (run.costUsd !== undefined) s.costUsd = (s.costUsd ?? 0) + run.costUsd
    byKey.set(key, s)
  }
  return [...byKey.values()]
}

/** Media providers that produced the exported assets (template, comfyui, tts…). */
function mediaProviders(model: ExportModel): string[] {
  const set = new Set<string>()
  for (const p of model.media) {
    const prov = p.asset.provenance
    set.add(prov.model ? `${prov.provider} (${prov.model})` : prov.provider)
  }
  return [...set].sort()
}

export function frontMatter(model: ExportModel, media: ExportedFile[]): string {
  const s = model.scenario
  const data = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    id: s.id,
    title: s.title,
    version: s.version,
    status: s.status,
    generatedAt: model.generatedAt,
    scenarioUpdatedAt: s.updatedAt,
    providers: { text: providerSummary(s.provenance), media: mediaProviders(model) },
    media: media.map((f) => ({ file: f.file, sha256: f.sha256, bytes: f.bytes })),
  }
  return `---\n${dump(data, { lineWidth: 120, noRefs: true })}---\n`
}

function overviewMd(s: Scenario): string[] {
  if (!s.overview) return []
  return [
    '## Scenario Overview',
    `**Theme:** ${s.overview.theme}`,
    `**The Threat:** ${s.overview.threat}`,
    `**The Operational Impact:** ${s.overview.operationalImpact}`,
    ...(s.overview.coreSectionsTested.length
      ? [
          '**Core Sections Tested:**',
          s.overview.coreSectionsTested.map((c) => `- ${c.headingPath}`).join('\n'),
        ]
      : []),
  ]
}

function rolesMd(s: Scenario): string[] {
  if (!s.roles.length) return []
  return [
    '## Roles & Responsibilities',
    s.roles.map((r) => `- **${r.name}:** ${r.description}`.trimEnd()).join('\n'),
  ]
}

function mselMd(s: Scenario): string[] {
  return groupRows(s).flatMap(({ phase, rows }) => [
    phase
      ? `## ${phaseHeading(phase)} (Hour ${phase.startTime} – ${phase.endTime})`
      : '## Additional events',
    ...(phase?.goal ? [`Goal: ${phase.goal}`] : []),
    mdTable(
      ['Time', 'Inject ID', 'From', 'To', 'Event / Message', 'Expected Action', 'Purpose'],
      rows.map((r) => [
        r.time,
        r.id,
        r.from,
        toText(r, s),
        r.event,
        r.expectedAction,
        r.purposeTag,
      ]),
    ),
  ])
}

function injectsMd(model: ExportModel): string[] {
  if (!model.injects.length) return []
  const names = new Map<string, string[]>()
  for (const p of model.media) {
    const list = names.get(p.inject.id) ?? []
    list.push(
      p.fileName,
      ...(p.mp3Name ? [p.mp3Name] : []),
      ...(p.posterName ? [p.posterName] : []),
    )
    names.set(p.inject.id, list)
  }
  return [
    '## Injects',
    mdTable(
      ['Inject ID', 'Type', 'Title', 'Delivery', 'Media files'],
      model.injects.map((i) => [
        i.mselRowId,
        i.type,
        i.title,
        i.deliveryMode,
        (names.get(i.id) ?? []).join(', '),
      ]),
    ),
  ]
}

/** The evaluation guides (#421): capability, target, and the cited critical tasks per row. */
function evaluationMd(s: Scenario): string[] {
  if (!s.evaluation.eegs.length) return []
  const roleName = (id: string | undefined): string =>
    s.roles.find((r) => r.id === id)?.abbreviation ?? id ?? ''
  return [
    '## Evaluation guides',
    ...s.evaluation.eegs.flatMap((e) => [
      `### ${capabilityName(e.capability)}`,
      ...(e.target ? [`**Capability target:** ${e.target}`] : []),
      mdTable(
        ['Task', 'Critical task', 'Source', 'Expected by', 'Observation keys'],
        e.criticalTasks.map((t) => [
          t.id,
          t.timing ? `${t.task} (${t.timing})` : t.task,
          citationSource(t.citation),
          roleName(t.expectedBy),
          t.rowIds.join(', '),
        ]),
      ),
    ]),
  ]
}

function documentMd(title: string, md: string): string[] {
  const body = stripSectionMarkers(md).trim()
  if (!body) return []
  // Document headings are pushed one level down so they nest under the section title.
  return [`## ${title}`, body.replace(/^(#{1,5}) /gm, '#$1 ')]
}

/** scenario.md: manifest front matter + overview, MSEL, injects and the two documents. */
export function scenarioMarkdown(model: ExportModel, media: ExportedFile[]): string {
  const s = model.scenario
  const header = [
    `# ${mdCell(s.title)}`,
    ...(s.subtitle ? [`_${mdCell(s.subtitle)}_`] : []),
    `Location: ${mdCell(s.overview?.location ?? '')} · Duration: ${s.brief.durationHours} Hours · Version ${s.version}`,
  ]
  const blocks = [
    ...header,
    ...overviewMd(s),
    ...rolesMd(s),
    '# Master Scenario Events List',
    ...mselMd(s),
    ...injectsMd(model),
    ...evaluationMd(s),
    ...documentMd('Controller / Evaluator Handbook', model.docs.handbook),
    ...documentMd('Player Briefing Packet', model.docs.briefing),
  ]
  return `${frontMatter(model, media)}\n${blocks.join('\n\n')}\n`
}
