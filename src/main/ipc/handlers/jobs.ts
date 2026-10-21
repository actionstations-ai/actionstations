import { defineHandlers } from '../registry'
import { jobs } from '../../jobs/manager'
import { AppError } from '../../lib/errors'

export default defineHandlers({
  'jobs:list': ({ projectPath, activeOnly }) =>
    jobs.list({ ...(projectPath ? { projectPath } : {}), activeOnly }),
  'jobs:get': ({ jobId }) => jobs.get(jobId),
  'jobs:cancel': ({ jobId }) => jobs.cancel(jobId),
  'jobs:log': ({ jobId }) => jobs.logOf(jobId),
  'jobs:resume': () => {
    throw new AppError(
      'NOT_IMPLEMENTED',
      'Resume is provided by the generation pipeline (generate:continue)',
    )
  },
})
