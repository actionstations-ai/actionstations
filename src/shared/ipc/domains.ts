// Domain profiles over IPC (ADR-0018 #263, ADR-0020 #314): the renderer lists the bundled and
// installed pack profiles from main, which fills the registry from the packs.
import { z } from 'zod'
import { channel } from './define'
import { DomainProfile } from '../domains/schema'

export const ProfileSourceSchema = z.discriminatedUnion('kind', [
  /** A pack included with the app; `enabled` false: hidden from the picker, still resolves. */
  z.object({
    kind: z.literal('bundled'),
    packId: z.string(),
    packVersion: z.string(),
    packName: z.string(),
    enabled: z.boolean(),
  }),
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
  /** Bundled profiles (picker order, enabled or not), then enabled installed packs', with source. */
  'domains:list': channel(z.void(), z.array(ListedDomainProfile)),
}
