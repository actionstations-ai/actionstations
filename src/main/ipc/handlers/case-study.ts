// casestudy:* (spec 0452 FR-9). Nothing here calls a model: drafts come from the simulated
// trajectories, and a draft reaches learners only after the author's review.
import { draftFromTrajectory } from '../../casestudy/from-trajectory'
import {
  deleteCaseStudy,
  getCaseStudy,
  importCaseStudy,
  listCaseStudies,
  listItem,
  reviewCaseStudy,
  saveCaseStudy,
} from '../../casestudy/store'
import { newId } from '../../lib/ids'
import { requireProject } from '../../project/guard'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'casestudy:list': async ({ projectPath }) =>
    (await listCaseStudies(await requireProject(projectPath))).map(listItem),

  'casestudy:get': async ({ projectPath, id }) =>
    getCaseStudy(await requireProject(projectPath), id),

  'casestudy:save': async ({ projectPath, study }) =>
    saveCaseStudy(await requireProject(projectPath), study),

  'casestudy:delete': async ({ projectPath, id }) => {
    await deleteCaseStudy(await requireProject(projectPath), id)
    return {}
  },

  'casestudy:draft': async ({ projectPath, kind, seed, startLabel, contentNotice }) => {
    const root = await requireProject(projectPath)
    const draft = draftFromTrajectory({
      id: newId(),
      kind,
      seed,
      ...(startLabel ? { startLabel } : {}),
      ...(contentNotice ? { contentNotice } : {}),
    })
    return saveCaseStudy(root, draft)
  },

  'casestudy:import': async ({ projectPath, json, redact, acknowledge }) => {
    const root = await requireProject(projectPath)
    const r = await importCaseStudy(root, json, {
      ...(redact !== undefined ? { redact } : {}),
      ...(acknowledge !== undefined ? { acknowledge } : {}),
    })
    return {
      saved: r.saved,
      ...(r.case ? { id: r.case.id } : {}),
      warnings: r.hits.map((h) => ({ path: h.path, kind: h.kind, text: h.text })),
    }
  },

  'casestudy:review': async ({ projectPath, id, by, note }) =>
    reviewCaseStudy(await requireProject(projectPath), id, { by, note }),
})
