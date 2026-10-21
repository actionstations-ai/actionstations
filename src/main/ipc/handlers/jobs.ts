import { defineHandlers } from '../registry'
import { jobs } from '../../jobs/manager'

export default defineHandlers({
  'jobs:list': ({ projectPath, activeOnly }) =>
    jobs.list({ ...(projectPath ? { projectPath } : {}), activeOnly }),
  'jobs:get': ({ jobId }) => jobs.get(jobId),
  'jobs:cancel': ({ jobId }) => jobs.cancel(jobId),
  'jobs:log': ({ jobId }) => jobs.logOf(jobId),
  // Resumers are registered by the pipeline (ipc/handlers/generate.ts → generate:continue).
  'jobs:resume': async ({ jobId }) => ({ jobId: (await jobs.resume(jobId)).id }),
})
