import { z } from 'zod'
import { SemVer } from '../schemas/pack'

/** A guide section: a Markdown file under docs/guides/ plus a required heading anchor. */
export const TipGuide = z
  .string()
  .max(200)
  .regex(
    /^docs\/guides\/(?:[a-z0-9-]+\/)*[A-Za-z0-9-]+\.md#[a-z0-9-]+$/,
    'Expected docs/guides/<file>.md#<anchor>',
  )

/** One tip of the day (#443). Ids are never reused, so a removed tip's id stays retired. */
export const Tip = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  /** Plain text, one or two sentences. Rendered as text, never as Markdown or HTML. */
  text: z.string().min(1).max(220),
  guide: TipGuide,
  /**
   * The guide section's name, shown as the link "Read: <linkLabel>". Required so the link
   * text says where it goes (WCAG 2.4.4) instead of a generic "Read the guide".
   */
  linkLabel: z.string().min(1).max(40),
  /** The app version that introduced the feature; newer tips are skipped on older apps. */
  since: SemVer.optional(),
})
export type Tip = z.infer<typeof Tip>

export const TipList = z.array(Tip)
