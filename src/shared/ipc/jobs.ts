import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { Job } from '../schemas/job'

const JobRef = z.object({ jobId: SafeId })

export const JobLogEntry = z.object({
  at: z.string(),
  level: z.enum(['info', 'warn', 'error']),
  stage: z.string().optional(),
  itemId: z.string().optional(),
  message: z.string(),
})
export type JobLogEntry = z.infer<typeof JobLogEntry>

export const jobChannels = {
  'jobs:list': channel(
    z.object({ projectPath: z.string().optional(), activeOnly: z.boolean().default(false) }),
    z.array(Job),
  ),
  'jobs:get': channel(JobRef, Job),
  'jobs:cancel': channel(JobRef, z.void()),
  'jobs:resume': channel(JobRef, JobRef),
  'jobs:log': channel(
    JobRef,
    z.object({ entries: z.array(JobLogEntry), tokens: z.record(z.string(), z.string()) }),
  ),
}
