// PREP exercise support, main side (spec 0455 FR-10, #782): coverage of the core components
// across a project's PREP exercises and the exercise record as a PDF. The objective sets, the
// component list and the record's fields are data in src/shared/prep. Local files only; nothing
// here uses the network.
import { conductOf, type Scenario } from '@shared/schemas/scenario'
import {
  buildPrepRecord,
  cycleCoverage,
  cycleLine,
  cyclePosition,
  defaultPlanType,
} from '@shared/prep'
import type { PrepCoverage, PrepExerciseSummary } from '@shared/ipc/prep'
import { ensureDir, safeJoin, writeFileAtomic } from '../lib/fs'
import { AppError } from '../lib/errors'
import { loadProject } from '../project/store'
import { composeDocument } from '../render/compose'
import { renderPdf } from '../render/window'
import { EXPORTS_DIR } from '../export/default-dir'
import { listScenarios } from '../scenario/manage'
import { getScenario, listInjects } from '../scenario/store'
import { scenarioComponents } from './prep-components'

async function prepExercises(
  root: string,
): Promise<(PrepExerciseSummary & { scenario: Scenario })[]> {
  const out: (PrepExerciseSummary & { scenario: Scenario })[] = []
  for (const meta of await listScenarios(root)) {
    const scenario = await getScenario(root, meta.id)
    if (!conductOf(scenario).prep) continue
    out.push({
      scenarioId: scenario.id,
      title: scenario.title,
      date: conductOf(scenario).dates[0] ?? '',
      components: await scenarioComponents(root, scenario),
      scenario,
    })
  }
  return out
}

/** Coverage of the 15 components by the project's PREP exercises, inside this scenario's cycle. */
export async function prepCoverage(root: string, scenarioId: string): Promise<PrepCoverage> {
  const scenario = await getScenario(root, scenarioId)
  const prep = conductOf(scenario).prep
  if (!prep) throw new AppError('VALIDATION', 'This scenario is not set up as a PREP exercise')
  const planType = prep.planType ?? defaultPlanType(prep.exerciseKind)
  const first = conductOf(scenario).dates[0]
  const position =
    prep.cycleStart && first ? cyclePosition(planType, prep.cycleStart, first) : undefined
  const window = position ? { start: position.cycleStart, end: position.cycleEnd } : undefined
  const all = await prepExercises(root)
  const inCycle = all.filter((e) => !window || (e.date >= window.start && e.date <= window.end))
  const coverage = cycleCoverage(
    inCycle.map((e) => ({ date: e.date, components: e.components })),
    window,
    prep.notApplicable,
  )
  return {
    exercises: inCycle.map(({ scenario: _s, ...rest }) => rest),
    covered: coverage.covered,
    applicable: coverage.applicable,
    percent: coverage.percent,
    missing: coverage.missing,
    cycleLine: position ? cycleLine(position) : '',
  }
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'exercise'

/** Render the scenario's exercise record to <project>/exports and return the file. */
export async function writePrepRecord(
  root: string,
  scenarioId: string,
): Promise<{ path: string; fileName: string }> {
  const scenario = await getScenario(root, scenarioId)
  const conduct = conductOf(scenario)
  if (!conduct.prep)
    throw new AppError('VALIDATION', 'This scenario is not set up as a PREP exercise')
  const injects = await listInjects(root, scenarioId)
  const org = conduct.participatingOrganizations[0] ?? ''
  const fields = buildPrepRecord({
    settings: conduct.prep,
    exerciseName: conduct.exerciseName || scenario.title,
    dates: conduct.dates,
    ...(conduct.startTime ? { startTime: conduct.startTime } : {}),
    ...(conduct.endTime ? { endTime: conduct.endTime } : {}),
    site: [conduct.site, conduct.room].filter(Boolean).join(', '),
    description: scenario.subtitle ?? scenario.title,
    // Names are the plan holder's to fill in: the record lists the roles that played.
    participants: scenario.roles
      .slice(0, 8)
      .map((r) => ({ name: '', organization: org, role: r.name })),
    play: { injectTypes: injects.map((i) => i.type), decisionIds: [] },
    marking: conduct.marking,
  })
  const project = await loadProject(root)
  const doc = composeDocument({
    type: 'prep_exercise_record',
    fields,
    projectRoot: root,
    title: `PREP exercise record: ${scenario.title}`,
    brand: project.brand,
  })
  const pdf = await renderPdf(doc)
  const dir = safeJoin(root, EXPORTS_DIR)
  await ensureDir(dir)
  const fileName = `prep-exercise-record-${slug(scenario.title)}.pdf`
  const path = safeJoin(dir, fileName)
  await writeFileAtomic(path, pdf)
  return { path, fileName }
}
