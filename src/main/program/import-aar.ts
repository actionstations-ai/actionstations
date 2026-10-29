// Import corrective actions from a scenario's AAR/IP draft (FR-6). Each AAR item is identified by
// `<finding id>/<corrective action id>` (both stable across re-drafts, #419). An import record
// per run makes a second import idempotent: an item already imported is detected, and one whose
// AAR text changed since is offered as an update, never added twice.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  Aar,
  AarImport,
  IsoDate,
  Project,
  ProgramAction,
  type PlanSectionRef,
} from '@shared/schemas'
import type { AarImportPreview, AarImportSelection } from '@shared/ipc/program'
import { AppError } from '../lib/errors'
import { readJson, readJsonOr, safeJoin, writeJsonAtomic } from '../lib/fs'
import { newId, nowIso } from '../lib/ids'
import { writeAar } from '../aar/store'
import { createAction, getAction, listAllActions, saveAction } from './actions'
import { loadProgram, programPaths, withProgramLock } from './store'

const sha = (text: string): string => createHash('sha256').update(text).digest('hex')

interface AarItem {
  aarItemId: string
  findingId: string
  actionId: string
  contentSha: string
  proposed: Partial<ProgramAction>
  areaForImprovement: string
}

const firstSentence = (text: string, max = 200): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  const end = flat.search(/[.!?](\s|$)/)
  const sentence = end > 0 ? flat.slice(0, end + 1) : flat
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence
}

const validDate = (d: string | undefined): string | undefined =>
  d && IsoDate.safeParse(d).success ? d : undefined

async function readAarFile(projectRoot: string, scenarioId: string) {
  const path = safeJoin(projectRoot, 'scenarios', scenarioId, 'aar.json')
  let text: string
  try {
    text = await fs.readFile(path, 'utf8')
  } catch {
    throw new AppError('NOT_FOUND', 'This scenario has no after-action report yet.')
  }
  const aar = Aar.safeParse(JSON.parse(text))
  if (!aar.success) throw new AppError('VALIDATION', 'The after-action report could not be read.')
  return { aar: aar.data, aarSha256: sha(text) }
}

function itemsOf(
  aar: Aar,
  ctx: { projectId: string; projectName: string; scenarioId: string; scenarioTitle: string },
  shaOf: Map<string, string>,
): AarItem[] {
  const items: AarItem[] = []
  for (const cap of aar.capabilities)
    for (const f of cap.areasForImprovement)
      for (const ca of f.correctiveActions) {
        const planSections: PlanSectionRef[] = f.citations.map((c) => ({
          ...c,
          ...(shaOf.get(c.documentId) ? { documentSha256: shaOf.get(c.documentId)! } : {}),
        }))
        const area = [f.title, f.analysisMd].filter(Boolean).join('\n\n').slice(0, 8000)
        const startDate = validDate(ca.startDate)
        const dueDate = validDate(ca.dueDate)
        const exerciseDate = validDate(aar.exerciseDate)
        items.push({
          aarItemId: `${f.id}/${ca.id}`,
          findingId: f.id,
          actionId: ca.id,
          areaForImprovement: area,
          contentSha: sha(
            JSON.stringify([ca.action, ca.element, f.title, f.analysisMd, planSections]),
          ),
          proposed: {
            title: firstSentence(ca.action) || f.title.slice(0, 200) || 'Corrective action',
            description: ca.action,
            areaForImprovement: area,
            coreCapabilities: [cap.capability],
            element: ca.element,
            planSections,
            owner: { name: ca.poc, organization: ca.ownerOrganization, email: '' },
            ...(startDate ? { startDate } : {}),
            ...(dueDate ? { dueDate } : {}),
            status: ca.status === 'done' ? 'completed' : ca.status,
            source: {
              kind: 'aar_ip',
              projectId: ctx.projectId,
              projectName: ctx.projectName,
              scenarioId: ctx.scenarioId,
              scenarioTitle: ctx.scenarioTitle,
              ...(exerciseDate ? { exerciseDate } : {}),
              aarItemId: `${f.id}/${ca.id}`,
            },
          },
        })
      }
  return items
}

/** Latest import record entry per AAR item for this scenario. */
async function priorImports(root: string, projectId: string, scenarioId: string) {
  const dir = programPaths(root).imports
  let names: string[]
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'))
  } catch {
    return new Map<string, { correctiveActionId: string; contentSha256?: string }>()
  }
  const records: AarImport[] = []
  for (const n of names) {
    const r = await readJsonOr(join(dir, n), AarImport.nullable(), () => null).catch(() => null)
    if (r && r.projectId === projectId && r.scenarioId === scenarioId) records.push(r)
  }
  records.sort((a, b) => a.at.localeCompare(b.at))
  const map = new Map<string, { correctiveActionId: string; contentSha256?: string }>()
  for (const r of records)
    for (const i of r.items)
      if (i.action !== 'skipped')
        map.set(i.aarItemId, {
          correctiveActionId: i.correctiveActionId,
          ...(i.contentSha256 ? { contentSha256: i.contentSha256 } : {}),
        })
  return map
}

async function context(projectRoot: string, scenarioId: string) {
  const project = await readJson(join(projectRoot, 'project.json'), Project)
  const meta = project.scenarios.find((s) => s.id === scenarioId)
  if (!meta) throw new AppError('NOT_FOUND', 'That scenario is not in the project.')
  const { aar, aarSha256 } = await readAarFile(projectRoot, scenarioId)
  const shaOf = new Map(project.documents.flatMap((d) => (d.sha256 ? [[d.id, d.sha256]] : [])))
  const items = itemsOf(
    aar,
    { projectId: project.id, projectName: project.name, scenarioId, scenarioTitle: meta.title },
    shaOf,
  )
  return { project, aar, aarSha256, items }
}

export async function previewAarImport(
  programRoot: string,
  projectRoot: string,
  scenarioId: string,
): Promise<AarImportPreview> {
  const { project, items } = await context(projectRoot, scenarioId)
  const prior = await priorImports(programRoot, project.id, scenarioId)
  const existing = new Set((await listAllActions(programRoot)).actions.map((v) => v.action.id))
  return items.map((i) => {
    const was = prior.get(i.aarItemId)
    const present = was && existing.has(was.correctiveActionId)
    const state = !present ? 'new' : was.contentSha256 === i.contentSha ? 'imported' : 'changed'
    return {
      aarItemId: i.aarItemId,
      areaForImprovement: i.areaForImprovement,
      proposed: i.proposed,
      state,
      ...(present ? { existingId: was.correctiveActionId } : {}),
    }
  })
}

function draftAction(
  programId: string,
  base: Partial<ProgramAction>,
  over: Partial<ProgramAction>,
) {
  const now = nowIso()
  return ProgramAction.parse({
    ...base,
    ...over,
    id: 'new',
    programId,
    source: { ...base.source, importId: undefined },
    createdAt: now,
    updatedAt: now,
  })
}

/** Update the AAR-derived fields of an action already imported; status, owner and date stay. */
async function refreshExisting(root: string, id: string, i: AarItem, over: Partial<ProgramAction>) {
  const view = await getAction(root, id)
  const a = view.action
  const p = i.proposed
  await saveAction(
    root,
    {
      ...a,
      title: p.title ?? a.title,
      description: p.description ?? a.description,
      areaForImprovement: p.areaForImprovement ?? a.areaForImprovement,
      coreCapabilities: p.coreCapabilities ?? a.coreCapabilities,
      element: p.element ?? a.element,
      planSections: p.planSections ?? a.planSections,
      ...over,
    },
    view.revision,
  )
}

export async function applyAarImport(
  programRoot: string,
  projectRoot: string,
  scenarioId: string,
  selections: AarImportSelection[],
): Promise<AarImport> {
  const root = resolve(programRoot)
  const program = await loadProgram(root)
  const { project, aar, aarSha256, items } = await context(projectRoot, scenarioId)
  const prior = await priorImports(root, project.id, scenarioId)
  const importId = newId()
  const results: AarImport['items'] = []
  const chosen = new Map(selections.filter((s) => s.include).map((s) => [s.aarItemId, s]))
  for (const item of items) {
    const sel = chosen.get(item.aarItemId)
    if (!sel) continue
    const over = (sel.overrides ?? {}) as Partial<ProgramAction>
    const was = prior.get(item.aarItemId)
    const base = { aarItemId: item.aarItemId, contentSha256: item.contentSha }
    if (was && was.contentSha256 === item.contentSha) {
      results.push({ ...base, correctiveActionId: was.correctiveActionId, action: 'skipped' })
    } else if (was) {
      await refreshExisting(root, was.correctiveActionId, item, over)
      results.push({ ...base, correctiveActionId: was.correctiveActionId, action: 'updated' })
    } else {
      const draft = draftAction(program.id, item.proposed, over)
      draft.source = { ...draft.source, importId }
      const view = await createAction(root, draft)
      results.push({ ...base, correctiveActionId: view.action.id, action: 'created' })
    }
  }
  const record = AarImport.parse({
    id: importId,
    at: nowIso(),
    projectId: project.id,
    scenarioId,
    aarSha256,
    items: results,
  })
  await withProgramLock(root, () => writeJsonAtomic(programPaths(root).import(importId), record))
  await writeBack(projectRoot, scenarioId, aar, results)
  return record
}

/** Show "tracked in program as CA-0007" on the AAR page (best effort, never fails the import). */
async function writeBack(
  projectRoot: string,
  scenarioId: string,
  aar: Aar,
  results: AarImport['items'],
): Promise<void> {
  const byItem = new Map(results.map((r) => [r.aarItemId, r.correctiveActionId]))
  if (!byItem.size) return
  const next: Aar = structuredClone(aar)
  for (const cap of next.capabilities)
    for (const f of cap.areasForImprovement)
      for (const ca of f.correctiveActions) {
        const id = byItem.get(`${f.id}/${ca.id}`)
        if (id) ca.programActionId = id
      }
  try {
    await writeAar(projectRoot, scenarioId, next, {
      by: 'user',
      note: 'Linked to the exercise program',
    })
  } catch (e) {
    console.error('[program] could not record program links in the AAR:', (e as Error).message)
  }
}
