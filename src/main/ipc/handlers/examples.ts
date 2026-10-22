// Example projects (#169): list the shipped examples, open a copy of one, read the marker.
import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { listExamples } from '../../examples/catalog'
import { readMarker } from '../../examples/marker'
import { openExample } from '../../examples/open'

export default defineHandlers({
  'examples:list': () => listExamples(),

  // No project guard: the copy does not exist yet; openExample registers it like project:create.
  'examples:open': ({ slug, parentDir }) => openExample(slug, parentDir),

  'examples:marker': async ({ projectPath }) => {
    const root = await requireProject(projectPath)
    return readMarker(root)
  },
})
