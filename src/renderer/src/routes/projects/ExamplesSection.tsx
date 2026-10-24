// Example projects gallery (#169): fictional, ready-made projects to explore. Opening one
// copies it to a new folder and opens the copy. Examples of enabled packs (#266) are listed
// too, labelled with their pack and its license; the list refreshes on packs:changed.
import { useEffect, useState } from 'react'
import type { ExampleInfo } from '@shared/ipc'
import type { OpenProject } from '@shared/schemas'
import { Badge, Button } from '../../components/ui'
import { ProvenanceBadge } from '../../components/ProvenanceBadge'
import { profileLabel, threatLabel } from '../../lib/domains'
import { subscribe } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { exampleKey, exampleProvenance } from './example-label'
import { OpenExampleDialog } from './OpenExampleDialog'

export function ExampleCard(props: {
  example: ExampleInfo
  onOpen: () => void
  headingLevel?: 'h3' | 'h4'
}) {
  const { example } = props
  const Heading = props.headingLevel ?? 'h3'
  const headingId = `example-${exampleKey(example).replace(/[^A-Za-z0-9_-]/g, '-')}`
  const provenance = exampleProvenance(example)
  return (
    <li className="card project-card example-card" aria-labelledby={headingId}>
      <div className="project-card__title">
        <Heading id={headingId}>{example.title}</Heading>
        <Badge tone="info">{profileLabel(example.domainProfile)}</Badge>
        <Badge tone="warn">Fictional</Badge>
      </div>
      <p>{example.summary}</p>
      {provenance && (
        <p className="muted example-card__pack" data-testid="example-pack">
          <ProvenanceBadge provenance={provenance} />
          {example.packLicense ? ` License ${example.packLicense}` : ''}
        </p>
      )}
      {example.scenarios.length > 0 && (
        <div className="stack example-card__scenarios">
          <span className="field__label">
            {example.scenarios.length === 1 ? 'Scenario' : `${example.scenarios.length} scenarios`}
          </span>
          <ul>
            {example.scenarios.map((s) => (
              <li key={s.id}>
                {s.title} <span className="muted">· {threatLabel(s.threatFamily)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="project-card__footer">
        <span className="muted">Made-up organization and documents</span>
        <Button
          size="sm"
          variant="primary"
          aria-label={`Open a copy of ${example.title}`}
          onClick={props.onOpen}
        >
          Open a copy
        </Button>
      </div>
    </li>
  )
}

/** Example cards plus the open dialog; renders nothing when no example ships. */
export function ExamplesList(props: {
  onOpened: (p: OpenProject) => void
  heading?: string
  headingLevel?: 'h2' | 'h3'
}) {
  const examples = useIpcQuery('examples:list', undefined)
  const [opening, setOpening] = useState<ExampleInfo | null>(null)
  useEffect(
    () =>
      subscribe('packs:changed', () => {
        void queryClient.invalidateQueries({ queryKey: ['examples:list'] })
      }),
    [],
  )
  const list = examples.data ?? []
  if (list.length === 0) return null
  const Heading = props.headingLevel ?? 'h2'
  return (
    <section className="stack" aria-labelledby="examples-heading">
      <Heading id="examples-heading" className="project-list__heading">
        {props.heading ?? 'Examples'}
      </Heading>
      <p className="muted">
        Complete exercises built from fictional organizations&rsquo; documents. Open a copy to see
        how a finished project looks, or to try generation on a domain you know.
      </p>
      <ul className="grid-cards project-list">
        {list.map((e) => (
          <ExampleCard
            key={exampleKey(e)}
            example={e}
            onOpen={() => setOpening(e)}
            headingLevel={Heading === 'h3' ? 'h4' : 'h3'}
          />
        ))}
      </ul>
      <OpenExampleDialog
        example={opening}
        onClose={() => setOpening(null)}
        onOpened={(p) => {
          setOpening(null)
          props.onOpened(p)
        }}
      />
    </section>
  )
}
