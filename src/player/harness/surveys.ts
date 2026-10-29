/**
 * The surveys half of the scripted facilitator (spec 0422): what `src/main/live/surveys.ts`
 * does for the real app, small enough for the player page's tests. It opens a survey to
 * every device, takes one answer set per device (a second replaces the first) and keeps the
 * answers without the sender. Development and tests only.
 */
import { toBase64Url } from '../../shared/live/bytes'
import type { Opened } from '../../shared/live/codec'
import type { SurveyOpenPayload } from '../../shared/live/schemas'
import type { HarnessController } from './controller'

export interface HarnessSurveyDefinition {
  title: string
  intro?: string
  questions: SurveyOpenPayload['questions']
  targets?: SurveyOpenPayload['targets']
}

export class HarnessSurveys {
  /** Delivery id of each survey opened. */
  readonly opened: string[] = []
  private readonly isOpen = new Set<string>()
  /** Device id to its answers, per delivery. Only the answers are readable through `responses`. */
  private readonly byDevice = new Map<
    string,
    Map<string, Opened<'survey.response'>['payload']['answers']>
  >()

  constructor(private readonly c: HarnessController) {}

  async open(def: HarnessSurveyDefinition): Promise<string> {
    const surveyId = toBase64Url(this.c.crypto.random(16))
    this.opened.push(surveyId)
    this.isOpen.add(surveyId)
    this.byDevice.set(surveyId, new Map())
    const targets = def.targets ?? ['all']
    for (const to of targets) {
      await this.c.client.send(
        'survey.open',
        to as never,
        {
          surveyId,
          title: def.title,
          ...(def.intro ? { intro: def.intro } : {}),
          questions: def.questions,
          anonymous: true,
          targets,
        } as never,
        { key: 'players', sign: true },
      )
    }
    return surveyId
  }

  async close(surveyId: string): Promise<void> {
    this.isOpen.delete(surveyId)
    await this.c.client.send('survey.close', 'all', { surveyId }, { key: 'players', sign: true })
  }

  onResponse(m: Opened<'survey.response'>): void {
    const answers = this.byDevice.get(m.payload.surveyId)
    if (!answers || !this.isOpen.has(m.payload.surveyId) || m.to !== 'controller') return
    answers.set(m.from, m.payload.answers)
  }

  /** The answers received, one set per device, with nothing that says whose. */
  responses(surveyId: string): Opened<'survey.response'>['payload']['answers'][] {
    return [...(this.byDevice.get(surveyId)?.values() ?? [])]
  }
}
