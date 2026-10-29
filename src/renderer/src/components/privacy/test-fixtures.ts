// Test-only: a manifest like the one main builds for one stage call (#433).
import type { OutboundManifest } from '@shared/schemas'

const excerptText = 'Call [[PERSON_7F3K]] at [[PHONE_Q2MA]] before opening the EOC.'

export function manifest(over: Partial<OutboundManifest> = {}): OutboundManifest {
  return {
    requestId: 'R1',
    requestHash: 'hash-abc',
    jobId: 'J1',
    projectPath: '/p',
    kind: 'chat',
    providerId: 'anth',
    providerLabel: 'Anthropic',
    host: 'api.anthropic.com',
    model: 'claude-test',
    task: 'draft',
    stage: 'msel',
    review: 'new-excerpts',
    excerpts: [
      {
        chunkId: 11,
        documentId: 'D1',
        documentTitle: 'Emergency Operations Plan',
        headingPath: 'Annex B > Notifications',
        page: 4,
        chars: excerptText.length,
        text: excerptText,
      },
      {
        chunkId: 12,
        documentId: 'D1',
        documentTitle: 'Emergency Operations Plan',
        headingPath: 'Annex C > Shelters',
        chars: 20,
        text: 'Open shelters early.',
      },
      {
        chunkId: 30,
        documentId: 'D2',
        documentTitle: 'Water System Plan',
        headingPath: 'Pumps',
        chars: 14,
        text: 'Pump 3 is old.',
      },
    ],
    parts: [{ name: 'system', chars: 18, text: 'You write exercises' }],
    redactions: { person: 1, phone: 1 },
    spans: [
      {
        part: 'excerpt:11',
        start: 5,
        end: 20,
        category: 'person',
        placeholder: '[[PERSON_7F3K]]',
        original: 'Dana Ruiz',
      },
      {
        part: 'excerpt:11',
        start: 24,
        end: 38,
        category: 'phone',
        placeholder: '[[PHONE_Q2MA]]',
        original: '(509) 555-0142',
      },
    ],
    totalChars: 120,
    estimatedTokens: 30,
    redactable: true,
    createdAt: '2026-10-28T10:00:00.000Z',
    ...over,
  }
}
