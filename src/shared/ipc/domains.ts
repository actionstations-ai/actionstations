// Domain profiles over IPC (ADR-0018, #263): the renderer lists built-in and pack profiles
// from main, which fills the registry from the enabled packs.
import { z } from 'zod'
import { channel } from './define'
import { DomainProfile } from '../domains/schema'

export const ProfileSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin') }),
  z.object({
    kind: z.literal('pack'),
    packId: z.string(),
    packVersion: z.string(),
    packName: z.string(),
  }),
])

export const ListedDomainProfile = z.object({ profile: DomainProfile, source: ProfileSourceSchema })
export type ListedDomainProfile = z.infer<typeof ListedDomainProfile>

/** Pushed when the set of pack profiles changes (install, enable, disable, uninstall). */
export const DomainsChangedEvent = z.object({ packProfiles: z.number().int().nonnegative() })

export const domainChannels = {
  /** Built-in profiles (picker order), then the profiles of enabled packs, with their source. */
  'domains:list': channel(z.void(), z.array(ListedDomainProfile)),
}
