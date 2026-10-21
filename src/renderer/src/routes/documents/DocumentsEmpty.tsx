import { FileUp } from 'lucide-react'
import { Button, EmptyState } from '../../components/ui'

export function DocumentsEmpty({ onImport }: { onImport: () => void }) {
  return (
    <EmptyState
      title="No documents yet"
      body={
        <>
          Import the material your exercises should draw on and cite: emergency and incident
          response plans, security policies, terminal and airfield maps, ICS forms, and course
          material. PDF, Word, PowerPoint, Excel, Markdown, HTML and scanned images all work. Each
          file is copied into this project&rsquo;s <code>documents/</code> folder, so the project
          stays self-contained. You can also drop files anywhere on this window.
        </>
      }
      actions={
        <Button variant="primary" onClick={onImport}>
          <FileUp size={16} aria-hidden /> Import documents…
        </Button>
      }
    />
  )
}
