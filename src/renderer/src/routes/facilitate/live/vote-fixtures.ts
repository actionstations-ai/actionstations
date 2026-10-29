// A vote as the renderer receives it, for the component tests.
import type { VoteView } from '@shared/schemas/live'

export function voteView(over: Partial<VoteView> = {}): VoteView {
  return {
    voteId: 'AAAAAAAAAAAAAAAAAAAAAA',
    question: 'Shut down FIDS and go manual, or keep it running?',
    options: [
      { id: 'o1', label: 'Shut down now', count: 7 },
      { id: 'o2', label: 'Keep running', count: 3 },
      { id: 'o3', label: 'Shut down after the next bank', count: 2 },
    ],
    anonymous: true,
    status: 'open',
    openedAt: Date.now() - 48_000,
    voted: 12,
    eligible: 14,
    liveResults: false,
    recorded: false,
    canReopen: false,
    ...over,
  }
}
