import { Search } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import type { SearchHit } from '@shared/schemas/document'
import { Button, EmptyState, PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { highlightSegments, queryTerms, snippet, stripMarkdown } from './highlight'
import './search.css'
import { errorText } from '../../lib/errors'

type Mode = 'hybrid' | 'fts' | 'vector'
const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: 'hybrid', label: 'Hybrid', hint: 'Keyword and vector ranks fused' },
  { value: 'fts', label: 'Keyword', hint: 'SQLite FTS5 BM25 only' },
  { value: 'vector', label: 'Vector', hint: 'Embedding similarity only' },
]

const clampK = (raw: string) => Math.min(100, Math.max(1, Math.round(Number(raw)) || 10))

interface SearchParams {
  query: string
  mode: Mode
  k: number
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightSegments(text, terms).map((s, i) =>
        s.match ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>,
      )}
    </>
  )
}

function HitCard({ hit, terms, rank }: { hit: SearchHit; terms: string[]; rank: number }) {
  return (
    <li className="hit card">
      <div className="hit__head">
        <span className="hit__rank">{rank}</span>
        <h2 className="hit__heading">{hit.headingPath || 'Untitled section'}</h2>
      </div>
      <p className="hit__source">
        {hit.documentTitle}
        {hit.page ? ` · p. ${hit.page}` : ''}
      </p>
      <dl className="hit__scores">
        <div>
          <dt>Score</dt>
          <dd>{hit.score.toFixed(4)}</dd>
        </div>
        <div>
          <dt>FTS rank</dt>
          <dd>{hit.ftsRank ?? '—'}</dd>
        </div>
        <div>
          <dt>Vector rank</dt>
          <dd>{hit.vecRank ?? '—'}</dd>
        </div>
      </dl>
      <p className="hit__text">
        <Highlighted text={snippet(stripMarkdown(hit.text), terms)} terms={terms} />
      </p>
    </li>
  )
}

function SearchForm({ onSearch }: { onSearch: (p: SearchParams) => void }) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('hybrid')
  // Kept as text so the field can be cleared while typing; clamped on blur and submit.
  const [k, setK] = useState('10')
  const ids = useId()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim()) onSearch({ query: query.trim(), mode, k: clampK(k) })
  }
  return (
    <form className="search-form" role="search" onSubmit={submit}>
      <div className="field search-form__query">
        <label className="field__label" htmlFor={`${ids}-q`}>
          Query
        </label>
        <input
          id={`${ids}-q`}
          className="input"
          type="search"
          value={query}
          placeholder="e.g. manual baggage procedures when BHS fails"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <fieldset className="segmented">
        <legend className="field__label">Mode</legend>
        {MODES.map((m) => (
          <label key={m.value} className="segmented__option" title={m.hint}>
            <input
              type="radio"
              name={`${ids}-mode`}
              value={m.value}
              checked={mode === m.value}
              onChange={() => setMode(m.value)}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </fieldset>
      <div className="field search-form__k">
        <label className="field__label" htmlFor={`${ids}-k`}>
          Results (k)
        </label>
        <input
          id={`${ids}-k`}
          className="input"
          type="number"
          min={1}
          max={100}
          value={k}
          onChange={(e) => setK(e.target.value)}
          onBlur={() => setK(String(clampK(k)))}
        />
      </div>
      <Button type="submit" variant="primary" disabled={!query.trim()}>
        <Search size={16} aria-hidden /> Search
      </Button>
    </form>
  )
}

function Results({ projectPath, params }: { projectPath: string; params: SearchParams }) {
  const hits = useIpcQuery('retrieve:search', { projectPath, ...params })
  const terms = queryTerms(params.query)
  if (hits.isPending) return <p className="muted">Searching…</p>
  if (hits.isError)
    return (
      <p className="field__error" role="alert">
        Search failed: {errorText(hits.error)}
      </p>
    )
  if (!hits.data.length)
    return (
      <EmptyState
        title="No matches"
        body="Nothing in this project's index matched. Check that documents finished ingesting, or try Keyword mode for exact terms."
        actions={
          <Link className="btn" to={`/p/${projectKey(projectPath)}/documents`}>
            Check documents
          </Link>
        }
      />
    )
  return (
    <ol className="hits" aria-label={`${hits.data.length} results`}>
      {hits.data.map((h, i) => (
        <HitCard key={h.chunkId} hit={h} terms={terms} rank={i + 1} />
      ))}
    </ol>
  )
}

export default function SearchPage() {
  const projectPath = fromProjectKey(useParams().projectKey ?? '')
  const [params, setParams] = useState<SearchParams | null>(null)
  return (
    <div className="page search-page">
      <PageHeader
        eyebrow="Advanced"
        title="Search index"
        description="Query the project index the way the generator does, to check what each stage will retrieve and cite."
      />
      <SearchForm onSearch={setParams} />
      {params ? (
        <Results projectPath={projectPath} params={params} />
      ) : (
        <EmptyState
          title="Search this project's documents"
          body="Results show the heading path, source document, page and the fused and per-mode ranks for each chunk."
        />
      )}
    </div>
  )
}
