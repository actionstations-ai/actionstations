// Notice shown inside a project opened from an example (#169): the example's own banner text
// from the `.example.json` marker copied into the project. Ordinary projects show nothing.
import { Info } from 'lucide-react'
import { useIpcQuery } from '../lib/query'
import './domain.css'

export function ExampleBanner({ projectPath }: { projectPath: string }) {
  const marker = useIpcQuery('examples:marker', { projectPath }, { enabled: !!projectPath })
  const m = marker.data
  if (!m) return null
  return (
    <aside className="example-banner" aria-label="Example project" data-testid="example-banner">
      <Info size={16} aria-hidden />
      <p>
        <strong>Example: {m.title}.</strong> {m.notice}
      </p>
    </aside>
  )
}
