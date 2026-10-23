// Glossary popovers (#229). <Term id="msel">MSEL</Term> renders the word with a small "?"
// button that explains it; <GlossaryButton> opens the whole list. Radix Popover handles focus,
// Escape and outside clicks.
import { BookOpen, CircleHelp } from 'lucide-react'
import { Popover } from 'radix-ui'
import type { ReactNode } from 'react'
import { GLOSSARY, GLOSSARY_IDS, type GlossaryId } from '../lib/glossary'
import './glossary.css'

function Entry({ id, heading }: { id: GlossaryId; heading: 'dt' | 'p' }) {
  const g = GLOSSARY[id]
  const Title = heading
  const Body = heading === 'dt' ? 'dd' : 'p'
  return (
    <>
      <Title className="glossary__term">
        {g.term}
        {'full' in g && <span className="glossary__full"> ({g.full})</span>}
      </Title>
      <Body className="glossary__text">{g.text}</Body>
    </>
  )
}

function Content({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Popover.Portal>
      <Popover.Content
        className="glossary"
        aria-label={label}
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={16}
      >
        {children}
        <Popover.Arrow className="glossary__arrow" />
      </Popover.Content>
    </Popover.Portal>
  )
}

/** A domain word with an explanation one click away. */
export function Term({ id, children }: { id: GlossaryId; children?: ReactNode }) {
  const g = GLOSSARY[id]
  return (
    <span className="term">
      {children ?? g.term}
      <Popover.Root>
        <Popover.Trigger className="term__trigger" aria-label={`What is ${g.term}?`}>
          <CircleHelp size={14} aria-hidden />
        </Popover.Trigger>
        <Content label={`${g.term}: definition`}>
          <Entry id={id} heading="p" />
        </Content>
      </Popover.Root>
    </span>
  )
}

/** "Glossary" button listing every exercise term. */
export function GlossaryButton() {
  return (
    <Popover.Root>
      <Popover.Trigger className="btn">
        <BookOpen size={16} aria-hidden /> Glossary
      </Popover.Trigger>
      <Content label="Glossary">
        <dl className="glossary__list">
          {GLOSSARY_IDS.map((id) => (
            <div key={id}>
              <Entry id={id} heading="dt" />
            </div>
          ))}
        </dl>
      </Content>
    </Popover.Root>
  )
}
