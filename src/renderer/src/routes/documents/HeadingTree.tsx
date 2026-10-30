import { clsx } from 'clsx'
import { Badge } from '../../components/ui'
import type { HeadingNode } from './doc-utils'

// Plain nested lists: read-only outline, so no ARIA tree widget (which would need roving focus).
function Level(props: {
  nodes: HeadingNode[]
  depth: number
  counts?: ReadonlyMap<string, number> | undefined
}) {
  const { nodes, depth, counts } = props
  return (
    <ul className={clsx('heading-tree__level', depth === 0 && 'heading-tree__level--root')}>
      {nodes.map((n) => (
        <li key={n.key}>
          <span className={clsx('heading-tree__label', depth === 0 && 'heading-tree__label--root')}>
            {n.label}
          </span>
          {counts?.get(n.key) ? (
            <span className="heading-tree__redlines">
              {' '}
              <Badge tone="info">
                {counts.get(n.key)} proposed {counts.get(n.key) === 1 ? 'change' : 'changes'}
              </Badge>
            </span>
          ) : null}
          {n.children.length > 0 && <Level nodes={n.children} depth={depth + 1} counts={counts} />}
        </li>
      ))}
    </ul>
  )
}

export function HeadingTree(props: {
  nodes: HeadingNode[]
  label: string
  /** Proposed plan edits per heading key (redlineCountsByHeading). */
  counts?: ReadonlyMap<string, number>
}) {
  const { nodes, label, counts } = props
  if (!nodes.length) return <p className="muted">No headings detected yet.</p>
  return (
    <section className="heading-tree" aria-label={label}>
      <Level nodes={nodes} depth={0} counts={counts} />
    </section>
  )
}
