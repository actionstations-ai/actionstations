// A certificate fingerprint grouped in pairs so it can be read aloud and compared (spec 0410
// NFR-3). The text is selectable; Copy puts the plain colon-separated form on the clipboard.
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { CONNECTION } from './strings'

export function FingerprintView({ value }: { value: string }) {
  const pairs = value.split(':')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(CONNECTION.selfHosted.copied)
    } catch {
      toast.error('Could not copy the fingerprint', new Error('Clipboard unavailable'))
    }
  }
  return (
    <div className="live-fingerprint-view">
      <span className="field__label">{CONNECTION.selfHosted.fingerprint}</span>
      <code className="live-fingerprint-view__pairs">
        {pairs.map((p, i) => (
          <span key={i} className="live-fingerprint-view__pair">
            {p}{' '}
          </span>
        ))}
      </code>
      <Button type="button" size="sm" onClick={() => void copy()}>
        {CONNECTION.selfHosted.copy}
      </Button>
    </div>
  )
}
