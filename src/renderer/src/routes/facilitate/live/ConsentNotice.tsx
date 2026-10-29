// The first time a scenario uses the relay or a server, repeat what leaves the computer and ask to
// continue (spec 0410 FR-7). Nothing is contacted before this is confirmed.
import { Button } from '../../../components/ui'
import { CONNECTION } from './strings'

export function ConsentNotice(props: {
  kind: 'relay' | 'self-hosted'
  busy: boolean
  onContinue: () => void
}) {
  const statement =
    props.kind === 'relay' ? CONNECTION.relay.statement : CONNECTION.selfHosted.statement
  return (
    <section className="live-note" aria-labelledby="live-consent-title">
      <h3 id="live-consent-title" className="live-note__title">
        {CONNECTION.consent.title}
      </h3>
      <p>{statement}</p>
      <p>{props.kind === 'relay' ? CONNECTION.consent.relay : CONNECTION.consent.selfHosted}</p>
      <Button type="button" disabled={props.busy} onClick={props.onContinue}>
        {CONNECTION.consent.continue}
      </Button>
    </section>
  )
}
