// Example projects (#169): list the shipped examples and those of enabled packs (#266), open a
// copy of one, read the marker.
import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { listAllExamples } from '../../examples/catalog'
import { markerView, readMarker } from '../../examples/marker'
import { openExample } from '../../examples/open'

export default defineHandlers({
  'examples:list': () => listAllExamples(),

  // No project guard: the copy does not exist yet; openExample registers it like project:create.
  'examples:open': ({ slug, packId, parentDir }) => openExample({ slug, packId }, parentDir),

  'examples:marker': async ({ projectPath }) => {
    const root = await requireProject(projectPath)
    const marker = await readMarker(root)
    return marker && markerView(marker)
  },
})
