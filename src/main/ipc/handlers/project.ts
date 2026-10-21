import { defineHandlers } from '../registry'
import { getSettings } from '../../settings/store'

// Project store handlers (#10) extend this module.
export default defineHandlers({
  'project:list-recent': async () => (await getSettings()).recentProjects,
})
