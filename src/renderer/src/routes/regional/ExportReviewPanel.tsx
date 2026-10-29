// What will leave this computer (spec 0440 FR-12): files, the fields per row, rows that cite the
// plans, private rows with their placeholders, and the size.
import type { ExportReview } from '@shared/ipc/regional'

const kb = (n: number): string => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`)

export function ExportReviewPanel(props: {
  review: ExportReview
  onSave: () => void
  onCancel: () => void
}) {
  const r = props.review
  return (
    <div className="stack" role="region" aria-labelledby="export-review-title">
      <h3 id="export-review-title">What this {r.kind} bundle contains</h3>
      <p>
        {r.files.length} files, {kb(r.totalBytes)}. Nothing else is sent: no plan documents, search
        index, facility facts, prompts, provider settings or history.
      </p>
      <p>Fields sent for each row: {r.rowFields.join(', ')}.</p>
      {r.citingItems.length > 0 ? (
        <div>
          <p>
            These items cite your plans.{' '}
            {r.sharesQuotes
              ? 'Quotes and page numbers are included.'
              : 'Only the document title and heading are included.'}{' '}
            Edit them before sending if needed.
          </p>
          <ul className="regional-list">
            {r.citingItems.map((c) => (
              <li key={`${c.kind}-${c.id}`}>
                {c.kind === 'row' ? 'Row' : 'Inject'} {c.id}: {c.citations} citations
                {r.sharesQuotes && c.withQuotes > 0 ? `, ${c.withQuotes} with quotes` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>No row or inject cites your plans.</p>
      )}
      {r.privateRows.length > 0 && (
        <div>
          <p>Private to your controllers: partners see only a placeholder.</p>
          <ul className="regional-list">
            {r.privateRows.map((p) => (
              <li key={p.id}>
                {p.id}: “{p.publicSummary}”
              </li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary>Files ({r.files.length})</summary>
        <ul className="regional-list">
          {r.files.map((f) => (
            <li key={f.path}>
              {f.path} ({kb(f.size)})
            </li>
          ))}
        </ul>
      </details>
      <div className="row">
        <button type="button" className="btn btn--primary" onClick={props.onSave}>
          Save bundle…
        </button>
        <button type="button" className="btn" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
