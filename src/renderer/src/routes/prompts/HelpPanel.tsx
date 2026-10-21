import type { PromptFrontmatter } from '@shared/schemas/prompt'
import {
  BUILTIN_HELP,
  MARKER_NOTE,
  PROMPT_HELPER_HELP,
  SECTION_MARKERS,
  type HelpItem,
} from './help'
import { stageLabel } from './prompt-utils'

function HelpList({ items }: { items: HelpItem[] }) {
  return (
    <dl className="prompt-help__list">
      {items.map((item) => (
        <div key={item.name}>
          <dt className="mono">{item.usage}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HelpPanel({ frontmatter }: { frontmatter: PromptFrontmatter }) {
  return (
    <aside className="prompt-help" aria-label="Prompt reference">
      <section>
        <h3>Variables for {stageLabel(frontmatter.stage)}</h3>
        {frontmatter.variables.length ? (
          <ul className="prompt-help__vars">
            {frontmatter.variables.map((v) => (
              <li key={v} className="mono">{`{{${v}}}`}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">This prompt declares no variables.</p>
        )}
      </section>
      <section>
        <h3>Section markers</h3>
        <p className="muted">{MARKER_NOTE}</p>
        <HelpList items={SECTION_MARKERS} />
      </section>
      <section>
        <h3>Helpers</h3>
        <HelpList items={PROMPT_HELPER_HELP} />
        <p className="muted">{BUILTIN_HELP}</p>
      </section>
    </aside>
  )
}
