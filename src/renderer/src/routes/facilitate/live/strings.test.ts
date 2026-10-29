// The three "what this sends and where" statements are shown on screen and pasted into the live
// play guide; they must be the same words (spec 0410, Security: misleading disclosure).
import { describe, expect, it } from 'vitest'
import { CONNECTION } from './strings'

const GUIDES = import.meta.glob('/docs/guides/live-play.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const guide = GUIDES['/docs/guides/live-play.md'] ?? ''
const fenced = [...guide.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1])

describe('connection statements', () => {
  it.each([
    ['This computer', CONNECTION.lan.statement],
    ['Action Stations relay', CONNECTION.relay.statement],
    ['Your server', CONNECTION.selfHosted.statement],
  ])('the guide repeats the statement for %s word for word', (_name, statement) => {
    expect(fenced).toContain(statement)
  })

  it('names the relay host the app connects to', () => {
    expect(CONNECTION.relay.statement).toContain('relay.actionstations.ai')
  })
})
