import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { Inject } from '../schemas/inject'

const S = z.object({ projectPath: z.string().min(1), scenarioId: SafeId })
const I = S.extend({ injectId: SafeId })
const JobRef = z.object({ jobId: SafeId })

export const LibraryItem = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  title: z.string(),
  fields: z.record(z.string(), z.unknown()),
  instructorNote: z.string().optional(),
  savedAt: z.string(),
})
export type LibraryItem = z.infer<typeof LibraryItem>

export const injectChannels = {
  'injects:list': channel(S, z.array(Inject)),
  'injects:get': channel(I, Inject),
  'injects:save': channel(S.extend({ inject: Inject, note: z.string().optional() }), Inject),
  'injects:create': channel(S.extend({ mselRowId: SafeId, type: z.string() }), Inject),
  'injects:delete': channel(I, z.void()),
  'injects:regenerate-text': channel(I.extend({ instructions: z.string().optional() }), JobRef),
  'injects:regenerate-media': channel(
    I.extend({ paths: z.array(z.enum(['template', 'ai_image', 'ai_video', 'tts'])).optional() }),
    JobRef,
  ),
  'injects:restore-version': channel(
    I.extend({ versionIndex: z.number().int().nonnegative() }),
    Inject,
  ),
  'library:list': channel(z.void(), z.array(LibraryItem)),
  'library:save': channel(I.extend({ name: z.string().min(1) }), LibraryItem),
  'library:delete': channel(z.object({ id: SafeId }), z.void()),
  'library:insert': channel(S.extend({ libraryId: SafeId, mselRowId: SafeId }), Inject),
}
