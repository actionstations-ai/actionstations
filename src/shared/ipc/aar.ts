// aar:* (#419): the After-Action Report / Improvement Plan draft built from the exercise
// record. The record never leaves the project folder except as the condensed prompt the draft
// job sends to the configured text provider.
import { z } from 'zod'
import { channel } from './define'
import { IsoDateTime, SafeId } from '../schemas/common'
import { Aar, AAR_LIMITS, ExerciseRecord } from '../schemas/aar'

const S = z.object({ projectPath: z.string().min(1), scenarioId: SafeId })

/** One live-play session folder under scenarios/<id>/live/ (spec 0417), for the draft dialog. */
export const LiveSessionInfo = z.object({
  id: SafeId,
  startedAt: IsoDateTime.optional(),
  endedAt: IsoDateTime.optional(),
  entries: z.number().int().nonnegative(),
})
export type LiveSessionInfo = z.infer<typeof LiveSessionInfo>

export const aarChannels = {
  /** The stored draft, or null before the first one. */
  'aar:get': channel(S, Aar.nullable()),
  /** Start the draft job (kind draft-aar); it owns the scenario while it runs. */
  'aar:draft': channel(
    S.extend({
      instructions: z.string().max(AAR_LIMITS.instructions).optional(),
      /** The live session to read; the most recent ended one when absent. */
      sessionId: SafeId.optional(),
    }),
    z.object({ jobId: SafeId }),
  ),
  /** Save a person's edits (ratings, plan rows, organizations); CONFLICT on a stale base. */
  'aar:save': channel(S.extend({ aar: Aar, baseUpdatedAt: IsoDateTime.optional() }), Aar),
  /** The exercise record, identities removed, for the editor's evidence drawer. */
  'aar:record': channel(S.extend({ sessionId: SafeId.optional() }), ExerciseRecord),
  /** Live sessions the record can be read from, most recent first. */
  'aar:sessions': channel(S, z.array(LiveSessionInfo)),
}
