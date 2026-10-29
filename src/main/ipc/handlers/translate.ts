// translate:* and project:glossary:set (spec 0435). Text goes only to the provider routed to
// `translate` (the drafting route when unset); a person's save marks an item reviewed.
import { requireProject } from '../../project/guard'
import { defineHandlers } from '../registry'
import {
  accept,
  itemText,
  saveItem,
  setGlossary,
  setLanguages,
  start,
  statusFor,
} from '../../translate/service'

export default defineHandlers({
  'translate:status': async ({ projectPath, scenarioId, lang }) =>
    statusFor(await requireProject(projectPath), scenarioId, lang),

  'translate:get-item': async ({ projectPath, scenarioId, lang, item }) =>
    itemText(await requireProject(projectPath), scenarioId, lang, item),

  'translate:run': async ({ projectPath, scenarioId, lang, items, retranslate }) => ({
    jobId: start(await requireProject(projectPath), scenarioId, lang, items, retranslate),
  }),

  'translate:save-item': async ({ projectPath, scenarioId, lang, item, markdown, title, fields }) =>
    saveItem(await requireProject(projectPath), scenarioId, lang, {
      item,
      markdown,
      title,
      fields,
    }),

  'translate:accept': async ({ projectPath, scenarioId, lang, items }) => ({
    accepted: await accept(await requireProject(projectPath), scenarioId, lang, items),
  }),

  'translate:set-languages': async ({ projectPath, scenarioId, languages }) =>
    setLanguages(await requireProject(projectPath), scenarioId, languages),

  'project:glossary:set': async ({ projectPath, lang, entries }) =>
    setGlossary(await requireProject(projectPath), lang, entries),
})
