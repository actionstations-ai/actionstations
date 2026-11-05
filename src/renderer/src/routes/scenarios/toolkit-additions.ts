// What turning a toolkit on adds, as labelled lines for the Toolkits tab (spec 0448).
import type { Toolkit } from '@shared/toolkits'

/** Each non-empty part of a toolkit as a labelled line: what turning it on adds. */
export function additions(t: Toolkit): { label: string; items: string[] }[] {
  const rows: { label: string; items: string[] }[] = [
    { label: 'Inject types', items: t.injectTypes },
    { label: 'Outside parties', items: t.outsideParties },
    { label: 'Advisor roles', items: t.advisorRoles.map((r) => r.name) },
    { label: 'Charts and displays', items: t.figureKinds },
    { label: 'Data sources', items: t.connectors },
    { label: 'Decisions players make', items: t.decisionForms.map((f) => f.label) },
    { label: 'Evaluation measures', items: t.metrics.map((m) => m.label ?? m.id) },
    { label: 'Reference documents', items: t.documents.map((d) => d.title) },
  ]
  const knowledge = t.knowledge.glossary.length + t.knowledge.realismRules.length
  if (knowledge)
    rows.push({
      label: 'Guidance for the writer',
      items: [
        `${t.knowledge.glossary.length} terms`,
        `${t.knowledge.productConventions.length} product conventions`,
        `${t.knowledge.realismRules.length} realism rules`,
      ],
    })
  return rows.filter((r) => r.items.length > 0)
}
