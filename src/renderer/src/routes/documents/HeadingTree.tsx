import { clsx } from 'clsx'
import type { HeadingNode } from './doc-utils'

// Plain nested lists: read-only outline, so no ARIA tree widget (which would need roving focus).
function Level({ nodes, depth }: { nodes: HeadingNode[]; depth: number }) {
  return (
    <ul className={clsx('heading-tree__level', depth === 0 && 'heading-tree__level--root')}>
      {nodes.map((n) => (
        <li key={n.key}>
          <span className={clsx('heading-tree__label', depth === 0 && 'heading-tree__label--root')}>
            {n.label}
          </span>
          {n.children.length > 0 && <Level nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

export function HeadingTree({ nodes, label }: { nodes: HeadingNode[]; label: string }) {
  if (!nodes.length) return <p className="muted">No headings detected yet.</p>
  return (
    <section className="heading-tree" aria-label={label}>
      <Level nodes={nodes} depth={0} />
    </section>
  )
}
