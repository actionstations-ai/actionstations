// What an item of a pack names that this app cannot find (toolkit figure, connector, metric and
// lint rule ids; domain inject types). The pack still installs; these items do nothing.
import { Badge } from '../../components/ui'

export function ItemWarnings({ warnings }: { warnings: readonly string[] | undefined }) {
  if (!warnings || warnings.length === 0) return null
  return (
    <>
      <Badge tone="warn">Names things this app lacks</Badge>
      <ul className="pack-item-warnings muted">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </>
  )
}
