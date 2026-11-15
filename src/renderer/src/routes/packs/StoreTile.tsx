// Store tiles (#1152): a pack's icon, name, kind and category, and its state, as one button that
// opens the pack's page.
import { clsx } from 'clsx'
import { STORE_KIND_LABEL, monogram } from '@shared/packs/store'
import { stateLabel, type StorePack } from './store-model'

export function PackIcon(props: { pack: Pick<StorePack, 'name' | 'category'>; size?: 'lg' }) {
  return (
    <span
      className={clsx('pack-icon', props.size === 'lg' && 'pack-icon--lg')}
      data-category={props.pack.category.id}
      aria-hidden="true"
    >
      {monogram(props.pack.name)}
    </span>
  )
}

export function StatePill({ pack }: { pack: StorePack }) {
  const s = pack.state
  const tone =
    s.kind === 'available' || s.kind === 'update'
      ? 'action'
      : s.kind === 'broken'
        ? 'error'
        : (s.kind === 'included' || s.kind === 'installed') && !s.enabled
          ? 'off'
          : 'on'
  return (
    <span className="pack-pill" data-tone={tone}>
      {stateLabel(s)}
    </span>
  )
}

export function StoreTile(props: { pack: StorePack; onOpen: (id: string) => void }) {
  const p = props.pack
  return (
    <li className="pack-tile">
      <button type="button" className="pack-tile__button" onClick={() => props.onOpen(p.id)}>
        <PackIcon pack={p} />
        <span className="pack-tile__text">
          <span className="pack-tile__name">{p.name}</span>
          <span className="pack-tile__sub">
            {STORE_KIND_LABEL[p.kind].one} · {p.category.label}
          </span>
          <span className="pack-tile__summary">{p.summary}</span>
          <StatePill pack={p} />
        </span>
      </button>
    </li>
  )
}

export function TileGrid(props: {
  packs: readonly StorePack[]
  label: string
  onOpen: (id: string) => void
}) {
  return (
    <ul className="pack-tiles" aria-label={props.label}>
      {props.packs.map((p) => (
        <StoreTile key={p.id} pack={p} onOpen={props.onOpen} />
      ))}
    </ul>
  )
}
