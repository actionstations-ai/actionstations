// Upgrade caveats for this installed version and platform (#442), for example the uninstall
// step Windows users of 0.5.0 need. Highlighted, with the reason in words, not only colour.
import { TriangleAlert } from 'lucide-react'

export function UpgradeNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null
  return (
    <div className="update-notes">
      <TriangleAlert size={16} aria-hidden />
      <div>
        <strong>Before you install:</strong>
        {notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </div>
    </div>
  )
}
