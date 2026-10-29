// A join link with its QR code and a Copy button (spec 0407 Renderer). Shared by the LAN and the
// remote running panels.
import type { InviteView } from '@shared/schemas/live'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { QrCode } from './QrCode'
import { LIVE } from './strings'

export function InviteCard(props: {
  title: string
  invite: InviteView
  help?: string
  size?: number
}) {
  const { url } = props.invite
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(LIVE.copied)
    } catch {
      toast.error('Could not copy the link', new Error('Clipboard unavailable'))
    }
  }
  return (
    <section className="live-invite" aria-label={props.title}>
      <h3 className="live-invite__title">{props.title}</h3>
      {props.help && <p className="muted live-invite__help">{props.help}</p>}
      <div className="live-invite__body">
        <QrCode qr={props.invite.qr} label={LIVE.qrAlt(url)} size={props.size} />
        <div className="live-invite__link">
          <code className="live-invite__url">{url}</code>
          <Button size="sm" onClick={() => void copy()}>
            {LIVE.copyLink}
          </Button>
        </div>
      </div>
    </section>
  )
}
