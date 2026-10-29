// Tip of the day on the Projects screen (#443): one short tip from the list bundled with the
// app, a link to the guide section that explains it, and Next tip / Hide / Turn off tips.
// Nothing here makes a request; the guide opens in the OS browser through main, which builds
// the URL from the tip id (the renderer never hands main a URL to open).
import { useEffect, useId, useMemo, type MouseEvent } from 'react'
import { Lightbulb } from 'lucide-react'
import { guideUrl, tipsFor, type Tip } from '@shared/tips'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { focusTarget } from '../../lib/focus'
import { queryClient, useIpcQuery } from '../../lib/query'
import { advance, useTipSession, wrapIndex } from './tip-state'

async function saveTips(tips: { enabled?: boolean; nextIndex?: number }): Promise<void> {
  const next = await call('settings:update', { ui: { tips } })
  queryClient.setQueryData(['settings:get', null], next)
}

/** Remember where the next launch starts. A failed write only means a repeated tip. */
const storePosition = (nextIndex: number) => void saveTips({ nextIndex }).catch(() => undefined)

/** Picks this launch's tip once; later visits to Projects show the same one. */
function useLaunchTip(tips: readonly Tip[], stored: number | undefined): number | null {
  const index = useTipSession((s) => s.index)
  const show = useTipSession((s) => s.show)
  useEffect(() => {
    if (index !== null || stored === undefined || tips.length === 0) return
    const shown = wrapIndex(stored, tips.length)
    show(shown)
    storePosition(advance(shown, tips.length))
  }, [index, stored, tips.length, show])
  return index
}

export function TipCard() {
  const settings = useIpcQuery('settings:get', undefined)
  const info = useIpcQuery('app:info', undefined)
  const hidden = useTipSession((s) => s.hidden)
  const hide = useTipSession((s) => s.hide)
  const show = useTipSession((s) => s.show)
  const headingId = useId()
  const version = info.data?.version
  const tips = useMemo(() => (version ? tipsFor(version) : []), [version])
  const enabled = settings.data?.ui.tips.enabled ?? false
  const index = useLaunchTip(enabled ? tips : [], settings.data?.ui.tips.nextIndex)
  const tip = index === null ? null : tips[wrapIndex(index, tips.length)]
  if (!enabled || hidden || !tip || !info.data) return null

  const next = () => {
    const shown = advance(index ?? 0, tips.length)
    show(shown)
    storePosition(advance(shown, tips.length))
  }
  const leave = () => focusTarget(document.querySelector<HTMLElement>('#main h1'))
  const turnOff = async () => {
    try {
      await saveTips({ enabled: false })
      leave()
      toast.info('Tips are off', 'Turn them on again in Settings.')
    } catch (err) {
      toast.error('Could not turn tips off', err)
    }
  }
  const openGuide = (e: MouseEvent) => {
    e.preventDefault()
    call('help:open-guide', { tipId: tip.id }).catch((err: unknown) =>
      toast.error('Could not open the guide', err),
    )
  }

  return (
    <section className="card tip-card" aria-labelledby={headingId} data-testid="tip-card">
      <h2 id={headingId} className="tip-card__heading">
        <Lightbulb size={16} aria-hidden />
        Tip
      </h2>
      <p className="tip-card__text" aria-live="polite">
        {tip.text}
      </p>
      <div className="tip-card__actions">
        <a
          className="tip-card__link"
          href={guideUrl(tip, info.data.version, info.data.isPackaged)}
          onClick={openGuide}
        >
          Read: {tip.linkLabel}
        </a>
        <div className="row tip-card__buttons">
          {tips.length > 1 && (
            <Button size="sm" onClick={next}>
              Next tip
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              hide()
              leave()
            }}
          >
            Hide
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void turnOff()}>
            Turn off tips
          </Button>
        </div>
      </div>
    </section>
  )
}
